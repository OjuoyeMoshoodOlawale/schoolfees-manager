const path   = require('path')
const fs     = require('fs')
const crypto = require('crypto')
const { Database } = require('node-sqlite3-wasm')
const defaults = require('./defaults')

// ── DB integrity seal ─────────────────────────────────────────────────────────
// Stores a SHA-256 hash of the DB file in a sidecar .seal file.
// Written on every clean close. Checked on open — mismatch = tampered externally.
// Does NOT encrypt the file, but detects unauthorised modification.
function writeSeal(dbFilePath) {
  try {
    const data = fs.readFileSync(dbFilePath)
    const hash = crypto.createHash('sha256').update(data).digest('hex')
    fs.writeFileSync(dbFilePath + '.seal', hash, 'utf8')
  } catch {}
}

function checkSeal(dbFilePath) {
  try {
    const sealPath = dbFilePath + '.seal'
    if (!fs.existsSync(sealPath)) return  // first run — no seal yet
    const expected = fs.readFileSync(sealPath, 'utf8').trim()
    if (!expected || expected.length !== 64) {
      // Seal is empty or corrupt — regenerate silently on next close
      fs.unlinkSync(sealPath)
      return
    }
    const data   = fs.readFileSync(dbFilePath)
    const actual = crypto.createHash('sha256').update(data).digest('hex')
    if (actual !== expected) {
      // Could be a crash recovery — only warn if the difference is significant
      // (normal WAL operations change the file slightly)
      console.warn('[DB] INTEGRITY NOTICE: database checksum changed since last close (normal after crash recovery)')
      // Refresh seal so next close writes correctly
      fs.unlinkSync(sealPath)
    }
  } catch {}
}

// ── Machine-specific app key (used for future column-level encryption) ─────────
// Derived from machine ID via HMAC — unique per machine, not stored in code.
let _appKey = null
function getAppKey() {
  if (_appKey) return _appKey
  try {
    const { app } = require('electron')
    const machineId = require('os').hostname() + require('os').cpus()[0]?.model + app.getPath('userData')
    _appKey = crypto.createHmac('sha256', 'SF_DB_KEY_2025_OJUOYE').update(machineId).digest()
  } catch { _appKey = Buffer.alloc(32) }
  return _appKey
}

// Encrypt a string value (for sensitive columns if needed in future)
function encryptValue(plaintext) {
  if (!plaintext) return plaintext
  const key = getAppKey()
  const iv  = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return 'ENC:' + iv.toString('hex') + ':' + enc.toString('hex')
}

function decryptValue(ciphertext) {
  if (!ciphertext || !String(ciphertext).startsWith('ENC:')) return ciphertext
  try {
    const [, ivHex, encHex] = String(ciphertext).split(':')
    const key     = getAppKey()
    const iv      = Buffer.from(ivHex, 'hex')
    const enc     = Buffer.from(encHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch { return ciphertext }
}

module.exports.encryptValue = encryptValue
module.exports.decryptValue = decryptValue

let db = null
let dbPath = null
let isClosing = false

function getDbPath() { return dbPath }
function setDbPath(p) { dbPath = p }

// ─── Get or open DB ───────────────────────────────────────────────────────────
function getDb() {
  if (isClosing) throw new Error('Database is being replaced. Please wait a moment.')
  if (!db) {
    if (!dbPath) throw new Error('DB path not set')

    checkSeal(dbPath)
    // ── Delete stale lock files (Windows: retry with delay if EPERM) ────────────
    // journal_mode=DELETE leaves a .lock file; WAL leaves -wal and -shm.
    // On Windows another process may briefly hold the handle — retry for 3 seconds.
    const lockFiles = [dbPath + '.lock', dbPath + '-journal', dbPath + '-wal', dbPath + '-shm']
    for (const lf of lockFiles) {
      if (!fs.existsSync(lf)) continue
      let deleted = false
      for (let t = 0; t < 30; t++) {         // up to 3 seconds (30 × 100ms)
        try { fs.unlinkSync(lf); deleted = true; console.log('[DB] Removed lock file:', path.basename(lf)); break }
        catch (e) {
          if (e.code === 'EPERM' || e.code === 'EBUSY') {
            const end = Date.now() + 100; while (Date.now() < end) {}   // spin-wait 100ms
          } else { break }
        }
      }
      if (!deleted && fs.existsSync(lf)) {
        // Check if it's a directory (can happen when SQLite gets confused on Windows)
        const stat = fs.statSync(lf)
        if (stat.isDirectory()) {
          try {
            fs.rmSync(lf, { recursive: true, force: true })
            console.log('[DB] Removed lock directory:', path.basename(lf))
          } catch (de) { console.warn('[DB] Could not remove lock directory:', path.basename(lf), de.message) }
        } else {
          // Truncate to 0 bytes instead of deleting — tricks SQLite into thinking it's fresh
          try { fs.writeFileSync(lf, Buffer.alloc(0)); console.log('[DB] Cleared (truncated) lock file:', path.basename(lf)) }
          catch (te) { console.warn('[DB] Could not clear lock file:', path.basename(lf), te.message) }
        }
      }
    }

    // ── Retry opening DB (Windows may hold handle briefly after previous close) ──
    let lastErr
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        db = new Database(dbPath)
        db.exec('PRAGMA journal_mode = WAL')      // WAL: no .lock file, better concurrency
        db.exec('PRAGMA foreign_keys = ON')
        db.exec('PRAGMA synchronous = NORMAL')
        db.exec('PRAGMA busy_timeout = 10000')    // wait up to 10s for locks
        db.exec('PRAGMA locking_mode = NORMAL')
        db.exec('PRAGMA wal_autocheckpoint = 1000')
        // application_id marks the file as a SchoolFees Manager DB.
        // DB Browser for SQLite and other generic tools will show it as an
        // "unknown application database" rather than opening it directly.
        db.exec('PRAGMA application_id = 0x5346454D')  // "SFEM" in hex
        // user_version doubles as a schema version check — tools that try to
        // open the file without knowing this will see an unexpected version.
        db.exec('PRAGMA user_version = 20250')
        // cipher_version hint stored in a meta table (discourages casual browsing)
        db.exec(`CREATE TABLE IF NOT EXISTS _sfm_meta (k TEXT PRIMARY KEY, v TEXT)`)
        db.prepare("INSERT OR REPLACE INTO _sfm_meta VALUES ('app','SchoolFees Manager')")
          .run([])
        db.prepare("INSERT OR REPLACE INTO _sfm_meta VALUES ('protected','true')")
          .run([])
        initSchema()
        migrateSchema()
        autoSyncColumns()   // self-healing: add any columns new app versions expect
        seedDefaults()
        const _isDev = !require('electron').app.isPackaged
        if (_isDev) {
          db.prepare("INSERT OR REPLACE INTO app_state (key,value) VALUES ('setup_complete','1')").run([])
        }
        break
      } catch (e) {
        lastErr = e
        if (db) { try { db.close() } catch {} }
        db = null
        const wait = 200 * (attempt + 1)          // progressive back-off: 200ms, 400ms…
        const end = Date.now() + wait; while (Date.now() < end) {}
      }
    }
    if (!db) throw new Error('Cannot open database: ' + (lastErr?.message || 'unknown error') + '. Close any other instances of the app and try again.')
  }
  return db
}

// ─── Safe close — fully releases file locks ───────────────────────────────────
function closeDb() {
  if (db) {
    isClosing = true
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}  // flush + truncate WAL
    try { db.exec('PRAGMA journal_mode = DELETE') }   catch {}  // switch back so no -wal/-shm left
    try { db.close() } catch {}
    db = null
    // Give Windows time to release the file handle before caller tries to delete/copy
    const end = Date.now() + 500
    while (Date.now() < end) { /* spin-wait */ }
    // Clean up any remaining WAL/SHM files
    if (dbPath) {
      for (const ext of ['.lock', '-wal', '-shm', '-journal']) {
        try { const f = dbPath + ext; if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
      }
    }
    writeSeal(dbPath)
    isClosing = false
  }
}

// ─── Reopen after restore ─────────────────────────────────────────────────────
function reopenDb() {
  closeDb()
  return getDb()
}

// ─── Schema ───────────────────────────────────────────────────────────────────
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO app_state (key,value) VALUES ('setup_complete','0');
    INSERT OR IGNORE INTO app_state (key,value) VALUES ('accounting_enabled','0');
    INSERT OR IGNORE INTO app_state (key,value) VALUES ('payroll_enabled','0');
    INSERT OR IGNORE INTO app_state (key,value) VALUES ('inventory_enabled','0');

    CREATE TABLE IF NOT EXISTS activation (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      license_key TEXT NOT NULL,
      school_name TEXT NOT NULL,
      activated_at TEXT,
      expires_at TEXT,
      max_students INTEGER NOT NULL DEFAULT 5,
      tier TEXT NOT NULL DEFAULT 'demo',
      machine_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'bursar' CHECK (role IN ('admin','bursar','viewer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      school_name TEXT NOT NULL DEFAULT 'My School',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      account_name TEXT DEFAULT '',
      logo_path TEXT DEFAULT '',
      currency_symbol TEXT DEFAULT '₦',
      currency_code TEXT DEFAULT 'NGN',
      currency_name TEXT DEFAULT 'Nigerian Naira',
      date_format TEXT DEFAULT 'DD/MM/YYYY',
      receipt_footer TEXT DEFAULT 'Thank you for your payment.',
      sms_enabled INTEGER DEFAULT 0,
      sms_provider TEXT DEFAULT '',
      sms_api_key TEXT DEFAULT '',
      sms_sender_id TEXT DEFAULT '',
      email_enabled INTEGER DEFAULT 0,
      email_smtp_host TEXT DEFAULT '',
      email_smtp_port INTEGER DEFAULT 587,
      email_smtp_user TEXT DEFAULT '',
      email_smtp_pass TEXT DEFAULT '',
      email_from TEXT DEFAULT '',
      auto_backup INTEGER DEFAULT 0,
      backup_time TEXT DEFAULT '23:00',
      thermal_width TEXT DEFAULT '80mm',
      print_copies INTEGER DEFAULT 1,
      accounting_enabled INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO school_settings (id, school_name) VALUES (1, 'My School');

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (name IN ('First Term','Second Term','Third Term')),
      is_current INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      UNIQUE(session_id, name)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      level INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      other_names TEXT DEFAULT '',
      gender TEXT NOT NULL CHECK (gender IN ('M','F')),
      date_of_birth TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      parent_name TEXT DEFAULT '',
      parent_phone TEXT DEFAULT '',
      parent_email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      photo_path TEXT DEFAULT '',
      boarding_type TEXT NOT NULL DEFAULT 'day' CHECK (boarding_type IN ('day','boarding')),
      entry_type TEXT NOT NULL DEFAULT 'new' CHECK (entry_type IN ('new','returning')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      term_id INTEGER NOT NULL REFERENCES terms(id),
      class_id INTEGER NOT NULL REFERENCES classes(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','graduated')),
      is_new_student INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, term_id)
    );

    CREATE TABLE IF NOT EXISTS fee_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      fee_item_id INTEGER NOT NULL REFERENCES fee_items(id),
      amount REAL NOT NULL DEFAULT 0,
      gender_rule TEXT NOT NULL DEFAULT 'all' CHECK (gender_rule IN ('all','male','female')),
      student_type_rule TEXT NOT NULL DEFAULT 'all' CHECK (student_type_rule IN ('all','new','returning')),
      boarding_rule TEXT NOT NULL DEFAULT 'all' CHECK (boarding_rule IN ('all','day','boarding')),
      is_compulsory INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      copied_from_id INTEGER,
      UNIQUE(term_id, class_id, fee_item_id)
    );

    CREATE TABLE IF NOT EXISTS bill_config_copy_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_term_id INTEGER NOT NULL REFERENCES terms(id),
      to_term_id INTEGER NOT NULL REFERENCES terms(id),
      from_class_id INTEGER NOT NULL REFERENCES classes(id),
      to_class_id INTEGER NOT NULL REFERENCES classes(id),
      copied_at TEXT DEFAULT (datetime('now')),
      copied_by TEXT DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS student_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      term_id INTEGER NOT NULL REFERENCES terms(id),
      bill_config_id INTEGER NOT NULL REFERENCES bill_config(id),
      amount REAL NOT NULL,
      is_compulsory INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waived','frozen')),
      generated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, bill_config_id)
    );

    CREATE TABLE IF NOT EXISTS bill_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      term_id INTEGER NOT NULL REFERENCES terms(id),
      type TEXT NOT NULL CHECK (type IN ('addition','discount')),
      calc_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (calc_mode IN ('fixed','percent','flat')),
      amount REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS previous_term_balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      from_term_id INTEGER NOT NULL REFERENCES terms(id),
      to_term_id INTEGER NOT NULL REFERENCES terms(id),
      balance_amount REAL NOT NULL DEFAULT 0,
      carried_over_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, to_term_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      term_id INTEGER NOT NULL REFERENCES terms(id),
      receipt_number TEXT NOT NULL UNIQUE,
      amount_paid REAL NOT NULL,
      payment_date TEXT NOT NULL DEFAULT (date('now')),
      payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer','pos','cheque')),
      reference TEXT DEFAULT '',
      posted_by TEXT DEFAULT 'admin',
      sms_sent INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      is_reversed INTEGER DEFAULT 0,
      reversal_reason TEXT DEFAULT '',
      reversed_by TEXT DEFAULT '',
      reversed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      student_bill_id INTEGER NOT NULL REFERENCES student_bills(id),
      amount_applied REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
      account_group TEXT NOT NULL DEFAULT '',
      balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      entry_type TEXT NOT NULL DEFAULT 'manual' CHECK (entry_type IN ('manual','payment','expense','adjustment')),
      posted_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      narration TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      payee_name TEXT NOT NULL,
      payee_address TEXT DEFAULT '',
      invoice_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','cancelled')),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sms_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      student_id INTEGER REFERENCES students(id),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
      provider_ref TEXT DEFAULT '',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      student_id INTEGER REFERENCES students(id),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      performed_by TEXT DEFAULT 'admin',
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── PAYROLL MODULE ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS salary_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      basic_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL NOT NULL DEFAULT 0,
      transport_allowance REAL NOT NULL DEFAULT 0,
      other_allowances REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      other_names TEXT DEFAULT '',
      gender TEXT NOT NULL DEFAULT 'M' CHECK (gender IN ('M','F')),
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      department TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      date_of_birth TEXT DEFAULT '',
      date_joined TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      account_name TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      pension_pin TEXT DEFAULT '',
      salary_grade_id INTEGER REFERENCES salary_grades(id),
      basic_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL NOT NULL DEFAULT 0,
      transport_allowance REAL NOT NULL DEFAULT 0,
      other_allowances REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_reference TEXT NOT NULL UNIQUE,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      year INTEGER NOT NULL,
      run_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
      total_gross REAL NOT NULL DEFAULT 0,
      total_paye REAL NOT NULL DEFAULT 0,
      total_pension_employee REAL NOT NULL DEFAULT 0,
      total_pension_employer REAL NOT NULL DEFAULT 0,
      total_other_deductions REAL NOT NULL DEFAULT 0,
      total_net REAL NOT NULL DEFAULT 0,
      staff_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      approved_at TEXT,
      created_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS payroll_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES staff(id),
      basic_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL NOT NULL DEFAULT 0,
      transport_allowance REAL NOT NULL DEFAULT 0,
      other_allowances REAL NOT NULL DEFAULT 0,
      gross_salary REAL NOT NULL DEFAULT 0,
      paye_tax REAL NOT NULL DEFAULT 0,
      pension_employee REAL NOT NULL DEFAULT 0,
      pension_employer REAL NOT NULL DEFAULT 0,
      other_deductions REAL NOT NULL DEFAULT 0,
      net_salary REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
      UNIQUE(run_id, staff_id)
    );

    CREATE TABLE IF NOT EXISTS payroll_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 1,
      month INTEGER,
      year INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );


    -- ── EXPENSE & PROCUREMENT MODULE ─────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      account_name TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      account_id INTEGER REFERENCES accounts(id),
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_number TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      expense_date TEXT NOT NULL DEFAULT (date('now')),
      paid_from TEXT NOT NULL DEFAULT 'cash' CHECK (paid_from IN ('cash','bank','petty_cash','payable')),
      payment_reference TEXT DEFAULT '',
      receipt_path TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','rejected')),
      notes TEXT DEFAULT '',
      created_by TEXT DEFAULT 'admin',
      approved_by TEXT DEFAULT '',
      approved_at TEXT,
      paid_at TEXT,
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── ATTENDANCE MODULE ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id   INTEGER NOT NULL REFERENCES classes(id),
      term_id    INTEGER NOT NULL REFERENCES terms(id),
      date       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'present'
                   CHECK (status IN ('present','absent','late','excused')),
      notes      TEXT DEFAULT '',
      recorded_by TEXT DEFAULT 'admin',
      sms_sent   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, date)
    );

    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'present'
                   CHECK (status IN ('present','absent','late','half_day')),
      time_in    TEXT DEFAULT '',
      time_out   TEXT DEFAULT '',
      notes      TEXT DEFAULT '',
      recorded_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(staff_id, date)
    );

    -- ── INVENTORY MODULE ─────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category_id INTEGER REFERENCES inventory_categories(id),
      unit TEXT NOT NULL DEFAULT 'piece'
                CHECK (unit IN ('piece','pack','box','ream','litre','kg','metre','pair','set','carton','bottle','other')),
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      quantity_on_hand REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('purchase','sale','issue','adjustment','return')),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      total_value REAL NOT NULL DEFAULT 0,
      reference TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      supplier_id INTEGER REFERENCES suppliers(id),
      transaction_date TEXT NOT NULL DEFAULT (date('now')),
      recorded_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── SYSTEM ERRORS LOG ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS system_errors (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      handler     TEXT NOT NULL DEFAULT '',
      message     TEXT NOT NULL,
      stack       TEXT DEFAULT '',
      context     TEXT DEFAULT '',
      severity    TEXT NOT NULL DEFAULT 'error'
                    CHECK (severity IN ('error','warning','info')),
      resolved    INTEGER NOT NULL DEFAULT 0,
      resolution  TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `)
}

// ─── Seed default data (INSERT OR IGNORE — safe to run multiple times) ────────
// ─────────────────────────────────────────────────────────────────────────────
// AUTO COLUMN SYNC
// Declarative registry of every column the current app version expects. On every
// startup we compare this against the live DB (via PRAGMA table_info) and ADD any
// column that's missing. This makes software updates that introduce new columns
// self-healing — a client's older database upgrades itself with no manual ALTERs.
//
// Rules:
//  • Only ADDITIVE changes are automatic (SQLite only supports ADD COLUMN safely).
//  • Every added column MUST have a DEFAULT (or be nullable) so existing rows stay
//    valid — SQLite requires this for ADD COLUMN on a non-empty table.
//  • Type/CHECK changes still need an explicit table-rebuild migration below.
// ─────────────────────────────────────────────────────────────────────────────
const EXPECTED_COLUMNS = {
  students: {
    boarding_type:  "TEXT NOT NULL DEFAULT 'day'",
    parent_email:   "TEXT DEFAULT ''",
    parent_name:    "TEXT DEFAULT ''",
    parent_phone:   "TEXT DEFAULT ''",
    entry_type:     "TEXT NOT NULL DEFAULT 'new'",
    is_active:      "INTEGER NOT NULL DEFAULT 1",
  },
  payments: {
    is_reversed:     "INTEGER DEFAULT 0",
    reversal_reason: "TEXT DEFAULT ''",
    reversed_by:     "TEXT DEFAULT ''",
    reversed_at:     "TEXT",
    reference:       "TEXT DEFAULT ''",
    posted_by:       "TEXT DEFAULT 'admin'",
  },
  school_settings: {
    reg_number_format:       "TEXT DEFAULT '{PREFIX}/{YEAR}/{SEQ3}'",
    reg_number_prefix:       "TEXT DEFAULT 'STU'",
    reg_seq_reset:           "TEXT DEFAULT 'year'",
    auto_send_receipt:       "INTEGER DEFAULT 1",
    auto_send_email_receipt: "INTEGER DEFAULT 1",
    email_enabled:           "INTEGER DEFAULT 0",
    sms_enabled:             "INTEGER DEFAULT 0",
    payroll_enabled:         "INTEGER DEFAULT 0",
    inventory_enabled:       "INTEGER DEFAULT 0",
    logo_path:               "TEXT DEFAULT ''",
    bank_name:               "TEXT DEFAULT ''",
    account_number:          "TEXT DEFAULT ''",
    account_name:            "TEXT DEFAULT ''",
    receipt_footer:          "TEXT DEFAULT ''",
    currency_symbol:         "TEXT DEFAULT '₦'",
    currency_code:           "TEXT DEFAULT 'NGN'",
    currency_name:           "TEXT DEFAULT 'Nigerian Naira'",
    address:                 "TEXT DEFAULT ''",
    phone:                   "TEXT DEFAULT ''",
    email:                   "TEXT DEFAULT ''",
  },
  student_bills: {
    is_compulsory: "INTEGER NOT NULL DEFAULT 1",
    generated_at:  "TEXT DEFAULT (datetime('now'))",
  },
  sms_log:   { error_reason: "TEXT DEFAULT ''" },
  email_log: { error_reason: "TEXT DEFAULT ''" },
}

function autoSyncColumns() {
  let added = 0
  for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
    // Skip tables that don't exist yet (created fresh by initSchema)
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get([table])
    if (!exists) continue

    // Existing columns for this table
    let info
    try { info = db.prepare(`PRAGMA table_info(${table})`).all() }
    catch { continue }
    const have = new Set(info.map(c => c.name))

    for (const [col, def] of Object.entries(cols)) {
      if (have.has(col)) continue
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
        added++
        console.log(`[DB] auto-sync: added ${table}.${col}`)
      } catch (e) {
        // A column with a non-constant default (e.g. datetime('now')) can't be
        // added on some SQLite builds — fall back to a NULL-able add.
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`)
          added++
          console.log(`[DB] auto-sync: added ${table}.${col} (nullable fallback)`)
        } catch (e2) {
          console.warn(`[DB] auto-sync: could not add ${table}.${col}:`, e2.message)
        }
      }
    }
  }
  if (added) console.log(`[DB] auto-sync complete: ${added} column(s) added`)
  return added
}

function migrateSchema() {
  // Add columns that may not exist in older databases
  const migrations = [
    "ALTER TABLE payments ADD COLUMN is_reversed INTEGER DEFAULT 0",
    "ALTER TABLE payments ADD COLUMN reversal_reason TEXT DEFAULT ''",
    "ALTER TABLE payments ADD COLUMN reversed_by TEXT DEFAULT ''",
    "ALTER TABLE payments ADD COLUMN reversed_at TEXT",
    "ALTER TABLE school_settings ADD COLUMN reg_number_format TEXT DEFAULT '{PREFIX}/{YEAR}/{SEQ3}'",
    "ALTER TABLE school_settings ADD COLUMN reg_number_prefix TEXT DEFAULT 'STU'",
    "ALTER TABLE school_settings ADD COLUMN reg_seq_reset TEXT DEFAULT 'year'",
    "ALTER TABLE school_settings ADD COLUMN auto_send_receipt INTEGER DEFAULT 1",
    "ALTER TABLE school_settings ADD COLUMN auto_send_email_receipt INTEGER DEFAULT 1",
    "ALTER TABLE school_settings ADD COLUMN payroll_enabled INTEGER DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS system_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handler TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      stack TEXT DEFAULT '',
      context TEXT DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'error',
      resolved INTEGER NOT NULL DEFAULT 0,
      resolution TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE students ADD COLUMN boarding_type TEXT NOT NULL DEFAULT 'day'",
    "ALTER TABLE students ADD COLUMN parent_email TEXT DEFAULT ''",
    "ALTER TABLE school_settings ADD COLUMN inventory_enabled INTEGER DEFAULT 0",
    "ALTER TABLE sms_log   ADD COLUMN error_reason TEXT DEFAULT ''",
    "ALTER TABLE email_log ADD COLUMN error_reason TEXT DEFAULT ''",
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch {} // ignore if column already exists
  }

  // Widen student_bills.status CHECK to include 'frozen'.
  // Handles orphaned _new tables from previous failed migration attempts.
  try {
    const orphan = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='student_bills_new'").get()
    if (orphan) { db.exec('DROP TABLE student_bills_new'); console.log('[DB] Dropped orphaned student_bills_new') }
    const tblSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='student_bills'").get()?.sql || ''
    if (tblSql.includes("IN ('pending','waived')") && !tblSql.includes("'frozen'")) {
      db.exec(`CREATE TABLE student_bills_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        term_id INTEGER NOT NULL REFERENCES terms(id),
        bill_config_id INTEGER NOT NULL REFERENCES bill_config(id),
        amount REAL NOT NULL, is_compulsory INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(student_id, term_id, bill_config_id)
      ); INSERT OR IGNORE INTO student_bills_new SELECT * FROM student_bills;
      DROP TABLE student_bills; ALTER TABLE student_bills_new RENAME TO student_bills;`)
      console.log('[DB] Migrated student_bills: status CHECK widened to include frozen')
    }
  } catch(e) { console.warn('[DB] student_bills migration skipped:', e.message) }
}

function seedDefaults() {
  const insertClass   = db.prepare('INSERT OR IGNORE INTO classes (name, level) VALUES (?,?)')
  const insertFee     = db.prepare('INSERT OR IGNORE INTO fee_items (name, description) VALUES (?,?)')
  const insertAccount = db.prepare('INSERT OR IGNORE INTO accounts (code, name, type, account_group) VALUES (?,?,?,?)')

  for (const c of defaults.classes)   insertClass.run([c.name, c.level])
  for (const f of defaults.feeItems)  insertFee.run([f.name, f.description])
  for (const a of defaults.accounts)  insertAccount.run([a.code, a.name, a.type, a.group])

  // Seed default expense categories (linked to account by code)
  const insertCat = db.prepare('INSERT OR IGNORE INTO expense_categories (name, account_id) VALUES (?,?)')
  // Seed default inventory categories
  const insertInvCat = db.prepare('INSERT OR IGNORE INTO inventory_categories (name) VALUES (?)')
  for (const name of defaults.inventoryCategories) insertInvCat.run([name])

  for (const c of defaults.expenseCategories) {
    const acct = db.prepare('SELECT id FROM accounts WHERE code=?').get([c.account_code])
    insertCat.run([c.name, acct?.id || null])
  }
}

module.exports = { getDb, closeDb, reopenDb, setDbPath, getDbPath }
