const path = require('path')
const fs   = require('fs')
const { Database } = require('node-sqlite3-wasm')
const defaults = require('./defaults')

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

    // Clean up stale lock files left by crashed processes (dev restarts on Windows)
    const lockFiles = [dbPath + '.lock', dbPath + '-journal', dbPath + '-wal', dbPath + '-shm']
    for (const lf of lockFiles) {
      try {
        if (fs.existsSync(lf)) {
          fs.unlinkSync(lf)
          console.log('[DB] Removed stale lock file:', lf)
        }
      } catch (e) {
        console.warn('[DB] Could not remove lock file:', lf, e.message)
      }
    }

    // Retry opening DB — on Windows, previous process may hold handle briefly
    let lastErr
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        db = new Database(dbPath)
        db.exec('PRAGMA journal_mode = DELETE')
        db.exec('PRAGMA foreign_keys = ON')
        db.exec('PRAGMA synchronous = NORMAL')
        db.exec('PRAGMA busy_timeout = 5000')
        db.exec('PRAGMA locking_mode = NORMAL')
        initSchema()
        migrateSchema()
        seedDefaults()
        // In dev mode: ensure setup_complete is always '1' so the activation/setup
        // wizard never shows after a Ctrl+C crash — dev machines shouldn't lose this.
        // Use isPackaged (same logic as activation handler) — NODE_ENV may not be set.
        const _isDev = !require('electron').app.isPackaged
        if (_isDev) {
          db.prepare("INSERT OR REPLACE INTO app_state (key,value) VALUES ('setup_complete','1')").run([])
        }
        break
      } catch (e) {
        lastErr = e
        db = null
        const end = Date.now() + 300
        while (Date.now() < end) {}
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
    try {
      db.exec('PRAGMA wal_checkpoint(FULL)')  // flush any WAL data
    } catch {}
    try { db.close() } catch {}
    db = null
    // Small delay to let Windows release file handle
    const end = Date.now() + 200
    while (Date.now() < end) { /* spin */ }
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

  `)
}

// ─── Seed default data (INSERT OR IGNORE — safe to run multiple times) ────────
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
    "ALTER TABLE sms_log   ADD COLUMN error_reason TEXT DEFAULT ''",
    "ALTER TABLE email_log ADD COLUMN error_reason TEXT DEFAULT ''",
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch {} // ignore if column already exists
  }

  // Drop orphaned student_bills_new table left by the frozen-status migration
  try {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='student_bills_new'").get()
    if (exists) {
      db.exec('DROP TABLE student_bills_new')
      console.log('[DB] Dropped orphaned student_bills_new table')
    }
  } catch(e) { console.warn('[DB] Could not drop student_bills_new:', e.message) }

  // Widen student_bills.status CHECK to include 'frozen' (inactive student bills).
  // SQLite can't ALTER CHECK constraints, so we rebuild the table if it still has the old constraint.
  try {
    const tblSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='student_bills'").get()?.sql || ''
    if (tblSql.includes("IN ('pending','waived')") && !tblSql.includes("'frozen'")) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS student_bills_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          term_id         INTEGER NOT NULL REFERENCES terms(id),
          bill_config_id  INTEGER NOT NULL REFERENCES bill_config(id),
          amount          REAL NOT NULL,
          is_compulsory   INTEGER DEFAULT 1,
          status          TEXT NOT NULL DEFAULT 'pending',
          created_at      TEXT DEFAULT (datetime('now')),
          UNIQUE(student_id, term_id, bill_config_id)
        );
        INSERT INTO student_bills_new SELECT * FROM student_bills;
        DROP TABLE student_bills;
        ALTER TABLE student_bills_new RENAME TO student_bills;
      `)
      console.log('[DB] Migrated student_bills: widened status CHECK to include frozen')
    }
  } catch(e) {
    console.warn('[DB] student_bills migration skipped:', e.message)
  }
}

function seedDefaults() {
  const insertClass   = db.prepare('INSERT OR IGNORE INTO classes (name, level) VALUES (?,?)')
  const insertFee     = db.prepare('INSERT OR IGNORE INTO fee_items (name, description) VALUES (?,?)')
  const insertAccount = db.prepare('INSERT OR IGNORE INTO accounts (code, name, type, account_group) VALUES (?,?,?,?)')

  for (const c of defaults.classes)   insertClass.run([c.name, c.level])
  for (const f of defaults.feeItems)  insertFee.run([f.name, f.description])
  for (const a of defaults.accounts)  insertAccount.run([a.code, a.name, a.type, a.group])
}

module.exports = { getDb, closeDb, reopenDb, setDbPath, getDbPath }
