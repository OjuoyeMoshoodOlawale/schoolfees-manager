'use strict'
/**
 * Communications — unified SMS + Email module
 * Single source of truth for all sending logic.
 * No "pending" status — messages are either sent or failed immediately.
 */

const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

// ── Phone number normalizer ───────────────────────────────────────────────────
function normalizePhone(phone) {
  if (!phone) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('234'))                         return '+' + digits
  if (digits.startsWith('0') && digits.length === 11)  return '+234' + digits.slice(1)
  if (digits.length === 10)                            return '+234' + digits
  return '+' + digits
}

// ── SMS Providers ─────────────────────────────────────────────────────────────
const SMS_PROVIDERS = {
  termii: {
    name: 'Termii', website: 'https://termii.com', fields: ['api_key','sender_id'],
    async send(config, phone, message) {
      try {
        const res  = await fetch('https://api.ng.termii.com/api/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: normalizePhone(phone), from: config.sender_id||'SchoolFees',
            sms: message, type: 'plain', api_key: config.api_key, channel: 'generic' }),
        })
        const d = await res.json()
        if (d.code === 'ok' || d.message_id) return { ok: true, ref: d.message_id||'sent' }
        return { ok: false, error: d.message || 'Termii error' }
      } catch(e) { return { ok: false, error: e.message } }
    }
  },
  bulksms: {
    name: 'BulkSMS Nigeria', website: 'https://www.bulksmsnigeria.com', fields: ['api_token'],
    async send(config, phone, message) {
      try {
        const params = new URLSearchParams({ api_token: config.api_token||config.api_key,
          from: 'SchoolFees', to: normalizePhone(phone), body: message, dnd: 2 })
        const res  = await fetch(`https://www.bulksmsnigeria.com/api/v2/sms/create?${params}`)
        const d    = await res.json()
        if (d.data) return { ok: true, ref: String(d.data?.id||'sent') }
        return { ok: false, error: d.message || 'BulkSMS error' }
      } catch(e) { return { ok: false, error: e.message } }
    }
  },
  twilio: {
    name: 'Twilio', website: 'https://twilio.com', fields: ['account_sid','auth_token','from_number'],
    async send(config, phone, message) {
      try {
        const auth = Buffer.from(`${config.account_sid}:${config.auth_token}`).toString('base64')
        const res  = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: config.from_number, To: normalizePhone(phone), Body: message }),
        })
        const d = await res.json()
        if (d.sid) return { ok: true, ref: d.sid }
        return { ok: false, error: d.message || 'Twilio error' }
      } catch(e) { return { ok: false, error: e.message } }
    }
  },
}

// ── Core SMS sender (used everywhere) ────────────────────────────────────────
async function sendSms(settings, phone, message) {
  if (!settings?.sms_enabled) return { ok: false, error: 'SMS not enabled in Settings' }
  const provider = SMS_PROVIDERS[settings.sms_provider]
  if (!provider)  return { ok: false, error: `Unknown SMS provider: ${settings.sms_provider}` }
  if (!phone?.trim()) return { ok: false, error: 'No phone number' }
  return provider.send(
    { api_key: settings.sms_api_key, sender_id: settings.sms_sender_id,
      account_sid: settings.sms_api_key, auth_token: settings.sms_sender_id, from_number: settings.sms_sender_id },
    phone, message
  )
}

// ── Core Email sender (used everywhere) ──────────────────────────────────────
async function sendEmail(settings, { to, subject, html, logoPath } = {}) {
  if (!settings?.email_smtp_host || !settings?.email_smtp_user || !settings?.email_smtp_pass) {
    return { ok: false, error: 'SMTP not configured. Go to Settings → Email.' }
  }
  if (!to?.trim()) return { ok: false, error: 'No email address' }

  const nodemailer = require('nodemailer')
  const fs         = require('fs')
  const transporter = nodemailer.createTransport({
    host:   settings.email_smtp_host,
    port:   parseInt(settings.email_smtp_port) || 587,
    secure: parseInt(settings.email_smtp_port) === 465,
    auth:   { user: settings.email_smtp_user, pass: settings.email_smtp_pass },
    tls:    { rejectUnauthorized: false },
  })

  const mailOptions = {
    from:    `"${settings.school_name || 'SchoolFees Manager'}" <${settings.email_smtp_user}>`,
    to, subject,
    html:    html || '<p>(no content)</p>',
  }

  // Embed school logo inline if available
  if (logoPath && fs.existsSync(logoPath)) {
    mailOptions.attachments = [{ filename: 'school_logo.png', path: logoPath, cid: 'school_logo' }]
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    return { ok: true, messageId: info.messageId }
  } catch(e) {
    return { ok: false, error: e.message }
  }
}

// ── Log helpers — always sent or failed, never pending ───────────────────────
function logSms(db, { phone, student_id, message, result }) {
  db.prepare(`INSERT INTO sms_log (phone, student_id, message, status, provider_ref, error_reason, sent_at)
    VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run([phone, student_id||null, message,
      result.ok ? 'sent' : 'failed',
      result.ok ? (result.ref||'') : '',
      result.ok ? '' : (result.error||'Unknown error')])
}

function logEmail(db, { email, student_id, subject, body, result }) {
  db.prepare(`INSERT INTO email_log (email, student_id, subject, body, status, error_reason, sent_at)
    VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run([email, student_id||null, subject, body||'',
      result.ok ? 'sent' : 'failed',
      result.ok ? '' : (result.error||'Unknown error')])
}

// ── Amount in words (Naira) — standard on Nigerian receipts ──────────────────
function amountInWords(n) {
  n = Math.abs(Math.round(Number(n) || 0))
  if (n === 0) return 'Zero Naira Only'
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve',
    'Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  const below1000 = x => {
    let s = ''
    if (x >= 100) { s += ones[Math.floor(x/100)] + ' Hundred'; x %= 100; if (x) s += ' and ' }
    if (x >= 20)  { s += tens[Math.floor(x/10)]; x %= 10; if (x) s += '-' + ones[x] }
    else if (x)   { s += ones[x] }
    return s
  }
  const scales = [[1e9,'Billion'],[1e6,'Million'],[1e3,'Thousand'],[1,'']]
  let words = []
  for (const [val, name] of scales) {
    if (n >= val) {
      const chunk = Math.floor(n / val); n %= val
      words.push(below1000(chunk) + (name ? ' ' + name : ''))
    }
  }
  return words.join(', ') + ' Naira Only'
}

// ── Build receipt HTML — standard itemized receipt (email + shares styling
//    philosophy with the in-app print receipt). Shows Total Billed, Total Paid,
//    This Payment, and Outstanding Balance, plus amount in words. ──────────────
function buildReceiptHtml({ settings, student, payment, termRow, classRow, balance, receipt_number,
  amount_paid, payment_date, payment_method, reference, totalBilled = null, totalPaid = null }) {
  const currency = settings.currency_symbol || '₦'
  const fmt = n => currency + Number(n||0).toLocaleString('en-NG', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const schoolName = settings.school_name || 'SchoolFees Manager'
  const isReversal = Number(amount_paid) < 0
  const paid = Math.abs(Number(amount_paid))

  const logoHtml = settings.logo_path
    ? `<img src="cid:school_logo" style="max-height:60px;max-width:150px;display:block;margin:0 auto 8px;object-fit:contain;" alt="${schoolName}"/>`
    : ''

  const addressLine = [settings.address, settings.phone, settings.email].filter(Boolean).join(' &bull; ')

  const infoRows = [
    ['Received From', student.parent_name || `Parent/Guardian of ${student.first_name || ''}`],
    ['Student',       `${student.last_name || ''} ${student.first_name || ''}`.trim()],
    ['Reg. Number',   student.reg_number || '—'],
    ['Class',         classRow?.name || '—'],
    ['Term / Session',termRow ? `${termRow.name}, ${termRow.session_name}` : '—'],
    ['Payment Date',  payment_date],
    ['Payment Method',String(payment_method||'').toUpperCase()],
    reference ? ['Reference', reference] : null,
  ].filter(Boolean)

  // Account summary — only rows we have data for
  const summaryRows = []
  if (totalBilled !== null) summaryRows.push(['Total Fees Billed (this term)', fmt(totalBilled), false])
  if (totalPaid   !== null) summaryRows.push(['Total Paid to Date', fmt(totalPaid), false])
  summaryRows.push([isReversal ? 'Amount Reversed' : 'Amount Paid (this receipt)', fmt(paid), true])
  if (!isReversal) summaryRows.push(['Outstanding Balance', balance > 0 ? fmt(balance) : fmt(0) + ' — FULLY PAID', true])

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Georgia,'Times New Roman',serif;background:#f1f5f9;padding:24px;color:#1e293b}
  .card{background:#fff;max-width:560px;margin:0 auto;border:1px solid #cbd5e1;
        box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .inner{border:2px solid #1e293b;margin:8px;padding:0}
  .header{text-align:center;padding:20px 24px 14px;border-bottom:2px solid #1e293b}
  .school{font-size:16pt;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}
  .addr{font-size:8.5pt;color:#64748b;margin-top:3px;font-family:Arial,sans-serif}
  .doc-title{display:flex;justify-content:space-between;align-items:center;
             padding:10px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;
             font-family:Arial,sans-serif}
  .doc-title .t{font-size:11pt;font-weight:bold;letter-spacing:.08em;color:${isReversal ? '#b91c1c' : '#1e293b'}}
  .doc-title .no{font-size:9.5pt;font-family:'Courier New',monospace;font-weight:bold}
  table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif}
  .info td{padding:6px 20px;font-size:9.5pt;border-bottom:1px dotted #e2e8f0}
  .info td.l{color:#64748b;width:38%}
  .info td.v{font-weight:600;text-align:right}
  .sum-head{padding:8px 20px 4px;font-size:8.5pt;font-weight:bold;color:#64748b;
            text-transform:uppercase;letter-spacing:.06em;font-family:Arial,sans-serif}
  .sum td{padding:7px 20px;font-size:10pt;border-bottom:1px solid #e2e8f0}
  .sum td.v{text-align:right;font-weight:600}
  .sum tr.hl td{background:${isReversal ? '#fef2f2' : '#eff6ff'};font-weight:bold;font-size:11pt;
               border-top:2px solid #1e293b;border-bottom:2px solid #1e293b}
  .words{padding:10px 20px;font-size:9pt;font-style:italic;color:#334155;
         border-bottom:1px solid #e2e8f0}
  .words b{font-style:normal}
  .sign{display:flex;justify-content:space-between;padding:26px 20px 8px;font-family:Arial,sans-serif}
  .sign div{width:42%;border-top:1px solid #94a3b8;text-align:center;font-size:8.5pt;color:#64748b;padding-top:4px}
  .footer{text-align:center;padding:10px 20px 14px;font-size:8.5pt;color:#94a3b8;font-family:Arial,sans-serif}
</style></head><body>
<div class="card"><div class="inner">
  <div class="header">
    ${logoHtml}
    <div class="school">${schoolName}</div>
    ${addressLine ? `<div class="addr">${addressLine}</div>` : ''}
  </div>
  <div class="doc-title">
    <span class="t">${isReversal ? 'PAYMENT REVERSAL NOTICE' : 'OFFICIAL PAYMENT RECEIPT'}</span>
    <span class="no">No. ${receipt_number}</span>
  </div>
  <table class="info"><tbody>
    ${infoRows.map(([l,v]) => `<tr><td class="l">${l}</td><td class="v">${v}</td></tr>`).join('')}
  </tbody></table>
  <div class="sum-head">Account Summary</div>
  <table class="sum"><tbody>
    ${summaryRows.map(([l,v,hl]) => `<tr${hl ? ' class="hl"' : ''}><td>${l}</td><td class="v">${v}</td></tr>`).join('')}
  </tbody></table>
  <div class="words"><b>Amount in words:</b> ${amountInWords(paid)}</div>
  <div class="sign">
    <div>Bursar / Cashier</div>
    <div>Authorised Signature</div>
  </div>
  <div class="footer">
    ${settings.receipt_footer || 'Thank you for your payment.'}<br/>
    This is a computer-generated receipt issued by ${schoolName}.
  </div>
</div></div>
</body></html>`
}
// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function registerCommunicationHandlers() {

  // ── SMS ────────────────────────────────────────────────────────────────────

  ipcMain.handle('sms:list-providers', () =>
    Object.entries(SMS_PROVIDERS).map(([key, p]) => ({ key, name: p.name, website: p.website, fields: p.fields }))
  )

  ipcMain.handle('sms:send', async (_, { phone, message, student_id }) => {
    const db       = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const result   = await sendSms(settings, phone, message)
    logSms(db, { phone, student_id, message, result })
    return result
  })

  ipcMain.handle('sms:bulk-send', async (_, { recipients, message }) => {
    const db       = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const counts   = { sent: 0, failed: 0, errors: [] }
    for (const r of recipients) {
      const result = await sendSms(settings, r.phone, message)
      logSms(db, { phone: r.phone, student_id: r.student_id, message, result })
      if (result.ok) counts.sent++
      else { counts.failed++; counts.errors.push(`${r.name}: ${result.error}`) }
    }
    return { ok: true, ...counts }
  })

  ipcMain.handle('sms:test', async (_, { phone }) => {
    const settings = getDb().prepare('SELECT * FROM school_settings WHERE id=1').get()
    return sendSms(settings, phone, 'SchoolFees Manager: this is a test message.')
  })

  ipcMain.handle('sms:log-full', (_, { limit=300, status } = {}) => {
    const db  = getDb()
    const sql = `SELECT l.*, s.first_name, s.last_name, s.reg_number
      FROM sms_log l LEFT JOIN students s ON s.id=l.student_id
      ${status && status !== 'all' ? 'WHERE l.status=?' : ''}
      ORDER BY l.id DESC LIMIT ?`
    return db.prepare(sql).all(status && status !== 'all' ? [status, limit] : [limit])
  })

  ipcMain.handle('sms:resend', async (_, { log_id }) => {
    const db       = getDb()
    const log      = db.prepare('SELECT * FROM sms_log WHERE id=?').get([log_id])
    if (!log) return { ok: false, error: 'Log entry not found' }
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const result   = await sendSms(settings, log.phone, log.message)
    db.prepare("UPDATE sms_log SET status=?, provider_ref=?, error_reason=?, sent_at=datetime('now') WHERE id=?")
      .run([result.ok?'sent':'failed', result.ok?(result.ref||''):'', result.ok?'':(result.error||''), log_id])
    return result
  })

  ipcMain.handle('sms:update-phone-resend', async (_, { log_id, new_phone }) => {
    const db  = getDb()
    const log = db.prepare('SELECT * FROM sms_log WHERE id=?').get([log_id])
    if (!log) return { ok: false, error: 'Log not found' }
    if (log.student_id) db.prepare('UPDATE students SET parent_phone=? WHERE id=?').run([new_phone, log.student_id])
    db.prepare('UPDATE sms_log SET phone=? WHERE id=?').run([new_phone, log_id])
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const result   = await sendSms(settings, new_phone, log.message)
    db.prepare("UPDATE sms_log SET status=?, error_reason=?, sent_at=datetime('now') WHERE id=?")
      .run([result.ok?'sent':'failed', result.ok?'':(result.error||''), log_id])
    return result
  })

  // ── Email ──────────────────────────────────────────────────────────────────

  ipcMain.handle('email:send', async (_, { to, subject, html, text, student_id }) => {
    const db       = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (!settings.email_enabled) return { ok: false, error: 'Email not enabled in Settings.' }
    const body   = html || `<pre>${text||''}</pre>`
    const result = await sendEmail(settings, { to, subject, html: body })
    logEmail(db, { email: to, student_id, subject, body, result })
    return result
  })

  // Resend from log — uses stored HTML exactly as-is
  ipcMain.handle('email:resend', async (_, { log_id }) => {
    const db       = getDb()
    const log      = db.prepare('SELECT * FROM email_log WHERE id=?').get([log_id])
    if (!log) return { ok: false, error: 'Log entry not found' }
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const result   = await sendEmail(settings, { to: log.email, subject: log.subject, html: log.body,
      logoPath: settings.logo_path || null })
    db.prepare("UPDATE email_log SET status=?, error_reason=?, sent_at=datetime('now') WHERE id=?")
      .run([result.ok?'sent':'failed', result.ok?'':(result.error||''), log_id])
    return result
  })

  ipcMain.handle('email:update-address-resend', async (_, { log_id, new_email }) => {
    const db  = getDb()
    const log = db.prepare('SELECT * FROM email_log WHERE id=?').get([log_id])
    if (!log) return { ok: false, error: 'Log not found' }
    if (log.student_id) db.prepare('UPDATE students SET parent_email=? WHERE id=?').run([new_email, log.student_id])
    db.prepare('UPDATE email_log SET email=? WHERE id=?').run([new_email, log_id])
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const result   = await sendEmail(settings, { to: new_email, subject: log.subject, html: log.body,
      logoPath: settings.logo_path || null })
    db.prepare("UPDATE email_log SET status=?, error_reason=?, sent_at=datetime('now') WHERE id=?")
      .run([result.ok?'sent':'failed', result.ok?'':(result.error||''), log_id])
    return result
  })

  ipcMain.handle('email:log-full', (_, { limit=300, status } = {}) => {
    const db  = getDb()
    const sql = `SELECT l.*, s.first_name, s.last_name, s.reg_number
      FROM email_log l LEFT JOIN students s ON s.id=l.student_id
      ${status && status !== 'all' ? 'WHERE l.status=?' : ''}
      ORDER BY l.id DESC LIMIT ?`
    return db.prepare(sql).all(status && status !== 'all' ? [status, limit] : [limit])
  })

  ipcMain.handle('email:test', async (_, { to }) => {
    const settings = getDb().prepare('SELECT * FROM school_settings WHERE id=1').get()
    return sendEmail(settings, {
      to, subject: 'SchoolFees Manager — Test Email',
      html: `<p style="font-family:Arial,sans-serif;padding:20px">
        This is a test email from <strong>${settings.school_name || 'SchoolFees Manager'}</strong>.<br/>
        Your email settings are configured correctly.</p>`
    })
  })

  // Backward-compat aliases — same logic inline
  ipcMain.handle('sms:log', (_, { limit=100 } = {}) => {
    return getDb().prepare(`SELECT l.*, s.first_name, s.last_name
      FROM sms_log l LEFT JOIN students s ON s.id=l.student_id
      ORDER BY l.id DESC LIMIT ?`).all([limit])
  })
  ipcMain.handle('email:log', (_, { limit=100 } = {}) => {
    return getDb().prepare(`SELECT l.*, s.first_name, s.last_name
      FROM email_log l LEFT JOIN students s ON s.id=l.student_id
      ORDER BY l.id DESC LIMIT ?`).all([limit])
  })
  ipcMain.handle('email:send-receipt', async (_, { payment_id }) => {
    // Legacy: resend by payment_id — look up payment and build receipt
    const db       = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const payment  = db.prepare(`SELECT p.*, s.*, t.name as term_name, ses.name as session_name,
      c.name as class_name, s.parent_email
      FROM payments p JOIN students s ON s.id=p.student_id
      JOIN terms t ON t.id=p.term_id JOIN sessions ses ON ses.id=t.session_id
      LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
      LEFT JOIN classes c ON c.id=ss.class_id WHERE p.id=?`).get([payment_id])
    if (!payment) return { ok: false, error: 'Payment not found' }
    if (!payment.parent_email) return { ok: false, error: 'No email on file for this student' }
    const totalBilled = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM student_bills WHERE student_id=? AND term_id=? AND status NOT IN ('waived','frozen')").get([payment.student_id, payment.term_id])?.t||0
    const totalPaid   = db.prepare('SELECT COALESCE(SUM(amount_paid),0) as t FROM payments WHERE student_id=? AND term_id=? AND is_reversed=0 AND amount_paid>0').get([payment.student_id, payment.term_id])?.t||0
    const balance     = Math.max(0, Number(totalBilled) - Number(totalPaid))
    const html        = buildReceiptHtml({ settings, student: payment,
      termRow: { name: payment.term_name, session_name: payment.session_name },
      classRow: { name: payment.class_name }, balance,
      totalBilled: Number(totalBilled), totalPaid: Number(totalPaid),
      receipt_number: payment.receipt_number, amount_paid: payment.amount_paid,
      payment_date: payment.payment_date, payment_method: payment.payment_method,
      reference: payment.reference })
    const result = await sendEmail(settings, { to: payment.parent_email,
      subject: `Payment Receipt ${payment.receipt_number} — ${settings.school_name||'SchoolFees Manager'}`,
      html, logoPath: settings.logo_path||null })
    logEmail(db, { email: payment.parent_email, student_id: payment.student_id,
      subject: `Receipt ${payment.receipt_number}`, body: html, result })
    return result
  })
}

// ── Exported helpers for payments.js ─────────────────────────────────────────
module.exports.sendSms           = sendSms
module.exports.sendEmail         = sendEmail
module.exports.buildReceiptHtml  = buildReceiptHtml
module.exports.logSms            = logSms
module.exports.logEmail          = logEmail
