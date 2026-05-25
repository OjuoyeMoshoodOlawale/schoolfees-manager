const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_paymentsHandlers() {
// ─── Phase 4: Payments ───────────────────────────────────────────────────────

ipcMain.handle('payments:next-receipt', () => {
  const db = getDb()
  const year = new Date().getFullYear()
  const row = db.prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`)
    .get([`RCP-${year}-%`])
  if (!row) return `RCP-${year}-0001`
  const parts = row.receipt_number.split('-')
  const next = String(parseInt(parts[2] || '0') + 1).padStart(4, '0')
  return `RCP-${year}-${next}`
})

ipcMain.handle('payments:post', (_, data) => {
  const db = getDb()
  const { student_id, amount_paid, payment_date, payment_method, reference = '', posted_by = 'admin' } = data
  // Enforce current term only
  const term = db.prepare('SELECT id FROM terms WHERE is_current=1').get()
  if (!term) throw new Error('No current term set. Cannot post payment.')
  const receipt_number = data.receipt_number || (() => {
    const year = new Date().getFullYear()
    const row = db.prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`).get([`RCP-${year}-%`])
    if (!row) return `RCP-${year}-0001`
    const parts = row.receipt_number.split('-')
    return `RCP-${year}-${String(parseInt(parts[2] || '0') + 1).padStart(4, '0')}`
  })()

  const info = db.prepare(`INSERT INTO payments
    (student_id, term_id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run([student_id, term.id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by])

  const paymentId = info.lastInsertRowid

  db.prepare(`INSERT INTO audit_log (action, table_name, record_id, details)
    VALUES ('PAYMENT_POSTED','payments',?,?)`)
    .run([paymentId, JSON.stringify({ student_id, amount_paid, receipt_number })])

  // Auto SMS/Email if enabled (fire and forget - don't block payment posting)
  try {
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const student  = db.prepare('SELECT * FROM students WHERE id=?').get([student_id])
    if (settings?.sms_enabled && student?.parent_phone) {
      const msg = `Dear ${student.parent_name || 'Parent'}, payment of ${amount_paid.toLocaleString('en-NG', {style:'currency',currency:'NGN'})} received for ${student.first_name} ${student.last_name}. Receipt: ${receipt_number}. - ${settings.school_name}`
      db.prepare(`INSERT INTO sms_log (phone, student_id, message, status) VALUES (?,?,?,'pending')`)
        .run([student.parent_phone, student_id, msg])
    }
    if (settings?.email_enabled && student?.parent_email) {
      db.prepare(`INSERT INTO email_log (email, student_id, subject, body, status) VALUES (?,?,?,?,'pending')`)
        .run([student.parent_email, student_id, `Payment Receipt - ${receipt_number}`,
          `Payment of ${amount_paid} received. Receipt No: ${receipt_number}`])
    }
  } catch(e) { /* non-critical — don't fail the payment */ }

  return { id: paymentId, receipt_number }
})

ipcMain.handle('payments:list', (_, { student_id, term_id } = {}) => {
  const db = getDb()
  let sql = `SELECT p.*, s.first_name, s.last_name, s.reg_number,
    c.name as class_name, t.name as term_name, ses.name as session_name
    FROM payments p
    JOIN students s ON s.id = p.student_id
    JOIN terms t ON t.id = p.term_id
    JOIN sessions ses ON ses.id = t.session_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    WHERE 1=1`
  const params = []
  if (student_id) { sql += ' AND p.student_id=?'; params.push(student_id) }
  if (term_id)    { sql += ' AND p.term_id=?';    params.push(term_id) }
  sql += ' ORDER BY p.id DESC'
  return db.prepare(sql).all(params.length ? params : undefined)
})

ipcMain.handle('payments:get', (_, id) => {
  const db = getDb()
  return db.prepare(`SELECT p.*, s.first_name, s.last_name, s.reg_number,
    c.name as class_name, t.name as term_name, ses.name as session_name
    FROM payments p
    JOIN students s ON s.id=p.student_id
    JOIN terms t ON t.id=p.term_id
    JOIN sessions ses ON ses.id=t.session_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    WHERE p.id=?`).get([id])
})

ipcMain.handle('payments:delete', (_, id) => {
  getDb().prepare('DELETE FROM payments WHERE id=?').run([id])
  return { ok: true }
})

ipcMain.handle('payments:receipt-data', (_, id) => {
  const db = getDb()
  const payment = db.prepare(`SELECT p.*, s.first_name, s.last_name, s.reg_number,
    s.parent_name, s.parent_phone,
    c.name as class_name, t.name as term_name, ses.name as session_name
    FROM payments p
    JOIN students s ON s.id=p.student_id
    JOIN terms t ON t.id=p.term_id
    JOIN sessions ses ON ses.id=t.session_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    WHERE p.id=?`).get([id])
  const school = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
  // Get student bill summary for context
  const bills = db.prepare(`SELECT sb.amount, fi.name as fee_item_name, sb.is_compulsory
    FROM student_bills sb
    JOIN bill_config bc ON bc.id=sb.bill_config_id
    JOIN fee_items fi ON fi.id=bc.fee_item_id
    WHERE sb.student_id=? AND sb.term_id=?`).all([payment.student_id, payment.term_id])
  const totalBilled = bills.reduce((s, b) => s + b.amount, 0)
  const allPayments = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=?')
    .get([payment.student_id, payment.term_id])
  return { payment, school, bills, totalBilled, totalPaid: allPayments.t }
})

// ─── Phase 4: Debtors ────────────────────────────────────────────────────────

ipcMain.handle('debtors:list', (_, { term_id, class_id } = {}) => {
  const db = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return []

  let sql = `SELECT s.id, s.first_name, s.last_name, s.reg_number, s.gender,
    s.boarding_type, s.entry_type, c.name as class_name, ss.class_id
    FROM students s
    JOIN student_status ss ON ss.student_id=s.id AND ss.term_id=? AND ss.status='active'
    JOIN classes c ON c.id=ss.class_id`
  const params = [tid]
  if (class_id) { sql += ' WHERE ss.class_id=?'; params.push(class_id) }
  sql += ' ORDER BY s.last_name, s.first_name'

  const students = db.prepare(sql).all(params)

  return students.map(student => {
    const billed = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=? AND status!=?')
      .get([student.id, tid, 'waived'])?.t || 0
    const prevBal = db.prepare('SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?')
      .get([student.id, tid])?.t || 0
    const adjs = db.prepare('SELECT * FROM bill_adjustments WHERE student_id=? AND term_id=?').all([student.id, tid])
    let adjTotal = 0
    for (const a of adjs) {
      const val = a.calc_mode === 'percent' ? (a.amount / 100) * Number(billed) : a.amount
      adjTotal += a.type === 'addition' ? val : -val
    }
    const totalExpected = Number(billed) + Number(prevBal) + adjTotal
    const paid = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=?')
      .get([student.id, tid])?.t || 0
    const balance = totalExpected - Number(paid)
    const lastPayment = db.prepare('SELECT payment_date FROM payments WHERE student_id=? AND term_id=? ORDER BY id DESC LIMIT 1')
      .get([student.id, tid])
    return {
      ...student, total_expected: totalExpected, total_paid: Number(paid),
      balance, last_payment_date: lastPayment?.payment_date || null
    }
  }).filter(s => s.balance > 0.01) // only actual debtors
})

// ─── Phase 5: Reports & Dashboard ────────────────────────────────────────────

ipcMain.handle('reports:dashboard', () => {
  const db = getDb()
  const term = db.prepare('SELECT t.*, s.name as session_name FROM terms t JOIN sessions s ON s.id=t.session_id WHERE t.is_current=1').get()
  if (!term) return null

  const totalStudents = db.prepare("SELECT COUNT(*) as c FROM student_status WHERE term_id=? AND status='active'").get([term.id])?.c || 0
  const totalBilled   = db.prepare("SELECT COALESCE(SUM(sb.amount),0) as t FROM student_bills sb WHERE sb.term_id=? AND sb.status!='waived'").get([term.id])?.t || 0
  const totalPaid     = db.prepare("SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE term_id=?").get([term.id])?.t || 0
  const debtorCount   = db.prepare(`SELECT COUNT(DISTINCT student_id) as c FROM students s
    JOIN student_status ss ON ss.student_id=s.id AND ss.term_id=? AND ss.status='active'
    WHERE (SELECT COALESCE(SUM(amount_paid),0) FROM payments WHERE student_id=s.id AND term_id=?) <
          (SELECT COALESCE(SUM(amount),0) FROM student_bills WHERE student_id=s.id AND term_id=? AND status!='waived')`)
    .get([term.id, term.id, term.id])?.c || 0

  // Per-class collection
  const classes = db.prepare('SELECT * FROM classes WHERE is_active=1 ORDER BY level').all()
  const classStats = classes.map(cls => {
    const billed = db.prepare(`SELECT COALESCE(SUM(sb.amount),0) as t FROM student_bills sb
      JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id
      WHERE sb.term_id=? AND ss.class_id=? AND sb.status!='waived'`).get([term.id, cls.id])?.t || 0
    const paid = db.prepare(`SELECT COALESCE(SUM(p.amount_paid),0) as t FROM payments p
      JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
      WHERE p.term_id=? AND ss.class_id=?`).get([term.id, cls.id])?.t || 0
    return { class_name: cls.name, billed: Number(billed), paid: Number(paid),
      pct: Number(billed) > 0 ? Math.round((Number(paid)/Number(billed))*100) : 0 }
  }).filter(c => c.billed > 0)

  // Recent payments (last 8)
  const recentPayments = db.prepare(`SELECT p.*, s.first_name, s.last_name, c.name as class_name
    FROM payments p JOIN students s ON s.id=p.student_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    WHERE p.term_id=? ORDER BY p.id DESC LIMIT 8`).all([term.id])

  return { term, totalStudents, totalBilled: Number(totalBilled), totalPaid: Number(totalPaid),
    balance: Number(totalBilled) - Number(totalPaid),
    collectionPct: Number(totalBilled) > 0 ? Math.round((Number(totalPaid)/Number(totalBilled))*100) : 0,
    debtorCount, classStats, recentPayments }
})

ipcMain.handle('reports:account', (_, { session_id, term_id } = {}) => {
  const db = getDb()
  let termFilter = term_id ? 'AND sb.term_id=?' : ''
  let params = term_id ? [term_id] : []

  // By fee item
  const byFeeItem = db.prepare(`SELECT fi.name as fee_item, 
    COALESCE(SUM(sb.amount),0) as total_billed,
    COUNT(DISTINCT sb.student_id) as student_count
    FROM student_bills sb
    JOIN bill_config bc ON bc.id=sb.bill_config_id
    JOIN fee_items fi ON fi.id=bc.fee_item_id
    ${term_id ? 'WHERE sb.term_id=?' : ''}
    GROUP BY fi.name ORDER BY total_billed DESC`).all(params)

  // By class
  const byClass = db.prepare(`SELECT c.name as class_name,
    COALESCE(SUM(sb.amount),0) as total_billed,
    COALESCE(SUM(p_total.paid),0) as total_paid
    FROM student_bills sb
    JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id
    JOIN classes c ON c.id=ss.class_id
    LEFT JOIN (SELECT student_id, term_id, SUM(amount_paid) as paid FROM payments GROUP BY student_id, term_id) p_total
      ON p_total.student_id=sb.student_id AND p_total.term_id=sb.term_id
    ${term_id ? 'WHERE sb.term_id=?' : ''}
    GROUP BY c.name ORDER BY c.name`).all(params)

  // Payment methods breakdown
  const byMethod = db.prepare(`SELECT payment_method, COUNT(*) as count,
    SUM(amount_paid) as total
    FROM payments ${term_id ? 'WHERE term_id=?' : ''}
    GROUP BY payment_method`).all(params)

  return { byFeeItem, byClass, byMethod }
})


}
