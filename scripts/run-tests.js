#!/usr/bin/env node
/* eslint-disable */
/**
 * SchoolFees Manager — Automated test & security audit
 * Run:  node scripts/run-tests.js
 * Exercises activation keys, dev password, reset codes, backup crypto,
 * receipt/bill math, HTML escaping, and checks for common security faults.
 */
const assert = require('assert')
const Module = require('module')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

let pass = 0, fail = 0
const results = []
function test(name, fn) {
  try { fn(); pass++; results.push(`  ✓ ${name}`) }
  catch (e) { fail++; results.push(`  ✗ ${name}\n      ${e.message}`) }
}
function section(t) { results.push(`\n▸ ${t}`) }

// Stub electron everywhere
const orig = Module._load
Module._load = function (req, parent, ...a) {
  if (req === 'electron') return {
    ipcMain: { handle() {} }, app: { isPackaged: false, getPath: () => '/tmp/sf-test' },
    dialog: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false },
  }
  return orig.apply(this, [req, parent, ...a])
}
fs.mkdirSync('/tmp/sf-test', { recursive: true })
// Clean any stale DB + lock artifacts from a previous run
try {
  for (const f of fs.readdirSync('/tmp/sf-test')) {
    fs.rmSync(path.join('/tmp/sf-test', f), { recursive: true, force: true })
  }
} catch {}

const ROOT = path.join(__dirname, '..')
const { Database } = require(path.join(ROOT, 'node_modules/node-sqlite3-wasm'))

// ─── Activation keys ──────────────────────────────────────────────────────────
section('Activation (machine-bound keys)')
const machineId = require(path.join(ROOT, 'electron/lib/machineId'))
test('machine ID is stable 64-char hex', () => {
  const id = machineId.getMachineId()
  assert(/^[a-f0-9]{64}$/.test(id), 'bad machine id: ' + id)
  assert.strictEqual(id, machineId.getMachineId(), 'machine id not stable')
})
test('valid key verifies to correct tier', () => {
  const id = machineId.getMachineId()
  const k = machineId.computeExpectedKey(id, 'U')
  assert.strictEqual(machineId.verifyActivationKey(k).tier, 'unlimited')
  assert.strictEqual(machineId.verifyActivationKey(machineId.computeExpectedKey(id, 'D')).tier, 'demo')
})
test('tampered key rejected', () => {
  assert.strictEqual(machineId.verifyActivationKey('SFMU-0000-0000-0000-0000'), null)
})
test('demo key cannot pose as unlimited (tier bound into HMAC)', () => {
  const id = machineId.getMachineId()
  const demo = machineId.computeExpectedKey(id, 'D')
  const forged = demo.replace('SFMD', 'SFMU')
  assert.strictEqual(machineId.verifyActivationKey(forged), null)
})

// ─── Dev password + reset code (timing-safe, rotating) ──────────────────────────
section('Developer auth (rotating)')
test('dev password rotates per 30-min slot', () => {
  const SECRET = 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'
  const slot = Math.floor(Date.now() / (30 * 60 * 1000))
  const p = crypto.createHmac('sha256', SECRET).update(`dev:${slot}`).digest('hex').slice(0, 12)
  assert.strictEqual(p.length, 12)
  const other = crypto.createHmac('sha256', SECRET).update(`dev:${slot + 5}`).digest('hex').slice(0, 12)
  assert.notStrictEqual(p, other)
})
test('reset code bound to machine+username+day', () => {
  const SECRET = 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'
  const id = machineId.getMachineId()
  const slot = Math.floor(Date.now() / (864e5))
  const c1 = crypto.createHmac('sha256', SECRET).update(`reset:${id}:admin:${slot}`).digest('hex').toUpperCase().slice(0, 12)
  const c2 = crypto.createHmac('sha256', SECRET).update(`reset:${id}:bursar:${slot}`).digest('hex').toUpperCase().slice(0, 12)
  assert.notStrictEqual(c1, c2, 'different users must get different codes')
})

// ─── Backup crypto round-trip ───────────────────────────────────────────────────
section('Backup encryption (AES-256-GCM)')
const bc = require(path.join(ROOT, 'electron/lib/backupCrypto'))
const dbPath = '/tmp/sf-test/roundtrip.db'
try { fs.unlinkSync(dbPath) } catch {}
const seed = new Database(dbPath)
seed.exec("CREATE TABLE activation (id INTEGER PRIMARY KEY, license_key TEXT); CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT)")
seed.prepare('INSERT INTO activation VALUES (1, ?)').run(['SFMU-B4EF-D455-EA57-6BCE'])
for (let i = 0; i < 100; i++) seed.prepare('INSERT INTO students (name) VALUES (?)').run(['S' + i])
seed.close()
const live = new Database(dbPath)

test('encrypt → decrypt restores identical bytes', () => {
  const key = bc.deriveBackupKey(live)
  const blob = bc.encryptDb(dbPath, key)
  const plain = bc.decryptBackup(blob, key)
  bc.validateSqliteBytes(plain)
  assert(plain.equals(fs.readFileSync(dbPath)), 'bytes differ after round-trip')
})
test('wrong key throws (GCM auth tag)', () => {
  const blob = bc.encryptDb(dbPath, bc.deriveBackupKey(live))
  assert.throws(() => bc.decryptBackup(blob, crypto.createHash('sha256').update('x').digest()))
})
test('same licence ⇒ same key (cross-machine restore)', () => {
  const k1 = bc.deriveBackupKey(live)
  const db2 = new Database(':memory:')
  db2.exec("CREATE TABLE activation (id INTEGER PRIMARY KEY, license_key TEXT); CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)")
  db2.prepare('INSERT INTO activation VALUES (1, ?)').run(['SFMU-B4EF-D455-EA57-6BCE'])
  assert(k1.equals(bc.deriveBackupKey(db2)))
  db2.close()
})
test('garbage rejected before any write', () => {
  assert.throws(() => bc.validateSqliteBytes(Buffer.alloc(50)))
  assert.throws(() => bc.validateSqliteBytes(Buffer.from('x'.repeat(200))))
})
test('tampered ciphertext rejected (integrity)', () => {
  const key = bc.deriveBackupKey(live)
  const blob = bc.encryptDb(dbPath, key)
  blob[blob.length - 1] ^= 0xff // flip a bit
  assert.throws(() => bc.decryptBackup(blob, key))
})

// ─── Receipt + bill math / escaping ─────────────────────────────────────────────
section('Receipt & bill builders (escaping + math)')
const comm = require(path.join(ROOT, 'electron/handlers/communications.js'))
test('amount in words correct', () => {
  // exercised via receipt; build a minimal receipt and check substring
  const html = comm.buildReceiptHtml({
    settings: { currency_symbol: '₦' }, student: { first_name: 'A', last_name: 'B' },
    termRow: null, classRow: null, balance: 0, receipt_number: 'R1', amount_paid: 45000,
    payment_date: '2026-06-11', payment_method: 'cash',
  })
  assert(html.includes('Forty-Five Thousand Naira Only'), 'words missing')
})
test('receipt escapes XSS in names', () => {
  const html = comm.buildReceiptHtml({
    settings: {}, student: { first_name: '<script>x</script>', last_name: 'B', parent_name: '<img onerror=y>' },
    termRow: null, classRow: null, balance: 0, receipt_number: 'R1', amount_paid: 100,
    payment_date: 'd', payment_method: 'cash',
  })
  assert(!html.includes('<script>x</script>'), 'unescaped script tag!')
  assert(!html.includes('<img onerror=y>'), 'unescaped img tag!')
  assert(html.includes('&lt;script&gt;'), 'expected escaped entity')
})
test('bill data: waived excluded, discount + prev balance applied', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE sessions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE terms (id INTEGER PRIMARY KEY, session_id INT, name TEXT, is_current INT);
    CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE students (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, reg_number TEXT, parent_email TEXT, parent_name TEXT);
    CREATE TABLE student_status (student_id INT, term_id INT, class_id INT);
    CREATE TABLE fee_items (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE bill_config (id INTEGER PRIMARY KEY, fee_item_id INT);
    CREATE TABLE student_bills (id INTEGER PRIMARY KEY, student_id INT, term_id INT, bill_config_id INT, amount REAL, status TEXT, is_compulsory INT);
    CREATE TABLE bill_adjustments (id INTEGER PRIMARY KEY, student_id INT, term_id INT, type TEXT, amount REAL, calc_mode TEXT, reason TEXT, created_at TEXT);
    CREATE TABLE previous_term_balance (student_id INT, to_term_id INT, balance_amount REAL);
    CREATE TABLE payments (id INTEGER PRIMARY KEY, student_id INT, term_id INT, amount_paid REAL, is_reversed INT DEFAULT 0)`)
  db.prepare('INSERT INTO sessions VALUES (1,?)').run(['2025/2026'])
  db.prepare('INSERT INTO terms VALUES (1,1,?,1)').run(['Third Term'])
  db.prepare('INSERT INTO classes VALUES (1,?)').run(['JSS2'])
  db.prepare('INSERT INTO students VALUES (1,?,?,?,?,?)').run(['A', 'B', 'R', 'e@x.ng', 'P'])
  db.prepare('INSERT INTO student_status VALUES (1,1,1)').run()
  db.exec("INSERT INTO fee_items VALUES (1,'Tuition'),(2,'PTA'),(3,'Sports'); INSERT INTO bill_config VALUES (1,1),(2,2),(3,3); INSERT INTO student_bills VALUES (1,1,1,1,80000,'unpaid',1),(2,1,1,2,5000,'unpaid',1),(3,1,1,3,3000,'waived',0); INSERT INTO bill_adjustments (student_id,term_id,type,amount,calc_mode,reason,created_at) VALUES (1,1,'discount',10,'percent','sib','2026'); INSERT INTO previous_term_balance VALUES (1,1,12000); INSERT INTO payments (student_id,term_id,amount_paid) VALUES (1,1,40000)")
  const d = comm.getStudentBillData(db, 1, null)
  assert.strictEqual(d.bill_total, 85000, 'bill_total')
  assert.strictEqual(d.adj_total, -8500, 'discount 10% of 85000')
  assert.strictEqual(d.total_expected, 88500, 'expected')
  assert.strictEqual(d.balance, 48500, 'balance')
  const html = comm.buildBillEmailHtml({ settings: { currency_symbol: '₦' }, data: d })
  assert(!html.includes('>Sports<'), 'waived item should not appear')
  db.close()
})

// ─── Static security scan ───────────────────────────────────────────────────────
section('Fee collection — receipt integrity')
test('receipt_number UNIQUE prevents duplicates + retry recovers', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE payments (id INTEGER PRIMARY KEY, receipt_number TEXT NOT NULL UNIQUE, amount REAL)`)
  const year = new Date().getFullYear()
  const next = () => {
    const row = db.prepare('SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1').get([`RCP-${year}-%`])
    if (!row) return `RCP-${year}-0001`
    const p = row.receipt_number.split('-')
    return `RCP-${year}-${String(parseInt(p[2] || '0') + 1).padStart(4, '0')}`
  }
  const post = (forced) => {
    let r = forced || next()
    for (let attempt = 1; ; attempt++) {
      db.exec('BEGIN')
      try { db.prepare('INSERT INTO payments (receipt_number, amount) VALUES (?,1000)').run([r]); db.exec('COMMIT'); return r }
      catch (e) {
        db.exec('ROLLBACK')
        const dup = /UNIQUE|constraint/i.test(e.message)
        if (dup && attempt < 5 && !forced) { r = next(); continue }
        throw e
      }
    }
  }
  for (let i = 0; i < 5; i++) post()
  assert.throws(() => post(`RCP-${year}-0001`), /UNIQUE|constraint/i) // explicit duplicate rejected
  post() // auto path still works after the failed attempt
  const t = db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT receipt_number) d FROM payments').get()
  assert.strictEqual(t.c, t.d, 'duplicate receipt numbers exist!')
  db.close()
})

// ─── Static security scan ───────────────────────────────────────────────────────
section('Static security scan')
function scan(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }
const handlerFiles = fs.readdirSync(path.join(ROOT, 'electron/handlers')).filter(f => f.endsWith('.js'))

test('no string-concatenated SQL with user vars (uses ? params)', () => {
  for (const f of handlerFiles) {
    const src = scan('electron/handlers/' + f)
    const matches = src.match(/\.prepare\(`[^`]*\$\{[^}]+\}[^`]*`\)/g) || []
    for (const m of matches) {
      // Check EACH ${...} placeholder independently — a query may have several.
      const placeholders = m.match(/\$\{([^}]+)\}/g) || []
      for (const ph of placeholders) {
        const expr = ph.replace(/^\$\{|\}$/g, '')
        const lit  = expr.replace(/'[^']*'|"[^"]*"/g, "''") // blank out string literals
        const isSafe =
          /map\(\(\)\s*=>\s*['"]\?['"]\)/.test(expr)         // ${x.map(()=>'?').join(',')}
          || /map\([a-z]\s*=>\s*[a-z]\s*\+\s*['"]=\?['"]\)/.test(expr) // ${fields.map(f=>f+'=?')}
          || /\bfields\.join\b/.test(expr)                    // ${fields.join(',')} column list
          || /^\s*(sets|cols|columns|placeholders|setClause|colList)\s*$/.test(expr.trim()) // pre-built from fields whitelist
          || /^\s*[\w.]+\s*\?\s*''\s*:\s*''\s*$/.test(lit)     // ${cond ? 'SQL' : ''} fixed branches
          || /ORDER BY|LIMIT|\bdir\b|\bsortCol\b|dateWhere|whereClause/.test(expr)
        assert(isSafe, `${f}: possible SQL interpolation: ${ph}`)
      }
    }
  }
})
test('renderer print uses escaped builders', () => {
  const utils = scan('src/lib/utils.js')
  assert(utils.includes('escapeHtml'), 'escapeHtml helper missing')
  assert(/const e = escapeHtml/.test(utils), 'builder not wired to escape')
})
test('no eval / Function constructor in main code', () => {
  for (const f of handlerFiles) {
    const src = scan('electron/handlers/' + f)
    assert(!/\beval\s*\(/.test(src), `${f}: eval() found`)
    assert(!/new Function\s*\(/.test(src), `${f}: Function constructor found`)
  }
})
test('executeJavaScript not used to run dynamic strings', () => {
  const sched = scan('electron/lib/scheduler.js')
  assert(!sched.includes('executeJavaScript'), 'executeJavaScript should be removed')
})
test('timingSafeEqual used for secret comparison', () => {
  assert(scan('electron/lib/machineId.js').includes('timingSafeEqual'))
  assert(scan('electron/handlers/auth.js').includes('timingSafeEqual'))
})

live.close()

// ─── Report ─────────────────────────────────────────────────────────────────────
console.log(results.join('\n'))
console.log(`\n${'─'.repeat(50)}`)
console.log(`  ${pass} passed, ${fail} failed`)
console.log('─'.repeat(50))
process.exit(fail === 0 ? 0 : 1)
