const { ipcMain } = require('electron')
const { safeHandle, logError } = require('./errorHandler')
const { getDb } = require('../lib/database')

// ── Core billing engine ───────────────────────────────────────────────────────
//
// Bills are point-in-time records generated once before term starts.
// This engine handles WHICH lines exist, not what amount they show.
// Amounts on existing bills are NEVER modified here — use adjustments for corrections.
//
// Triggers: new student, term start, status change, profile/class change
// Does NOT trigger on: fee config amount edits (those only affect new generations)
//
function autoRecalcStudentBills(db, student_id, term_id) {
  const status = db.prepare('SELECT * FROM student_status WHERE student_id=? AND term_id=?').get([student_id, term_id])
  if (!status) return { generated: 0, removed: 0, frozen: 0 }

  const student = db.prepare('SELECT * FROM students WHERE id=?').get([student_id])
  if (!student) return { generated: 0, removed: 0, frozen: 0 }

  // Inactive student: freeze pending bills (excluded from balance, shown as ❄)
  if (status.status !== 'active') {
    const frozen = db.prepare(
      "UPDATE student_bills SET status='frozen' WHERE student_id=? AND term_id=? AND status='pending'"
    ).run([student_id, term_id]).changes
    return { generated: 0, removed: 0, frozen }
  }

  // Reactivated: restore frozen bills to pending before re-evaluating
  db.prepare(
    "UPDATE student_bills SET status='pending' WHERE student_id=? AND term_id=? AND status='frozen'"
  ).run([student_id, term_id])

  const configs = db.prepare('SELECT * FROM bill_config WHERE class_id=? AND term_id=? AND is_active=1').all([status.class_id, term_id])
  const gMap    = { M: 'male', F: 'female' }

  const applicable = configs.filter(c => {
    const gOk = c.gender_rule       === 'all' || c.gender_rule       === gMap[student.gender]
    const tOk = c.student_type_rule === 'all' || c.student_type_rule === student.entry_type
    const bOk = c.boarding_rule     === 'all' || c.boarding_rule     === (student.boarding_type || 'day')
    return gOk && tOk && bOk
  })
  const applicableIds = new Set(applicable.map(c => c.id))

  const existing = db.prepare(
    "SELECT * FROM student_bills WHERE student_id=? AND term_id=? AND status='pending'"
  ).all([student_id, term_id])

  let removed = 0, generated = 0

  // Remove pending lines whose config no longer applies to this student's profile
  for (const bill of existing) {
    if (!applicableIds.has(bill.bill_config_id)) {
      db.prepare('DELETE FROM student_bills WHERE id=?').run([bill.id])
      removed++
    }
  }

  const existingConfigIds = new Set(existing.map(b => b.bill_config_id))

  // Add new applicable lines that don't exist yet — amount taken from config at this moment
  for (const config of applicable) {
    if (!existingConfigIds.has(config.id)) {
      db.prepare(
        "INSERT OR IGNORE INTO student_bills (student_id,term_id,bill_config_id,amount,is_compulsory,status) VALUES (?,?,?,?,?,'pending')"
      ).run([student_id, term_id, config.id, config.amount, config.is_compulsory])
      generated++
    }
    // Existing bill amounts intentionally NOT updated — they are historical records
  }

  return { generated, removed, frozen: 0 }
}


module.exports = function register_billingHandlers() {

// ─── Student Bill Summary ─────────────────────────────────────────────────────
safeHandle('bills:student-summary', (_, { student_id, term_id }) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return null

  const student = db.prepare('SELECT * FROM students WHERE id=?').get(student_id)
  if (!student) return null

  // Get student's class in this term for display/print
  const statusRow = db.prepare(`
    SELECT ss.class_id, c.name as class_name
    FROM student_status ss LEFT JOIN classes c ON c.id=ss.class_id
    WHERE ss.student_id=? AND ss.term_id=?
  `).get([student_id, tid])
  student.class_name = statusRow?.class_name || ''

  // ── Auto-generate bills on first access ──────────────────────────────────
  // If this student has no bills yet for this term but fee config exists,
  // generate them now silently. Bursar never needs to manually generate.
  const existingBillCount = db.prepare(
    'SELECT COUNT(*) as n FROM student_bills WHERE student_id=? AND term_id=?'
  ).get([student_id, tid])?.n || 0

  if (existingBillCount === 0 && statusRow?.class_id) {
    const configCount = db.prepare(
      'SELECT COUNT(*) as n FROM bill_config WHERE class_id=? AND term_id=? AND is_active=1'
    ).get([statusRow.class_id, tid])?.n || 0
    if (configCount > 0) {
      try {
        db.exec('BEGIN')
        autoRecalcStudentBills(db, student_id, tid)
        db.exec('COMMIT')
      } catch(e) {
        try { db.exec('ROLLBACK') } catch {}
        console.warn('[auto-bill] Silent generation failed for student', student_id, e.message)
      }
    }
  }

  const bills = db.prepare(`
    SELECT sb.*, fi.name as fee_item_name, bc.gender_rule, bc.student_type_rule, bc.boarding_rule
    FROM student_bills sb
    JOIN bill_config bc ON bc.id = sb.bill_config_id
    JOIN fee_items fi ON fi.id = bc.fee_item_id
    WHERE sb.student_id=? AND sb.term_id=?
    ORDER BY fi.name`).all([student_id, tid])

  const adjustments = db.prepare(`
    SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=? ORDER BY created_at DESC
  `).all([student_id, tid])

  const prevBalance = db.prepare(
    'SELECT COALESCE(SUM(balance_amount),0) as total FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
  ).get([student_id, tid])?.total || 0

  const billTotal = bills.reduce((s, b) => ['waived','frozen'].includes(b.status) ? s : s + Number(b.amount), 0)

  let adjTotal = 0
  for (const adj of adjustments) {
    const val = adj.calc_mode === 'percent' ? (adj.amount / 100) * billTotal : adj.amount
    adjTotal += adj.type === 'addition' ? val : -val
  }

  const totalExpected = billTotal + Number(prevBalance) + adjTotal
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount_paid),0) as total FROM payments
    WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid > 0
  `).get([student_id, tid])?.total || 0

  // Add term/session/class to student object for print
  const termRow = db.prepare(
    'SELECT t.name as term_name, s.name as session_name FROM terms t JOIN sessions s ON s.id=t.session_id WHERE t.id=?'
  ).get([tid])
  student.term_name    = termRow?.term_name    || ''
  student.session_name = termRow?.session_name || ''

  return {
    student, bills, adjustments,
    bill_total: billTotal,
    prev_balance: Number(prevBalance),
    adj_total: adjTotal,
    total_expected: totalExpected,
    total_paid: totalPaid,
    balance: totalExpected - totalPaid,
    term_id: tid
  }
})

// ─── Generate Bills for Whole Class ──────────────────────────────────────────
safeHandle('bills:generate-class', (_, { class_id, term_id }) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')

  const term = db.prepare('SELECT * FROM terms WHERE id=?').get(tid)
  if (!term) throw new Error('Term not found')

  const students = db.prepare(`
    SELECT s.* FROM students s
    JOIN student_status ss ON ss.student_id=s.id
    WHERE ss.class_id=? AND ss.term_id=? AND ss.status='active'
  `).all([class_id, tid])

  if (!students.length) return { ok: true, generated: 0, skipped: 0, students: 0 }

  const configs = db.prepare(`
    SELECT bc.* FROM bill_config bc WHERE bc.class_id=? AND bc.term_id=? AND bc.is_active=1
  `).all([class_id, tid])

  if (!configs.length) throw new Error('No bill configuration found for this class and term. Configure fees first.')

  const gMap = { M: 'male', F: 'female' }
  const insertBill = db.prepare(`
    INSERT OR IGNORE INTO student_bills (student_id,term_id,bill_config_id,amount,is_compulsory,status)
    VALUES (?,?,?,?,?,'pending')
  `)

  let generated = 0, skipped = 0
  db.exec('BEGIN')
  try {
    for (const student of students) {
      for (const config of configs) {
        const gOk = config.gender_rule       === 'all' || config.gender_rule       === gMap[student.gender]
        const tOk = config.student_type_rule  === 'all' || config.student_type_rule  === student.entry_type
        const bOk = config.boarding_rule      === 'all' || config.boarding_rule      === (student.boarding_type || 'day')
        if (!gOk || !tOk || !bOk) continue
        const r = insertBill.run([student.id, tid, config.id, config.amount, config.is_compulsory])
        if (r.changes > 0) generated++; else skipped++
      }
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }

  db.prepare(`INSERT INTO audit_log (action,table_name,details) VALUES ('BILLS_GENERATED','student_bills',?)`)
    .run(JSON.stringify({ class_id, term_id: tid, generated, skipped, students: students.length }))

  return { ok: true, generated, skipped, students: students.length }
})

// ─── List Bills for a Class (for print/review) ────────────────────────────────
ipcMain.handle('bills:list-class', (_, { class_id, term_id }) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return []

  const students = db.prepare(`
    SELECT s.*, ss.class_id FROM students s
    JOIN student_status ss ON ss.student_id=s.id
    WHERE ss.class_id=? AND ss.term_id=? AND ss.status='active'
    ORDER BY s.last_name, s.first_name
  `).all([class_id, tid])

  return students.map(student => {
    // Auto-generate if this student has no bills yet for this term
    const hasBills = db.prepare(
      'SELECT COUNT(*) as n FROM student_bills WHERE student_id=? AND term_id=?'
    ).get([student.id, tid])?.n > 0
    if (!hasBills) {
      try {
        db.exec('BEGIN')
        autoRecalcStudentBills(db, student.id, tid)
        db.exec('COMMIT')
      } catch(e) {
        try { db.exec('ROLLBACK') } catch {}
      }
    }

    const bills = db.prepare(`
      SELECT sb.*, fi.name as fee_item_name FROM student_bills sb
      JOIN bill_config bc ON bc.id=sb.bill_config_id
      JOIN fee_items fi ON fi.id=bc.fee_item_id
      WHERE sb.student_id=? AND sb.term_id=?
    `).all([student.id, tid])

    const prevBal = db.prepare(
      'SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
    ).get([student.id, tid])?.t || 0

    const adjs = db.prepare('SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=?').all([student.id, tid])

    const billTotal = bills.reduce((s, b) => ['waived','frozen'].includes(b.status) ? s : s + Number(b.amount), 0)
    let adjTotal = 0
    for (const adj of adjs) {
      const val = adj.calc_mode === 'percent' ? (adj.amount / 100) * billTotal : adj.amount
      adjTotal += adj.type === 'addition' ? val : -val
    }

    const paid = db.prepare(
      'SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0'
    ).get([student.id, tid])?.t || 0

    const total = billTotal + Number(prevBal) + adjTotal
    return {
      ...student, bills, adjustments: adjs,
      bill_total: billTotal, prev_balance: Number(prevBal),
      adj_total: adjTotal, total_expected: total,
      total_paid: Number(paid), balance: total - Number(paid)
    }
  })
})

// ─── Waive Bill Item ──────────────────────────────────────────────────────────
ipcMain.handle('bills:waive', (_, { bill_id, waive }) => {
  getDb().prepare("UPDATE student_bills SET status=? WHERE id=?")
    .run([waive ? 'waived' : 'pending', bill_id])
  return { ok: true }
})

// ─── Bill Adjustments ────────────────────────────────────────────────────────
ipcMain.handle('adjustments:list', (_, { student_id, term_id }) => {
  const tid = term_id || getDb().prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  return getDb().prepare('SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=? ORDER BY created_at DESC').all([student_id, tid])
})

ipcMain.handle('adjustments:create', (_, data) => {
  const db  = getDb()
  const tid = data.term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')
  const info = db.prepare(`
    INSERT INTO bill_adjustments (student_id,term_id,type,calc_mode,amount,reason,created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run([data.student_id, tid, data.type, data.calc_mode, data.amount, data.reason, data.created_by || 'admin'])
  return { id: info.lastInsertRowid }
})

ipcMain.handle('adjustments:delete', (_, id) => {
  getDb().prepare('DELETE FROM bill_adjustments WHERE id=?').run(id)
  return { ok: true }
})

// ─── Carry-over Balances ──────────────────────────────────────────────────────
ipcMain.handle('carryover:list', (_, { to_term_id }) => {
  return getDb().prepare(`
    SELECT cb.*, s.first_name, s.last_name, s.reg_number,
           t.name as from_term_name, ses.name as from_session_name
    FROM previous_term_balance cb
    JOIN students s ON s.id=cb.student_id
    JOIN terms t ON t.id=cb.from_term_id
    JOIN sessions ses ON ses.id=t.session_id
    WHERE cb.to_term_id=? ORDER BY s.last_name, s.first_name
  `).all(to_term_id)
})

ipcMain.handle('carryover:post', (_, { student_id, from_term_id, to_term_id, balance_amount }) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM previous_term_balance WHERE student_id=? AND to_term_id=?').get([student_id, to_term_id])
  if (existing) {
    db.prepare('UPDATE previous_term_balance SET balance_amount=?,from_term_id=? WHERE id=?').run([balance_amount, from_term_id, existing.id])
    return { id: existing.id }
  }
  const info = db.prepare('INSERT INTO previous_term_balance (student_id,from_term_id,to_term_id,balance_amount) VALUES (?,?,?,?)').run([student_id, from_term_id, to_term_id, balance_amount])
  return { id: info.lastInsertRowid }
})

ipcMain.handle('carryover:delete', (_, id) => {
  getDb().prepare('DELETE FROM previous_term_balance WHERE id=?').run(id)
  return { ok: true }
})

ipcMain.handle('carryover:auto-compute', (_, { from_term_id, to_term_id }) => {
  const db = getDb()
  const students = db.prepare("SELECT DISTINCT ss.student_id FROM student_status ss WHERE ss.term_id=? AND ss.status='active'").all(from_term_id)

  let posted = 0, zero = 0
  db.exec('BEGIN')
  try {
    for (const { student_id } of students) {
      const bills   = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=?').get([student_id, from_term_id])?.t || 0
      const paid    = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0').get([student_id, from_term_id])?.t || 0
      const prevBal = db.prepare('SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?').get([student_id, from_term_id])?.t || 0
      const balance = Number(bills) + Number(prevBal) - Number(paid)
      if (balance <= 0) { zero++; continue }
      const ex = db.prepare('SELECT id FROM previous_term_balance WHERE student_id=? AND to_term_id=?').get([student_id, to_term_id])
      if (ex) {
        db.prepare('UPDATE previous_term_balance SET balance_amount=?,from_term_id=? WHERE id=?').run([balance, from_term_id, ex.id])
      } else {
        db.prepare('INSERT INTO previous_term_balance (student_id,from_term_id,to_term_id,balance_amount) VALUES (?,?,?,?)').run([student_id, from_term_id, to_term_id, balance])
      }
      posted++
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }
  return { ok: true, posted, zero }
})

// ─── Regenerate Bills for One Student (manual button) ────────────────────────
// Now safe even when student has paid — only adjusts pending lines to match profile.
// Waived lines are preserved. Already-applicable lines are never duplicated.
ipcMain.handle('bills:regenerate-student', (_, { student_id, term_id }) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')

  const status = db.prepare('SELECT * FROM student_status WHERE student_id=? AND term_id=?').get([student_id, tid])
  if (!status) throw new Error('Student has no class assignment for the current term. Assign them to a class first.')

  // Check configs exist for this class/term
  const configCount = db.prepare('SELECT COUNT(*) as n FROM bill_config WHERE class_id=? AND term_id=? AND is_active=1').get([status.class_id, tid])?.n || 0
  if (configCount === 0) throw new Error('No active fee configuration found for this student\'s class and term. Set up fee items first.')

  db.exec('BEGIN')
  try {
    const { generated, removed } = autoRecalcStudentBills(db, student_id, tid)
    db.exec('COMMIT')
    const parts = []
    if (generated > 0) parts.push(`${generated} new fee line${generated > 1 ? 's' : ''} added`)
    if (removed  > 0) parts.push(`${removed} obsolete line${removed > 1 ? 's' : ''} removed`)
    const message = parts.length ? parts.join(', ') + '.' : 'Bills already match current profile — nothing changed.'
    return { ok: true, generated, removed, message }
  } catch(e) { db.exec('ROLLBACK'); throw e }
})

// ── Import Opening Balances ───────────────────────────────────────────────────
ipcMain.handle('import:opening-balances', (_, { rows, term_id }) => {
  const db = getDb()
  if (!term_id) return { ok: false, error: 'No term specified' }

  let imported = 0, skipped = 0
  const errors = []

  db.exec('BEGIN')
  try {
    for (const row of rows) {
      const student = db.prepare('SELECT id FROM students WHERE reg_number=?').get([row.reg_number])
      if (!student) {
        errors.push(`Reg "${row.reg_number}" not found — skipped`)
        skipped++
        continue
      }
      db.prepare(`INSERT INTO previous_term_balance
        (student_id,from_term_id,to_term_id,balance_amount,carried_over_at)
        VALUES (?,NULL,?,?,datetime('now'))
        ON CONFLICT(student_id,to_term_id) DO UPDATE SET
          balance_amount=excluded.balance_amount,
          carried_over_at=datetime('now')`)
        .run([student.id, term_id, row.balance])
      imported++
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); return { ok: false, error: e.message } }

  return { ok: true, imported, skipped, errors: errors.slice(0, 20) }
})

} // end register_billingHandlers

// Export helper for core.js to call after student profile updates
module.exports.autoRecalcStudentBills = autoRecalcStudentBills
