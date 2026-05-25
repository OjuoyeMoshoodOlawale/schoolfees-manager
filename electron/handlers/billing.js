const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_billingHandlers() {
// ─── Phase 3: Student Bills ──────────────────────────────────────────────────

// Get full bill summary for one student in current (or specified) term
ipcMain.handle('bills:student-summary', (_, { student_id, term_id }) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return null

  const student = db.prepare('SELECT * FROM students WHERE id=?').get(student_id)
  if (!student) return null

  // Line items
  const bills = db.prepare(`
    SELECT sb.*, fi.name as fee_item_name, bc.gender_rule, bc.student_type_rule, bc.boarding_rule
    FROM student_bills sb
    JOIN bill_config bc ON bc.id = sb.bill_config_id
    JOIN fee_items fi ON fi.id = bc.fee_item_id
    WHERE sb.student_id=? AND sb.term_id=?
    ORDER BY fi.name`).all([student_id, tid])

  // Adjustments
  const adjustments = db.prepare(`
    SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=? ORDER BY created_at DESC
  `).all([student_id, tid])

  // Previous term balance
  const prevBalance = db.prepare(
    'SELECT COALESCE(SUM(balance_amount),0) as total FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
  ).get([student_id, tid])?.total || 0

  // Total billed from line items
  const billTotal = bills.reduce((s, b) => b.status === 'waived' ? s : s + Number(b.amount), 0)

  // Calculate adjustments
  let adjTotal = 0
  for (const adj of adjustments) {
    if (adj.type === 'addition') {
      adjTotal += adj.calc_mode === 'percent'
        ? (adj.amount / 100) * billTotal
        : adj.amount
    } else { // discount
      const deduct = adj.calc_mode === 'percent'
        ? (adj.amount / 100) * billTotal
        : adj.amount
      adjTotal -= deduct
    }
  }

  const totalExpected = billTotal + Number(prevBalance) + adjTotal

  // Total paid — single source of truth, excluding reversed payments
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount_paid),0) as total FROM payments
    WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid > 0
  `).get([student_id, tid])?.total || 0
  const balance = totalExpected - totalPaid

  return {
    student, bills, adjustments,
    bill_total: billTotal,
    prev_balance: Number(prevBalance),
    adj_total: adjTotal,
    total_expected: totalExpected,
    total_paid: totalPaid,
    balance,
    term_id: tid
  }
})

// Generate bills for all active students in a class for current term (idempotent)
ipcMain.handle('bills:generate-class', (_, { class_id, term_id }) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')

  // Get session for this term
  const term = db.prepare('SELECT * FROM terms WHERE id=?').get(tid)
  if (!term) throw new Error('Term not found')

  // Get active students in this class this term
  const students = db.prepare(`
    SELECT s.* FROM students s
    JOIN student_status ss ON ss.student_id=s.id
    WHERE ss.class_id=? AND ss.term_id=? AND ss.status='active'
  `).all([class_id, tid])

  if (!students.length) return { ok: true, generated: 0, skipped: 0, students: 0 }

  // Get bill configs for this class and term (active only)
  const configs = db.prepare(`
    SELECT bc.* FROM bill_config bc
    WHERE bc.class_id=? AND bc.term_id=? AND bc.is_active=1
  `).all([class_id, tid])

  if (!configs.length) throw new Error('No bill configuration found for this class and term. Configure fees first.')

  const gMap = { M: 'male', F: 'female' }

  const insertBill = db.prepare(`
    INSERT OR IGNORE INTO student_bills
    (student_id, term_id, bill_config_id, amount, is_compulsory, status)
    VALUES (?,?,?,?,?,'pending')
  `)

  let generated = 0, skipped = 0

  db.exec('BEGIN')
  try {
    for (const student of students) {
      for (const config of configs) {
        // Check all 4 rules
        const genderOk  = config.gender_rule       === 'all' || config.gender_rule       === gMap[student.gender]
        const typeOk    = config.student_type_rule  === 'all' || config.student_type_rule  === student.entry_type
        const boardOk   = config.boarding_rule      === 'all' || config.boarding_rule      === (student.boarding_type || 'day')

        if (!genderOk || !typeOk || !boardOk) continue

        const result = insertBill.run([student.id, tid, config.id, config.amount, config.is_compulsory])
        if (result.changes > 0) generated++
        else skipped++
      }
    }
  
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }

  // Log it
  db.prepare(`INSERT INTO audit_log (action, table_name, details)
    VALUES ('BILLS_GENERATED', 'student_bills', ?)`).run(
    JSON.stringify({ class_id, term_id: tid, generated, skipped, students: students.length })
  )

  return { ok: true, generated, skipped, students: students.length }
})

// List bills for a class/term (for bulk print or review)
ipcMain.handle('bills:list-class', (_, { class_id, term_id }) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return []

  const students = db.prepare(`
    SELECT s.*, ss.class_id FROM students s
    JOIN student_status ss ON ss.student_id=s.id
    WHERE ss.class_id=? AND ss.term_id=? AND ss.status='active'
    ORDER BY s.last_name, s.first_name
  `).all([class_id, tid])

  return students.map(student => {
    const bills = db.prepare(`
      SELECT sb.*, fi.name as fee_item_name FROM student_bills sb
      JOIN bill_config bc ON bc.id=sb.bill_config_id
      JOIN fee_items fi ON fi.id=bc.fee_item_id
      WHERE sb.student_id=? AND sb.term_id=?
    `).all([student.id, tid])

    const prevBal = db.prepare(
      'SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
    ).get([student.id, tid])?.t || 0

    const adjs = db.prepare(
      'SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=?'
    ).all([student.id, tid])

    const billTotal = bills.reduce((s, b) => b.status === 'waived' ? s : s + b.amount, 0)
    let adjTotal = 0
    for (const adj of adjs) {
      const val = adj.calc_mode === 'percent' ? (adj.amount / 100) * billTotal : adj.amount
      adjTotal += adj.type === 'addition' ? val : -val
    }

    const paid = db.prepare(
      'SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=?'
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

// Waive a specific bill line item
ipcMain.handle('bills:waive', (_, { bill_id, waive }) => {
  getDb().prepare("UPDATE student_bills SET status=? WHERE id=?")
    .run([waive ? 'waived' : 'pending', bill_id])
  return { ok: true }
})

// ─── Phase 3: Bill Adjustments ───────────────────────────────────────────────

ipcMain.handle('adjustments:list', (_, { student_id, term_id }) => {
  const tid = term_id || getDb().prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  return getDb().prepare(
    'SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=? ORDER BY created_at DESC'
  ).all([student_id, tid])
})

ipcMain.handle('adjustments:create', (_, data) => {
  const db = getDb()
  const tid = data.term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')
  const info = db.prepare(`
    INSERT INTO bill_adjustments (student_id, term_id, type, calc_mode, amount, reason, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run([data.student_id, tid, data.type, data.calc_mode, data.amount, data.reason, data.created_by || 'admin'])
  return { id: info.lastInsertRowid }
})

ipcMain.handle('adjustments:delete', (_, id) => {
  getDb().prepare('DELETE FROM bill_adjustments WHERE id=?').run(id)
  return { ok: true }
})

// ─── Phase 3: Carry-over Balances ────────────────────────────────────────────

ipcMain.handle('carryover:list', (_, { to_term_id }) => {
  const db = getDb()
  return db.prepare(`
    SELECT cb.*, s.first_name, s.last_name, s.reg_number,
           t.name as from_term_name, ses.name as from_session_name
    FROM previous_term_balance cb
    JOIN students s ON s.id=cb.student_id
    JOIN terms t ON t.id=cb.from_term_id
    JOIN sessions ses ON ses.id=t.session_id
    WHERE cb.to_term_id=?
    ORDER BY s.last_name, s.first_name
  `).all(to_term_id)
})

ipcMain.handle('carryover:post', (_, { student_id, from_term_id, to_term_id, balance_amount }) => {
  const db = getDb()
  // Check if already exists for this student/term pair
  const existing = db.prepare(
    'SELECT id FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
  ).get([student_id, to_term_id])
  if (existing) {
    db.prepare('UPDATE previous_term_balance SET balance_amount=?, from_term_id=? WHERE id=?')
      .run([balance_amount, from_term_id, existing.id])
    return { id: existing.id }
  }
  const info = db.prepare(`
    INSERT INTO previous_term_balance (student_id, from_term_id, to_term_id, balance_amount)
    VALUES (?,?,?,?)
  `).run([student_id, from_term_id, to_term_id, balance_amount])
  return { id: info.lastInsertRowid }
})

ipcMain.handle('carryover:delete', (_, id) => {
  getDb().prepare('DELETE FROM previous_term_balance WHERE id=?').run(id)
  return { ok: true }
})

// Auto carry-over: compute all unpaid balances from a previous term and post to current term
ipcMain.handle('carryover:auto-compute', (_, { from_term_id, to_term_id }) => {
  const db = getDb()
  const students = db.prepare(`
    SELECT DISTINCT ss.student_id FROM student_status ss
    WHERE ss.term_id=? AND ss.status='active'
  `).all(from_term_id)

  let posted = 0, zero = 0
  db.exec('BEGIN')
  try {
    for (const { student_id } of students) {
      const bills = db.prepare(
        'SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=?'
      ).get([student_id, from_term_id])?.t || 0

      const paid = db.prepare(
        'SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=?'
      ).get([student_id, from_term_id])?.t || 0

      const prevBal = db.prepare(
        'SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
      ).get([student_id, from_term_id])?.t || 0

      const balance = Number(bills) + Number(prevBal) - Number(paid)

      if (balance <= 0) { zero++; continue }

      const existing = db.prepare(
        'SELECT id FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
      ).get([student_id, to_term_id])

      if (existing) {
        db.prepare('UPDATE previous_term_balance SET balance_amount=?, from_term_id=? WHERE id=?')
          .run([balance, from_term_id, existing.id])
      } else {
        db.prepare(`INSERT INTO previous_term_balance (student_id, from_term_id, to_term_id, balance_amount)
          VALUES (?,?,?,?)`).run([student_id, from_term_id, to_term_id, balance])
      }
      posted++
    }
  
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }
  return { ok: true, posted, zero }
})


// Regenerate bills for a single student (when their profile changes)
// Deletes existing pending bills for current term and regenerates
ipcMain.handle('bills:regenerate-student', (_, { student_id, term_id }) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) throw new Error('No current term set')

  // Check student has no payments in this term (cannot regen if paid)
  const paid = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0')
    .get([student_id, tid])?.t || 0
  if (Number(paid) > 0) {
    throw new Error('Cannot regenerate bills — this student already has payments posted. Reverse payments first, or use adjustments instead.')
  }

  // Get student current class
  const status = db.prepare('SELECT * FROM student_status WHERE student_id=? AND term_id=?').get([student_id, tid])
  if (!status) throw new Error('Student has no class assignment for the current term')

  const student = db.prepare('SELECT * FROM students WHERE id=?').get([student_id])
  if (!student) throw new Error('Student not found')

  // Get configs for this class/term
  const configs = db.prepare('SELECT * FROM bill_config WHERE class_id=? AND term_id=? AND is_active=1').all([status.class_id, tid])
  const gMap = { M: 'male', F: 'female' }

  db.exec('BEGIN')
  try {
    // Delete existing PENDING bill lines (waived ones stay for record)
    db.prepare("DELETE FROM student_bills WHERE student_id=? AND term_id=? AND status='pending'").run([student_id, tid])

    let generated = 0
    for (const config of configs) {
      const gOk = config.gender_rule === 'all' || config.gender_rule === gMap[student.gender]
      const tOk = config.student_type_rule === 'all' || config.student_type_rule === student.entry_type
      const bOk = config.boarding_rule === 'all' || config.boarding_rule === (student.boarding_type || 'day')
      if (!gOk || !tOk || !bOk) continue
      const r = db.prepare(`INSERT OR IGNORE INTO student_bills (student_id,term_id,bill_config_id,amount,is_compulsory,status) VALUES (?,?,?,?,?,'pending')`)
        .run([student_id, tid, config.id, config.amount, config.is_compulsory])
      if (r.changes > 0) generated++
    }
    db.exec('COMMIT')
    return { ok: true, generated, message: `Bills regenerated: ${generated} fee lines based on updated profile` }
  } catch(e) { db.exec('ROLLBACK'); throw e }
})

}
