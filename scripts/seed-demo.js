#!/usr/bin/env node
/* eslint-disable */
/**
 * SchoolFees Manager — Demo Data Seeder
 * ─────────────────────────────────────────────────────────────────────────────
 * Truncates ALL data tables and repopulates the database with a realistic,
 * large Nigerian secondary-school dataset for demos and screenshots.
 *
 * Covers every billing condition so the demo exercises the whole app:
 *   • 2 sessions, 3 terms each (one current)
 *   • 6 classes (JSS1–SS3), ~40 students per class (~240 total)
 *   • day / boarding, new / returning, male / female mixes
 *   • per-profile bill config (gender / type / boarding rules)
 *   • full / partial / unpaid students, multiple payment methods
 *   • discounts & additions (scholarships, sibling, late penalty)
 *   • previous-term carryover balances
 *   • some reversed payments (with reasons) for the reversal demo
 *
 * Usage:
 *   node scripts/seed-demo.js                 # seeds the app's real DB
 *   node scripts/seed-demo.js --db /path.db   # seeds a specific DB file
 *   node scripts/seed-demo.js --dry           # build in :memory:, print stats only
 *
 * SAFETY: prompts are skipped, so do NOT run against a production DB. It wipes
 * students, payments, bills, etc. (settings/activation/users are preserved).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path')
const fs   = require('fs')

// ── Resolve DB path ───────────────────────────────────────────────────────────
// Mirrors electron/main.js exactly:
//   Dev:        <project>/database/schoolfees.db
//   Production: <userData>/SchoolFees Manager/data/schoolfees.db
function resolveDbPath() {
  const argIdx = process.argv.indexOf('--db')
  if (argIdx !== -1 && process.argv[argIdx + 1]) return process.argv[argIdx + 1]

  // 1. Dev location next to this project (this is where `npm start` keeps it in dev)
  const devPath = path.join(__dirname, '..', 'database', 'schoolfees.db')
  if (fs.existsSync(devPath)) return devPath

  // 2. Production location used by the packaged app. Electron's userData folder
  //    is named after "productName" when packaged, but after "name" when run
  //    unpacked — so check both.
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? path.join(process.env.HOME || '', 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'))
  for (const folder of ['SchoolFees Manager', 'schoolfees']) {
    for (const sub of ['data', '']) {
      const p = path.join(base, folder, sub, 'schoolfees.db')
      if (fs.existsSync(p)) return p
    }
  }

  // 3. Neither exists yet → default to the dev path and create it there.
  //    (The seeder bootstraps the schema when the DB is empty.)
  return devPath
}
const DRY = process.argv.includes('--dry')
const DB_PATH = DRY ? ':memory:' : resolveDbPath()

const { Database } = require(path.join(__dirname, '..', 'node_modules', 'node-sqlite3-wasm'))

// ── Reference data ────────────────────────────────────────────────────────────
const FIRST_M = ['Abdullahi','Chinedu','Emeka','Ibrahim','Tunde','Yusuf','Daniel','Samuel','Musa','Olamide','Kelechi','Suleiman','Femi','Obinna','Bashir','Segun','Uche','Aliyu','Ifeanyi','Tobi']
const FIRST_F = ['Aisha','Chioma','Fatima','Ngozi','Bukola','Halima','Grace','Blessing','Zainab','Amaka','Funke','Maryam','Adaeze','Hauwa','Yetunde','Esther','Khadija','Nneka','Folake','Rukayya']
const LAST = ['Bello','Okafor','Adeyemi','Mohammed','Eze','Lawal','Okonkwo','Abubakar','Adewale','Nwosu','Sani','Balogun','Ogunleye','Yakubu','Chukwu','Ibrahim','Olawale','Danjuma','Obi','Aminu','Akpan','Ojo','Garba','Nwachukwu']
const PARENT_TITLES = ['Mr.','Mrs.','Alhaji','Dr.','Mallam','Pastor','Chief']
const METHODS = ['cash','transfer','pos','cheque']

const CLASSES = [
  { name: 'JSS 1', level: 1 }, { name: 'JSS 2', level: 2 }, { name: 'JSS 3', level: 3 },
  { name: 'SS 1', level: 4 },  { name: 'SS 2', level: 5 },  { name: 'SS 3', level: 6 },
]
const FEE_ITEMS = [
  { name: 'Tuition',        compulsory: 1, base: 45000 },
  { name: 'Development Levy',compulsory: 1, base: 10000 },
  { name: 'PTA Levy',       compulsory: 1, base: 5000 },
  { name: 'Exam Fee',       compulsory: 1, base: 7500 },
  { name: 'Boarding Fee',   compulsory: 1, base: 120000, boarding: 'boarding' },
  { name: 'New Student Levy',compulsory: 1, base: 15000, type: 'new' },
  { name: 'Sports Wear',    compulsory: 0, base: 6000 },
  { name: 'ICT Fee',        compulsory: 1, base: 8000 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
let SEED = 12345
function rng() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff }
const pick = arr => arr[Math.floor(rng() * arr.length)]
const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1))
const pad = (n, w) => String(n).padStart(w, '0')

function main() {
  // Make sure the target directory exists (first-run dev path may not yet)
  if (DB_PATH !== ':memory:') {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // node-sqlite3-wasm locks via a "<db>.lock" DIRECTORY. If a previous run
    // (or a crash) left one behind, every open fails with "database is locked".
    // Remove a stale lock before opening. (If the app itself is running and
    // holding the DB, the open below will still fail — see the hint there.)
    const lockDir = DB_PATH + '.lock'
    if (fs.existsSync(lockDir)) {
      try { fs.rmSync(lockDir, { recursive: true, force: true }) }
      catch { /* ignore — handled by the open error below */ }
    }
    console.log(`Seeding database at: ${DB_PATH}`)
  }
  let db
  try {
    db = new Database(DB_PATH)
    db.exec('PRAGMA foreign_keys = OFF')
    // Probe write access immediately so a held lock surfaces here, clearly
    db.exec('PRAGMA user_version')
  } catch (e) {
    if (/locked|busy/i.test(e.message)) {
      console.error('\n❌ The database is locked.')
      console.error('   This usually means the SchoolFees Manager app is currently OPEN.')
      console.error('   Close the app completely, then run this command again.\n')
      console.error(`   (If the app is closed, delete this folder and retry: ${DB_PATH}.lock)\n`)
      process.exit(1)
    }
    throw e
  }

  // If the target DB is empty (no schema yet), create the tables the seed
  // touches. The real app DB already has these — this only fires on a fresh DB.
  {
    const haveSessions = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get()
    if (!haveSessions) {
      db.exec(`
        CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, is_current INTEGER DEFAULT 0);
        CREATE TABLE terms (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, name TEXT, is_current INTEGER DEFAULT 0, start_date TEXT, end_date TEXT);
        CREATE TABLE classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, level INTEGER, is_active INTEGER DEFAULT 1);
        CREATE TABLE fee_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, is_active INTEGER DEFAULT 1);
        CREATE TABLE bill_config (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id INTEGER, class_id INTEGER, fee_item_id INTEGER, amount REAL, gender_rule TEXT, student_type_rule TEXT, boarding_rule TEXT, is_compulsory INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, copied_from_id INTEGER);
        CREATE TABLE bill_config_copy_log (id INTEGER PRIMARY KEY AUTOINCREMENT, from_term_id INTEGER, to_term_id INTEGER, from_class_id INTEGER, to_class_id INTEGER);
        CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, reg_number TEXT UNIQUE, first_name TEXT, last_name TEXT, gender TEXT, parent_name TEXT, parent_phone TEXT, parent_email TEXT, boarding_type TEXT DEFAULT 'day', entry_type TEXT DEFAULT 'new');
        CREATE TABLE student_status (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, session_id INTEGER, term_id INTEGER, class_id INTEGER, status TEXT DEFAULT 'active', is_new_student INTEGER DEFAULT 0);
        CREATE TABLE student_bills (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, term_id INTEGER, bill_config_id INTEGER, amount REAL, is_compulsory INTEGER DEFAULT 1, status TEXT DEFAULT 'pending');
        CREATE TABLE bill_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, term_id INTEGER, type TEXT, calc_mode TEXT, amount REAL, reason TEXT, created_by TEXT);
        CREATE TABLE previous_term_balance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, from_term_id INTEGER, to_term_id INTEGER, balance_amount REAL);
        CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, term_id INTEGER, receipt_number TEXT UNIQUE, amount_paid REAL, payment_date TEXT, payment_method TEXT, reference TEXT, posted_by TEXT, is_reversed INTEGER DEFAULT 0, reversal_reason TEXT DEFAULT '', reversed_by TEXT DEFAULT '');
        CREATE TABLE payment_items (id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id INTEGER);
        CREATE TABLE invoices (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE sms_log (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE email_log (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE, description TEXT, entry_date TEXT, entry_type TEXT DEFAULT 'manual', posted_by TEXT DEFAULT 'admin', created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE journal_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER, account_id INTEGER, debit REAL DEFAULT 0, credit REAL DEFAULT 0, narration TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT, type TEXT, account_group TEXT DEFAULT '', balance REAL DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE attendance_records (id INTEGER PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE staff_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT);
      `)
    }
  }

  // ── 1. Truncate all data tables (keep settings / activation / users) ─────────
  const WIPE = [
    'payment_items','payments','bill_adjustments','previous_term_balance','student_bills',
    'invoice_items','invoices','student_status','students','bill_config','bill_config_copy_log',
    'fee_items','terms','sessions','classes','sms_log','email_log','audit_log',
    'journal_lines','journal_entries','attendance_records','staff_attendance',
  ]
  db.exec('BEGIN')
  for (const t of WIPE) {
    try { db.exec(`DELETE FROM ${t}`) } catch {}
    try { db.exec(`DELETE FROM sqlite_sequence WHERE name='${t}'`) } catch {}
  }
  // Reset running account balances so re-seeding doesn't double-count
  try { db.exec('UPDATE accounts SET balance=0') } catch {}
  db.exec('COMMIT')

  db.exec('BEGIN')

  // ── 2. Sessions + terms ──────────────────────────────────────────────────────
  const insSession = db.prepare('INSERT INTO sessions (name, is_current) VALUES (?,?)')
  const prevSessId = insSession.run(['2024/2025', 0]).lastInsertRowid
  const curSessId  = insSession.run(['2025/2026', 1]).lastInsertRowid

  const insTerm = db.prepare('INSERT INTO terms (session_id, name, is_current) VALUES (?,?,?)')
  const TERMS = ['First Term','Second Term','Third Term']
  const prevTerms = TERMS.map(t => insTerm.run([prevSessId, t, 0]).lastInsertRowid)
  // Current session: First & Second done, Third Term is current
  const curT1 = insTerm.run([curSessId, 'First Term', 0]).lastInsertRowid
  const curT2 = insTerm.run([curSessId, 'Second Term', 0]).lastInsertRowid
  const curT3 = insTerm.run([curSessId, 'Third Term', 1]).lastInsertRowid
  const CURRENT_TERM = curT3

  // ── 3. Classes ───────────────────────────────────────────────────────────────
  const insClass = db.prepare('INSERT INTO classes (name, level, is_active) VALUES (?,?,1)')
  const classIds = CLASSES.map(c => ({ ...c, id: insClass.run([c.name, c.level]).lastInsertRowid }))

  // ── 4. Fee items ─────────────────────────────────────────────────────────────
  const insFee = db.prepare('INSERT INTO fee_items (name, description, is_active) VALUES (?,?,1)')
  const feeIds = FEE_ITEMS.map(f => ({ ...f, id: insFee.run([f.name, '']).lastInsertRowid }))

  // ── 5. Bill config for current Third Term, every class ───────────────────────
  const insCfg = db.prepare(`INSERT INTO bill_config
    (term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active)
    VALUES (?,?,?,?,?,?,?,?,1)`)
  for (const cls of classIds) {
    const senior = cls.level >= 4
    for (const fee of feeIds) {
      // Senior classes pay a bit more tuition
      const amount = fee.name === 'Tuition' ? fee.base + (senior ? 15000 : 0) : fee.base
      insCfg.run([
        CURRENT_TERM, cls.id, fee.id, amount,
        'all',
        fee.type || 'all',
        fee.boarding || 'all',
        fee.compulsory,
      ])
    }
  }

  // ── 6. Students + status + bills + payments ──────────────────────────────────
  const insStudent = db.prepare(`INSERT INTO students
    (reg_number, first_name, last_name, gender, parent_name, parent_phone, parent_email, boarding_type, entry_type)
    VALUES (?,?,?,?,?,?,?,?,?)`)
  const insStatus = db.prepare(`INSERT INTO student_status
    (student_id, session_id, term_id, class_id, status, is_new_student) VALUES (?,?,?,?,'active',?)`)
  const insBill = db.prepare(`INSERT INTO student_bills
    (student_id, term_id, bill_config_id, amount, is_compulsory, status) VALUES (?,?,?,?,?,'pending')`)
  const insPay = db.prepare(`INSERT INTO payments
    (student_id, term_id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by, is_reversed, reversal_reason, reversed_by)
    VALUES (?,?,?,?,?,?,?, 'demo', ?, ?, ?)`)
  const insAdj = db.prepare(`INSERT INTO bill_adjustments
    (student_id, term_id, type, calc_mode, amount, reason, created_by) VALUES (?,?,?,?,?,?,'demo')`)
  const insCarry = db.prepare(`INSERT INTO previous_term_balance
    (student_id, from_term_id, to_term_id, balance_amount) VALUES (?,?,?,?)`)

  // bill_config rows for current term, keyed by class for quick lookup
  const cfgByClass = {}
  for (const cls of classIds) {
    cfgByClass[cls.id] = db.prepare(
      'SELECT * FROM bill_config WHERE term_id=? AND class_id=?'
    ).all([CURRENT_TERM, cls.id])
  }

  let regSeq = 1, receiptSeq = 1, studentCount = 0, payCount = 0, reversedCount = 0
  const year = 2025

  for (const cls of classIds) {
    const perClass = randInt(35, 45)
    for (let i = 0; i < perClass; i++) {
      const gender = rng() < 0.5 ? 'M' : 'F'
      const first  = gender === 'M' ? pick(FIRST_M) : pick(FIRST_F)
      const last   = pick(LAST)
      const boarding = rng() < 0.3 ? 'boarding' : 'day'
      const entry  = rng() < 0.35 ? 'new' : 'returning'
      const reg    = `BFA/${year}/${pad(regSeq++, 4)}`
      const parent = `${pick(PARENT_TITLES)} ${last}`
      const phone  = `080${randInt(10000000, 99999999)}`
      const email  = rng() < 0.7 ? `${first.toLowerCase()}.${last.toLowerCase()}@example.com` : ''

      const sid = insStudent.run([reg, first, last, gender, parent, phone, email, boarding, entry]).lastInsertRowid
      insStatus.run([sid, curSessId, CURRENT_TERM, cls.id, entry === 'new' ? 1 : 0])
      studentCount++

      // Generate this student's bills from matching config rows
      let billed = 0
      for (const cfg of cfgByClass[cls.id]) {
        const gOk = cfg.gender_rule === 'all' || cfg.gender_rule === (gender === 'M' ? 'male' : 'female')
        const tOk = cfg.student_type_rule === 'all' || cfg.student_type_rule === entry
        const bOk = cfg.boarding_rule === 'all' || cfg.boarding_rule === boarding
        if (gOk && tOk && bOk) {
          insBill.run([sid, CURRENT_TERM, cfg.id, cfg.amount, cfg.is_compulsory])
          billed += cfg.amount
        }
      }

      // Adjustments: ~12% get a discount, ~6% an addition
      let adjTotal = 0
      const r = rng()
      if (r < 0.12) {
        const pct = pick([5, 10, 15])
        insAdj.run([sid, CURRENT_TERM, 'discount', 'percent', pct, pick(['Sibling discount','Staff ward','Scholarship'])])
        adjTotal -= billed * pct / 100
      } else if (r < 0.18) {
        const amt = pick([2000, 5000])
        insAdj.run([sid, CURRENT_TERM, 'addition', 'fixed', amt, 'Late registration penalty'])
        adjTotal += amt
      }

      // Carryover: ~15% owe from previous term
      let carry = 0
      if (rng() < 0.15) {
        carry = pick([5000, 12000, 20000, 35000])
        insCarry.run([sid, prevTerms[2], CURRENT_TERM, carry])
      }

      const expected = billed + adjTotal + carry

      // Payment behaviour: 50% full, 30% partial, 20% none
      const payRoll = rng()
      const makePay = (amount, daysAgo, reversed = false) => {
        const d = new Date(); d.setDate(d.getDate() - daysAgo)
        const dateStr = d.toISOString().slice(0, 10)
        const rcpt = reversed ? `REV-${year}-${pad(receiptSeq++, 4)}` : `RCP-${year}-${pad(receiptSeq++, 4)}`
        insPay.run([
          sid, CURRENT_TERM, rcpt, reversed ? -Math.abs(amount) : amount,
          dateStr, pick(METHODS), '', reversed ? 1 : 0,
          reversed ? pick(['Posted to wrong student','Duplicate entry','Bank reversal']) : '',
          reversed ? 'admin' : '',
        ])
        payCount++
      }

      if (payRoll < 0.5) {
        // full payment, possibly in 1–2 instalments
        if (rng() < 0.6) makePay(Math.round(expected), randInt(5, 60))
        else { makePay(Math.round(expected * 0.6), randInt(30, 60)); makePay(Math.round(expected * 0.4), randInt(1, 20)) }
      } else if (payRoll < 0.8) {
        makePay(Math.round(expected * pick([0.3, 0.5, 0.7])), randInt(5, 45))
      }
      // else: no payment (debtor)

      // ~5% of students with a payment also have a reversed one (reversal demo)
      if (payRoll < 0.8 && rng() < 0.05) {
        const amt = Math.round(expected * 0.25)
        makePay(amt, randInt(10, 30))            // original
        // mark the original reversed + counter-entry
        const lastPay = db.prepare('SELECT id, receipt_number FROM payments WHERE student_id=? ORDER BY id DESC LIMIT 1').get([sid])
        db.prepare("UPDATE payments SET is_reversed=1, reversal_reason='Duplicate entry', reversed_by='admin' WHERE id=?").run([lastPay.id])
        makePay(amt, randInt(1, 9), true)        // negative reversal entry
        reversedCount++
      }
    }
  }

  // ── Accounting demo data ─────────────────────────────────────────────────
  // Enable the accounting module and post double-entry journals so the
  // trial balance, ledger, and income statement are populated (not zero).
  db.prepare("INSERT OR REPLACE INTO app_state (key,value) VALUES ('accounting_enabled','1')").run()

  // Ensure the chart of accounts exists (the real app seeds this; a bootstrapped
  // demo DB may not have it yet).
  const CHART = [
    ['1001', 'Cash on Hand',       'asset',     'Current Assets'],
    ['1002', 'Bank Account',       'asset',     'Current Assets'],
    ['1003', 'Petty Cash',         'asset',     'Current Assets'],
    ['1100', 'Accounts Receivable','asset',     'Current Assets'],
    ['4001', 'School Fees Income', 'income',    'Revenue'],
    ['4002', 'Registration Income','income',    'Revenue'],
    ['5001', 'Staff Salaries',     'expense',   'Operating Expenses'],
    ['5002', 'Utilities',          'expense',   'Operating Expenses'],
    ['5003', 'Maintenance',        'expense',   'Operating Expenses'],
    ['5004', 'Stationery',         'expense',   'Operating Expenses'],
    ['2001', 'Accounts Payable',   'liability', 'Current Liabilities'],
    ['3001', 'Retained Earnings',  'equity',    'Equity'],
  ]
  const insAcct = db.prepare('INSERT OR IGNORE INTO accounts (code,name,type,account_group) VALUES (?,?,?,?)')
  for (const [code, name, type, grp] of CHART) insAcct.run([code, name, type, grp])
  const acctId = code => db.prepare('SELECT id FROM accounts WHERE code=?').get([code])?.id
  const bankId = acctId('1002'), feeId = acctId('4001')

  // Map each payment method to a debit (cash) account
  const methodAccount = { cash: acctId('1001'), pos: bankId, transfer: bankId, cheque: bankId }

  const insEntry = db.prepare(`INSERT OR IGNORE INTO journal_entries
    (reference, description, entry_date, entry_type, posted_by) VALUES (?,?,?,'payment','demo')`)
  const insLine  = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit, narration) VALUES (?,?,?,?,?)')

  // One balanced entry per non-reversed positive payment:
  //   Dr Cash/Bank   (money received)      Cr School Fees Income
  const pays = db.prepare(`SELECT id, receipt_number, amount_paid, payment_date, payment_method
    FROM payments WHERE is_reversed=0 AND amount_paid>0`).all()
  let jeCount = 0
  for (const p of pays) {
    const ref = `AUTO-PMT-${p.receipt_number}`
    const info = insEntry.run([ref, `Payment received: ${p.receipt_number}`, p.payment_date])
    if (!info.changes) continue
    const dr = methodAccount[p.payment_method] || bankId
    insLine.run([info.lastInsertRowid, dr,    p.amount_paid, 0, 'Fee payment'])
    insLine.run([info.lastInsertRowid, feeId, 0, p.amount_paid, 'School fees income'])
    db.prepare('UPDATE accounts SET balance=balance+? WHERE id=?').run([p.amount_paid, dr])
    db.prepare('UPDATE accounts SET balance=balance+? WHERE id=?').run([p.amount_paid, feeId])
    jeCount++
  }

  // Reversal entries: Dr School Fees Income, Cr Cash/Bank (contra)
  const revs = db.prepare(`SELECT id, receipt_number, amount_paid, payment_date, payment_method
    FROM payments WHERE amount_paid<0`).all()
  for (const r of revs) {
    const amt = Math.abs(r.amount_paid)
    const ref = `AUTO-REV-${r.receipt_number}`
    const info = insEntry.run([ref, `Payment reversed: ${r.receipt_number}`, r.payment_date])
    if (!info.changes) continue
    const cr = methodAccount[r.payment_method] || bankId
    insLine.run([info.lastInsertRowid, feeId, amt, 0, 'Reversal of fees income'])
    insLine.run([info.lastInsertRowid, cr,    0, amt, 'Reversal contra'])
    db.prepare('UPDATE accounts SET balance=balance-? WHERE id=?').run([amt, feeId])
    db.prepare('UPDATE accounts SET balance=balance-? WHERE id=?').run([amt, cr])
    jeCount++
  }

  // A handful of operating expenses: Dr Expense, Cr Bank
  const EXP = [
    ['5001', 850000, 'Monthly staff salaries'],
    ['5002', 120000, 'Electricity & water'],
    ['5003', 65000,  'Generator servicing'],
    ['5004', 38000,  'Exam stationery'],
  ]
  let expSeq = 1
  for (const [code, amt, desc] of EXP) {
    const exId = acctId(code); if (!exId) continue
    const ref = `JE-EXP-DEMO-${String(expSeq++).padStart(3, '0')}`
    const info = insEntry.run([ref, `Expense: ${desc}`, new Date().toISOString().slice(0, 10)])
    if (!info.changes) continue
    insLine.run([info.lastInsertRowid, exId,   amt, 0, desc])
    insLine.run([info.lastInsertRowid, bankId, 0, amt, 'Paid from bank'])
    db.prepare('UPDATE accounts SET balance=balance+? WHERE id=?').run([amt, exId])
    db.prepare('UPDATE accounts SET balance=balance-? WHERE id=?').run([amt, bankId])
    jeCount++
  }
  // Reclassify entry_type for the expense rows so reports group them correctly
  db.prepare("UPDATE journal_entries SET entry_type='expense' WHERE reference LIKE 'JE-EXP-DEMO-%'").run()

  db.exec('COMMIT')

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stat = q => db.prepare(q).get()?.n || 0
  const totalBilled = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM student_bills WHERE status NOT IN ('waived','frozen')").get().n
  const totalPaid   = db.prepare('SELECT COALESCE(SUM(amount_paid),0) n FROM payments WHERE is_reversed=0 AND amount_paid>0').get().n

  console.log('\n✅ Demo data seeded' + (DRY ? ' (dry run — in-memory only)' : ` → ${DB_PATH}`))
  console.log('   Sessions     :', stat('SELECT COUNT(*) n FROM sessions'))
  console.log('   Terms        :', stat('SELECT COUNT(*) n FROM terms'))
  console.log('   Classes      :', stat('SELECT COUNT(*) n FROM classes'))
  console.log('   Fee items    :', stat('SELECT COUNT(*) n FROM fee_items'))
  console.log('   Bill config  :', stat('SELECT COUNT(*) n FROM bill_config'))
  console.log('   Students     :', studentCount)
  console.log('   Bills        :', stat('SELECT COUNT(*) n FROM student_bills'))
  console.log('   Payments     :', payCount, `(of which ${reversedCount} reversed)`)
  console.log('   Adjustments  :', stat('SELECT COUNT(*) n FROM bill_adjustments'))
  console.log('   Carryovers   :', stat('SELECT COUNT(*) n FROM previous_term_balance'))
  console.log('   Journal entries:', stat('SELECT COUNT(*) n FROM journal_entries'), `(${jeCount} posted)`)
  console.log('   Accounts used:', stat('SELECT COUNT(DISTINCT account_id) n FROM journal_lines'))
  console.log('   Total billed :', '₦' + totalBilled.toLocaleString('en-NG'))
  console.log('   Total paid   :', '₦' + totalPaid.toLocaleString('en-NG'))
  console.log('   Collection % :', totalBilled ? Math.round(totalPaid / totalBilled * 100) + '%' : '0%')

  // ── Demo school profile image (simple SVG → written next to DB) ───────────────
  if (!DRY) {
    try {
      const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<rect width="200" height="200" rx="24" fill="#1e3a8a"/>
<circle cx="100" cy="78" r="38" fill="#fbbf24"/>
<path d="M62 78 L100 56 L138 78 L100 100 Z" fill="#1e3a8a"/>
<rect x="56" y="120" width="88" height="10" rx="5" fill="#fff"/>
<rect x="68" y="138" width="64" height="8" rx="4" fill="#93c5fd"/>
<text x="100" y="180" font-family="Georgia,serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">BFA</text>
</svg>`
      const logoPath = path.join(path.dirname(DB_PATH), 'demo_logo.svg')
      fs.writeFileSync(logoPath, logoSvg)
      console.log('   Demo logo    :', logoPath)
    } catch (e) { /* non-fatal */ }
  }

  console.log('')
  db.close()
}

main()
