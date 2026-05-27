const { ipcMain } = require('electron')
const { safeHandle, logError } = require('./errorHandler')
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

safeHandle('payments:post', (_, data) => {
  const db = getDb()
  const { student_id, amount_paid, payment_date, payment_method, reference = '', posted_by = 'admin' } = data

  // ── Validation ──────────────────────────────────────────────────────────
  if (!student_id) throw new Error('No student selected.')
  const amt = Number(amount_paid)
  if (isNaN(amt) || amt <= 0) throw new Error('Payment amount must be greater than zero.')
  if (amt > 100_000_000) throw new Error('Payment amount is unreasonably large. Please check the figure.')
  if (!payment_date) throw new Error('Payment date is required.')

  // Enforce current term only
  const term = db.prepare('SELECT id FROM terms WHERE is_current=1').get()
  if (!term) throw new Error('No current term set. Cannot post payment.')

  // Verify student exists
  const studentExists = db.prepare('SELECT id FROM students WHERE id=?').get([student_id])
  if (!studentExists) throw new Error('Student not found.')

  const receipt_number = data.receipt_number || (() => {
    const year = new Date().getFullYear()
    const row = db.prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`).get([`RCP-${year}-%`])
    if (!row) return `RCP-${year}-0001`
    const parts = row.receipt_number.split('-')
    return `RCP-${year}-${String(parseInt(parts[2] || '0') + 1).padStart(4, '0')}`
  })()

  // ── Wrap payment + journal in a transaction (all-or-nothing) ──────────────
  let paymentId
  db.exec('BEGIN')
  try {
    const info = db.prepare(`INSERT INTO payments
      (student_id, term_id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run([student_id, term.id, receipt_number, amt, payment_date, payment_method, reference, posted_by])

    paymentId = info.lastInsertRowid

    db.prepare(`INSERT INTO audit_log (action, table_name, record_id, details)
      VALUES ('PAYMENT_POSTED','payments',?,?)`)
      .run([paymentId, JSON.stringify({ student_id, amount_paid: amt, receipt_number })])

    // ── Auto-journal entry if accounting is enabled (inside transaction) ────
    const acctEnabled = db.prepare("SELECT value FROM app_state WHERE key='accounting_enabled'").get()?.value
    if (acctEnabled === '1') {
      const bankAcc = db.prepare("SELECT id FROM accounts WHERE code='1010' AND is_active=1").get()
      const feeAcc  = db.prepare("SELECT id FROM accounts WHERE code='4000' AND is_active=1").get()
      if (bankAcc && feeAcc) {
        const ref = `AUTO-PMT-${receipt_number}`
        const entryId = db.prepare(`INSERT INTO journal_entries (reference, description, entry_date, entry_type, posted_by)
          VALUES (?,?,?,'payment',?)`)
          .run([ref, `Payment received: ${receipt_number}`, payment_date, posted_by]).lastInsertRowid
        db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,0)')
          .run([entryId, bankAcc.id, amt])
        db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES (?,?,0,?)')
          .run([entryId, feeAcc.id, amt])
      }
    }

    db.exec('COMMIT')
  } catch(e) {
    db.exec('ROLLBACK')
    throw e
  }

  // ── Auto-send receipt (SMS + Email) ─────────────────────────────────────────
  // Fires asynchronously — never blocks the payment response. Both channels are
  // independent: SMS controlled by auto_send_receipt + sms_enabled, Email by
  // auto_send_email_receipt + email_enabled. Skip reasons are logged so the
  // bursar can see why a receipt didn't go (no email, SMS off, etc.) in the logs.
  setImmediate(async () => {
    try {
      const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
      const student  = db.prepare('SELECT * FROM students WHERE id=?').get([student_id])
      if (!student) return

      const termRow  = db.prepare('SELECT t.*, s.name as session_name FROM terms t JOIN sessions s ON s.id=t.session_id WHERE t.id=?').get([term.id])
      const classRow = db.prepare('SELECT c.name FROM student_status ss JOIN classes c ON c.id=ss.class_id WHERE ss.student_id=? AND ss.term_id=?').get([student_id, term.id])
      const totalBilled = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=? AND status NOT IN ('waived','frozen')").get([student_id, term.id])?.t || 0
      const totalPaid   = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid>0').get([student_id, term.id])?.t || 0
      const balance     = Math.max(0, Number(totalBilled) - Number(totalPaid))

      const schoolName = settings.school_name || 'SchoolFees Manager'
      const currency   = settings.currency_symbol || '₦'
      const fmtAmt = n => currency + Number(n||0).toLocaleString('en-NG', { minimumFractionDigits: 2 })

      // ── SMS receipt ─────────────────────────────────────────────────────────
      if (settings?.auto_send_receipt) {
        const { sendSms, logSms } = require('./communications')
        if (!settings.sms_enabled) {
          logSms(db, { phone: student.parent_phone || '(none)', student_id, message: `Receipt ${receipt_number}`,
            result: { ok: false, error: 'SMS provider disabled in Settings' } })
        } else if (!student.parent_phone) {
          logSms(db, { phone: '(none)', student_id, message: `Receipt ${receipt_number}`,
            result: { ok: false, error: 'Student has no parent phone number' } })
        } else {
          const msg = `${schoolName}: Payment received. Receipt ${receipt_number}. Amount: ${fmtAmt(amt)}. Balance: ${fmtAmt(balance)}. For ${student.first_name} ${student.last_name}${classRow ? ' ('+classRow.name+')' : ''}. Thank you.`
          const r = await sendSms(settings, student.parent_phone, msg)
          logSms(db, { phone: student.parent_phone, student_id, message: msg, result: r })
        }
      }

      // ── Email receipt ───────────────────────────────────────────────────────
      if (settings?.auto_send_email_receipt) {
        const { sendEmail, buildReceiptHtml, logEmail } = require('./communications')
        if (!settings.email_enabled) {
          logEmail(db, { email: student.parent_email || '(none)', student_id, subject: `Receipt ${receipt_number}`,
            body: '', result: { ok: false, error: 'Email sending disabled in Settings' } })
        } else if (!student.parent_email) {
          logEmail(db, { email: '(none)', student_id, subject: `Receipt ${receipt_number}`,
            body: '', result: { ok: false, error: 'Student has no parent email' } })
        } else {
          const html = buildReceiptHtml({ settings, student, termRow, classRow, balance,
            receipt_number, amount_paid: amt, payment_date, payment_method, reference })
          const result = await sendEmail(settings, {
            to: student.parent_email,
            subject: `Payment Receipt ${receipt_number} — ${schoolName}`,
            html, logoPath: settings.logo_path || null,
          })
          logEmail(db, { email: student.parent_email, student_id, subject: `Receipt ${receipt_number}`, body: html, result })
        }
      }
    } catch(e) {
      console.error('[auto-receipt] Error:', e.message)
      try {
        const { logError } = require('./errorHandler')
        logError({ handler: 'auto-receipt', message: e.message, stack: e.stack,
          context: JSON.stringify({ student_id, receipt_number }), severity: 'warning' })
      } catch {}
    }
  })

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


safeHandle('payments:reverse', (_, { payment_id, reason, reversed_by }) => {
  const db = getDb()
  const payment = db.prepare('SELECT * FROM payments WHERE id=?').get([payment_id])
  if (!payment) throw new Error('Payment not found')
  if (payment.is_reversed) throw new Error('This payment has already been reversed')

  // Only current term payments can be reversed
  const currentTerm = db.prepare('SELECT id FROM terms WHERE is_current=1').get()
  if (!currentTerm || payment.term_id !== currentTerm.id) {
    throw new Error('Only payments from the current term can be reversed')
  }

  db.exec('BEGIN')
  try {
    // Mark original as reversed
    db.prepare('UPDATE payments SET is_reversed=1, reversal_reason=?, reversed_by=?, reversed_at=datetime(\'now\') WHERE id=?')
      .run([reason || 'Reversed by ' + (reversed_by || 'admin'), reversed_by || 'admin', payment_id])

    // Create a reversal record (negative amount for audit trail)
    const year = new Date().getFullYear()
    const last = db.prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`).get([`RCP-${year}-%`])
    const seq  = last ? String(parseInt(last.receipt_number.split('-')[2]) + 1).padStart(4,'0') : '0001'
    const reversal_receipt = `REV-${year}-${seq}`

    db.prepare(`INSERT INTO payments
      (student_id, term_id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by, is_reversed)
      VALUES (?,?,?,?,date('now'),?,?,?,1)`)
      .run([payment.student_id, payment.term_id, reversal_receipt,
            -Math.abs(payment.amount_paid),
            payment.payment_method,
            'REVERSAL of ' + payment.receipt_number,
            reversed_by || 'admin'])

    db.prepare(`INSERT INTO audit_log (action, table_name, record_id, performed_by, details)
      VALUES ('PAYMENT_REVERSED','payments',?,?,?)`)
      .run([payment_id, reversed_by || 'admin',
            JSON.stringify({ original_receipt: payment.receipt_number, reason, amount: payment.amount_paid })])

    // ── Reverse journal entry if accounting enabled ───────────────────────
    try {
      const acctEnabled = db.prepare("SELECT value FROM app_state WHERE key='accounting_enabled'").get()?.value
      if (acctEnabled === '1') {
        const bankAcc = db.prepare("SELECT id FROM accounts WHERE code='1010' AND is_active=1").get()
        const feeAcc  = db.prepare("SELECT id FROM accounts WHERE code='4000' AND is_active=1").get()
        if (bankAcc && feeAcc) {
          const amt = Math.abs(payment.amount_paid)
          const ref = `AUTO-REV-${reversal_receipt}`
          const entryId = db.prepare(`INSERT INTO journal_entries (reference, description, entry_date, entry_type, posted_by)
            VALUES (?,?,date('now'),'payment',?)`)
            .run([ref, `Payment reversal: ${payment.receipt_number}`, reversed_by || 'admin']).lastInsertRowid
          // Reverse: Dr income, Cr bank
          db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES (?,?,?,0)')
            .run([entryId, feeAcc.id, amt])
          db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES (?,?,0,?)')
            .run([entryId, bankAcc.id, amt])
        }
      }
    } catch(e) { /* non-critical */ }

    db.exec('COMMIT')

    // Send reversal alert to parent asynchronously
    setImmediate(async () => {
      try {
        const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
        if (!settings?.auto_send_receipt) return
        const student  = db.prepare('SELECT * FROM students WHERE id=?').get([payment.student_id])
        if (!student) return
        const currency = settings.currency_symbol || '₦'
        const fmtAmt = n => currency + Number(n||0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
        const schoolName = settings.school_name || 'SchoolFees Manager'

        // SMS reversal alert
        if (settings.sms_enabled && student.parent_phone) {
          const { sendSms, logSms } = require('./communications')
          const msg = `${schoolName}: REVERSAL NOTICE — Payment of ${fmtAmt(payment.amount_paid)} (Receipt ${payment.receipt_number}) for ${student.first_name} ${student.last_name} has been reversed. Ref: ${reversal_receipt}. Reason: ${reason || 'Not stated'}.`
          const r = await sendSms(settings, student.parent_phone, msg)
          logSms(db, { phone: student.parent_phone, student_id: student.id, message: msg, result: r })
        }
        // Email reversal alert
        if (settings.email_enabled && student.parent_email) {
          const { sendEmail, logEmail } = require('./communications')
          const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:2px solid #fca5a5">
            <h2 style="color:#dc2626;text-align:center">&#9888; Payment Reversal Notice</h2>
            <p style="color:#374151">Dear ${student.parent_name || 'Parent'},</p>
            <p>A payment for <strong>${student.first_name} ${student.last_name}</strong> has been reversed:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:6px 0;color:#6b7280">Original Receipt</td><td style="font-weight:600">${payment.receipt_number}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td style="font-weight:600;color:#dc2626">${fmtAmt(payment.amount_paid)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Reversal Receipt</td><td style="font-weight:600">${reversal_receipt}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td>${reason || 'Not stated'}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:13px">If you have questions, contact ${schoolName}${settings.phone ? ' on '+settings.phone : ''}.</p>
          </div>`
          const r = await sendEmail(settings, { to: student.parent_email, subject: `Payment Reversal Notice — ${reversal_receipt} | ${schoolName}`, html })
          logEmail(db, { email: student.parent_email, student_id: student.id, subject: `Reversal ${reversal_receipt}`, body: html, result: r })
        }
      } catch(e) { console.error('[reversal-notify]', e.message) }
    })

    return { ok: true, reversal_receipt }
  } catch(e) { db.exec('ROLLBACK'); throw e }
})







// ─── Overpayment: carry credit to next term ───────────────────────────────────
// When paid > billed, the surplus is automatically carried forward as credit
// to the student's next term when change-term or promote runs.
// This is handled in the carryover:auto-compute handler (billing.js) which
// already supports negative balances. This handler exposes manual credit carry.
ipcMain.handle('payments:carry-credit', (_, { student_id, from_term_id, to_term_id }) => {
  const db = getDb()
  const billed  = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=? AND status NOT IN ('waived','frozen')").get([student_id, from_term_id])?.t || 0
  const paid    = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid>0').get([student_id, from_term_id])?.t || 0
  const credit  = Number(paid) - Number(billed)

  if (credit <= 0) return { ok: false, error: 'No credit to carry — student has not overpaid' }

  // Store as negative balance (credit) in previous_term_balance
  const ex = db.prepare('SELECT id FROM previous_term_balance WHERE student_id=? AND to_term_id=?').get([student_id, to_term_id])
  if (ex) {
    db.prepare('UPDATE previous_term_balance SET balance_amount=? WHERE id=?').run([-credit, ex.id])
  } else {
    db.prepare('INSERT INTO previous_term_balance (student_id,from_term_id,to_term_id,balance_amount) VALUES (?,?,?,?)').run([student_id, from_term_id, to_term_id, -credit])
  }
  return { ok: true, credit }
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
  const totalPaid     = db.prepare("SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE term_id=? AND is_reversed=0 AND amount_paid>0").get([term.id])?.t || 0
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
  const params = term_id ? [term_id] : []

  // By fee item — exclude waived and frozen bills
  const byFeeItem = db.prepare(`
    SELECT fi.name as fee_item,
      COALESCE(SUM(sb.amount), 0) as total_billed,
      COUNT(DISTINCT sb.student_id) as student_count
    FROM student_bills sb
    JOIN bill_config bc ON bc.id = sb.bill_config_id
    JOIN fee_items fi   ON fi.id = bc.fee_item_id
    WHERE sb.status NOT IN ('waived','frozen')
    ${term_id ? 'AND sb.term_id=?' : ''}
    GROUP BY fi.name
    ORDER BY total_billed DESC
  `).all(params)

  // By class: bills and payments aggregated separately to avoid JOIN multiplication
  // Student→class lookup uses student_status as primary source (catches students with
  // payments but no bills yet), then overrides with bills-derived class for accuracy.
  const billsByClass = db.prepare(`
    SELECT ss.class_id, COALESCE(SUM(sb.amount), 0) as total_billed
    FROM student_bills sb
    JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id
    WHERE sb.status NOT IN ('waived','frozen')
    ${term_id ? 'AND sb.term_id=?' : ''}
    GROUP BY ss.class_id
  `).all(params)

  // Base class map from student_status — catches students with payments but missing bills
  const studentClassMap = new Map(
    db.prepare(`SELECT student_id, class_id FROM student_status ${term_id ? 'WHERE term_id=?' : ''}`)
      .all(params).map(r => [r.student_id, r.class_id])
  )
  // Override with bills-derived class (more accurate when bills exist)
  db.prepare(`
    SELECT DISTINCT sb.student_id, ss.class_id
    FROM student_bills sb
    JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id
    WHERE sb.status NOT IN ('waived','frozen') ${term_id ? 'AND sb.term_id=?' : ''}
  `).all(params).forEach(r => studentClassMap.set(r.student_id, r.class_id))

  // Sum payments per student
  const paymentRows = db.prepare(`
    SELECT student_id, COALESCE(SUM(amount_paid), 0) as paid
    FROM payments
    WHERE is_reversed=0 AND amount_paid>0 ${term_id ? 'AND term_id=?' : ''}
    GROUP BY student_id
  `).all(params)

  const paidPerClass = new Map()
  for (const row of paymentRows) {
    const classId = studentClassMap.get(row.student_id)
    if (classId === undefined) continue
    paidPerClass.set(classId, (paidPerClass.get(classId) || 0) + Number(row.paid))
  }

  // Merge classes from both bills and payments so nothing is dropped
  const classNames = db.prepare('SELECT id, name FROM classes').all()
  const classMap   = new Map(classNames.map(c => [c.id, c.name]))
  const allClassIds = new Set([...billsByClass.map(r => r.class_id), ...paidPerClass.keys()])
  const billsMap   = new Map(billsByClass.map(r => [r.class_id, Number(r.total_billed)]))

  const byClass = [...allClassIds].map(cid => ({
    class_name:   classMap.get(cid) || `Class ${cid}`,
    total_billed: billsMap.get(cid) || 0,
    total_paid:   paidPerClass.get(cid) || 0,
  })).sort((a, b) => a.class_name.localeCompare(b.class_name))

  // Payment methods — exclude reversed payments
  const byMethod = db.prepare(`
    SELECT payment_method,
      COUNT(*) as count,
      SUM(amount_paid) as total
    FROM payments
    WHERE is_reversed = 0
      AND amount_paid > 0
    ${term_id ? 'AND term_id=?' : ''}
    GROUP BY payment_method
    ORDER BY total DESC
  `).all(params)

  // Overall totals — computed correctly from same filtered sources
  const totalBilled  = byClass.reduce((s, r) => s + Number(r.total_billed), 0)
  const totalPaid    = byClass.reduce((s, r) => s + Number(r.total_paid),   0)

  return { byFeeItem, byClass, byMethod, totalBilled, totalPaid, balance: totalBilled - totalPaid }
})


}

// ─── Collection Summary — daily/weekly totals ─────────────────────────────────
ipcMain.handle('reports:collection-summary', (_, { term_id, days = 30 } = {}) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return null

  const daily = db.prepare(`
    SELECT date(payment_date) as day,
      COUNT(*) as transactions,
      COALESCE(SUM(amount_paid), 0) as total,
      payment_method
    FROM payments
    WHERE term_id=? AND is_reversed=0 AND amount_paid>0
      AND date(payment_date) >= date('now', ? || ' days')
    GROUP BY day, payment_method
    ORDER BY day DESC
  `).all([tid, `-${days}`])

  const byDay = {}
  for (const r of daily) {
    if (!byDay[r.day]) byDay[r.day] = { day: r.day, total: 0, transactions: 0, methods: {} }
    byDay[r.day].total        += Number(r.total)
    byDay[r.day].transactions += Number(r.transactions)
    byDay[r.day].methods[r.payment_method] = (byDay[r.day].methods[r.payment_method] || 0) + Number(r.total)
  }

  const topStudents = db.prepare(`
    SELECT s.first_name, s.last_name, s.reg_number,
      c.name as class_name,
      COALESCE(SUM(p.amount_paid), 0) as total_paid
    FROM payments p
    JOIN students s ON s.id=p.student_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    WHERE p.term_id=? AND p.is_reversed=0 AND p.amount_paid>0
    GROUP BY p.student_id ORDER BY total_paid DESC LIMIT 10
  `).all([tid])

  const grandTotal = db.prepare(
    'SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE term_id=? AND is_reversed=0 AND amount_paid>0'
  ).get([tid])?.t || 0

  return { daily: Object.values(byDay).sort((a,b) => b.day.localeCompare(a.day)), topStudents, grandTotal: Number(grandTotal) }
})

// ─── Class Fee Status — all students in a class this term ─────────────────────
ipcMain.handle('reports:class-fee-status', (_, { class_id, term_id }) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid || !class_id) return []

  const students = db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.reg_number, s.gender, s.boarding_type, s.entry_type
    FROM students s
    JOIN student_status ss ON ss.student_id=s.id
    WHERE ss.term_id=? AND ss.class_id=? AND ss.status='active'
    ORDER BY s.last_name, s.first_name
  `).all([tid, class_id])

  return students.map(s => {
    const billed = db.prepare(
      "SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=? AND status NOT IN ('waived','frozen')"
    ).get([s.id, tid])?.t || 0

    const paid = db.prepare(
      'SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid>0'
    ).get([s.id, tid])?.t || 0

    const prevBal = db.prepare(
      'SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
    ).get([s.id, tid])?.t || 0

    const total    = Number(billed) + Number(prevBal)
    const balance  = total - Number(paid)
    const pct      = total > 0 ? Math.round((Number(paid) / total) * 100) : 0
    const status   = balance <= 0 ? 'paid' : Number(paid) === 0 ? 'unpaid' : 'partial'

    return { ...s, billed: Number(billed), prev_balance: Number(prevBal),
      total_expected: total, total_paid: Number(paid), balance, pct, payment_status: status }
  })
})

// ─── Student Ledger — full history across all terms ───────────────────────────
ipcMain.handle('reports:student-ledger', (_, { student_id }) => {
  const db = getDb()
  if (!student_id) return null

  const student = db.prepare('SELECT * FROM students WHERE id=?').get([student_id])
  if (!student) return null

  const terms = db.prepare(`
    SELECT ss.term_id, t.name as term_name, s.name as session_name,
      c.name as class_name, ss.status
    FROM student_status ss
    JOIN terms t ON t.id=ss.term_id
    JOIN sessions s ON s.id=ss.session_id
    JOIN classes c ON c.id=ss.class_id
    WHERE ss.student_id=? ORDER BY ss.term_id
  `).all([student_id])

  const history = terms.map(term => {
    const bills = db.prepare(`
      SELECT sb.*, fi.name as fee_item_name
      FROM student_bills sb
      JOIN bill_config bc ON bc.id=sb.bill_config_id
      JOIN fee_items fi ON fi.id=bc.fee_item_id
      WHERE sb.student_id=? AND sb.term_id=?
    `).all([student_id, term.term_id])

    const payments = db.prepare(
      'SELECT * FROM payments WHERE student_id=? AND term_id=? ORDER BY payment_date'
    ).all([student_id, term.term_id])

    const billed  = bills.reduce((s,b) => b.status === 'waived' ? s : s + Number(b.amount), 0)
    const paid    = payments.filter(p => !p.is_reversed && p.amount_paid > 0).reduce((s,p) => s + Number(p.amount_paid), 0)
    const prevBal = db.prepare(
      'SELECT COALESCE(SUM(balance_amount),0) as t FROM previous_term_balance WHERE student_id=? AND to_term_id=?'
    ).get([student_id, term.term_id])?.t || 0

    return { ...term, bills, payments, billed, paid, prev_balance: Number(prevBal),
      total_expected: billed + Number(prevBal), balance: billed + Number(prevBal) - paid }
  })

  const totalPaid   = history.reduce((s,t) => s + t.paid, 0)
  const totalBilled = history.reduce((s,t) => s + t.billed, 0)

  return { student, history, totalPaid, totalBilled }
})

// ─── Term End Report — full summary for current or selected term ──────────────
ipcMain.handle('reports:term-end', (_, { term_id } = {}) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return null

  const term = db.prepare(
    'SELECT t.*, s.name as session_name FROM terms t JOIN sessions s ON s.id=t.session_id WHERE t.id=?'
  ).get([tid])

  const classes = db.prepare('SELECT * FROM classes WHERE is_active=1 ORDER BY level').all()

  const classSummaries = classes.map(cls => {
    const enrolled  = db.prepare("SELECT COUNT(*) as n FROM student_status WHERE term_id=? AND class_id=? AND status='active'").get([tid, cls.id])?.n || 0
    const billed    = db.prepare("SELECT COALESCE(SUM(sb.amount),0) as t FROM student_bills sb JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id WHERE sb.term_id=? AND ss.class_id=? AND sb.status NOT IN ('waived','frozen')").get([tid, cls.id])?.t || 0
    const paid      = db.prepare("SELECT COALESCE(SUM(p.amount_paid),0) as t FROM payments p JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id WHERE p.term_id=? AND ss.class_id=? AND p.is_reversed=0 AND p.amount_paid>0").get([tid, cls.id])?.t || 0
    const fullPaid  = db.prepare("SELECT COUNT(DISTINCT s.id) as n FROM students s JOIN student_status ss ON ss.student_id=s.id AND ss.term_id=? AND ss.class_id=? WHERE (SELECT COALESCE(SUM(amount_paid),0) FROM payments WHERE student_id=s.id AND term_id=? AND is_reversed=0) >= (SELECT COALESCE(SUM(amount),0) FROM student_bills WHERE student_id=s.id AND term_id=? AND status NOT IN ('waived','frozen'))").get([tid, cls.id, tid, tid])?.n || 0
    if (enrolled === 0) return null
    const balance = Number(billed) - Number(paid)
    const pct     = Number(billed) > 0 ? Math.round((Number(paid)/Number(billed))*100) : 0
    return { class_name: cls.name, enrolled, billed: Number(billed), paid: Number(paid), balance, pct, fully_paid: fullPaid, defaulters: enrolled - fullPaid }
  }).filter(Boolean)

  const methodBreakdown = db.prepare(`
    SELECT payment_method, COUNT(*) as n, COALESCE(SUM(amount_paid),0) as total
    FROM payments WHERE term_id=? AND is_reversed=0 AND amount_paid>0
    GROUP BY payment_method ORDER BY total DESC
  `).all([tid])

  // Method × Class cross-tab: how much of each payment method came from each class
  const methodByClass = db.prepare(`
    SELECT p.payment_method, ss.class_id, c.name as class_name,
           COUNT(*) as n, COALESCE(SUM(p.amount_paid),0) as total
    FROM payments p
    JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    JOIN classes c ON c.id=ss.class_id
    WHERE p.term_id=? AND p.is_reversed=0 AND p.amount_paid>0
    GROUP BY p.payment_method, ss.class_id
    ORDER BY p.payment_method, c.level
  `).all([tid])

  const totalBilled   = classSummaries.reduce((s,c) => s + c.billed, 0)
  const totalPaid     = classSummaries.reduce((s,c) => s + c.paid, 0)
  const totalStudents = classSummaries.reduce((s,c) => s + c.enrolled, 0)
  const totalDefaulters = classSummaries.reduce((s,c) => s + c.defaulters, 0)

  // Reconciliation: class-total-paid must equal method-total — mismatch = data problem
  const methodTotal   = methodBreakdown.reduce((s,m) => s + Number(m.total), 0)
  const reconciliation = {
    classTotalPaid: totalPaid,
    methodTotalPaid: methodTotal,
    diff: Math.abs(totalPaid - methodTotal),
    ok: Math.abs(totalPaid - methodTotal) < 0.01   // float tolerance
  }

  return { term, classSummaries, methodBreakdown, methodByClass, reconciliation,
    totalBilled, totalPaid, totalStudents, totalDefaulters,
    balance: totalBilled - totalPaid, collectionPct: totalBilled > 0 ? Math.round((totalPaid/totalBilled)*100) : 0 }
})

// ─── Payment Audit Trail ──────────────────────────────────────────────────────
ipcMain.handle('reports:payment-audit', (_, { term_id, include_reversed = true } = {}) => {
  const db  = getDb()
  const tid = term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (!tid) return []

  return db.prepare(`
    SELECT p.*,
      s.first_name, s.last_name, s.reg_number,
      c.name as class_name,
      t.name as term_name, ses.name as session_name
    FROM payments p
    JOIN students s ON s.id=p.student_id
    LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
    LEFT JOIN classes c ON c.id=ss.class_id
    JOIN terms t ON t.id=p.term_id
    JOIN sessions ses ON ses.id=t.session_id
    WHERE p.term_id=?
    ${include_reversed ? '' : 'AND p.is_reversed=0'}
    ORDER BY p.created_at DESC
  `).all([tid])
})
