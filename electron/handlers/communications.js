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

// ── Build receipt email HTML ──────────────────────────────────────────────────
function buildReceiptHtml({ settings, student, payment, termRow, classRow, balance, receipt_number,
  amount_paid, payment_date, payment_method, reference }) {
  const currency = settings.currency_symbol || '₦'
  const fmt = n => currency + Number(n||0).toLocaleString('en-NG', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const schoolName = settings.school_name || 'SchoolFees Manager'
  const logoHtml   = settings.logo_path
    ? `<img src="cid:school_logo" style="max-height:60px;max-width:160px;display:block;margin:0 auto 8px;" alt="${schoolName}"/>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:12px;max-width:520px;margin:0 auto;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{text-align:center;border-bottom:3px solid #1e40af;padding-bottom:16px;margin-bottom:24px}
  .school{font-size:20px;font-weight:bold;color:#1e3a8a;text-transform:uppercase}
  .rtitle{font-size:13px;color:#6b7280;margin-top:4px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
  .label{color:#6b7280}.value{font-weight:600;color:#111827}
  .amt-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center;padding:16px;margin:20px 0}
  .amt{font-size:28px;font-weight:bold;color:#1d4ed8}
  .bal-box{background:${balance>0?'#fef2f2':'#f0fdf4'};border:1px solid ${balance>0?'#fecaca':'#bbf7d0'};border-radius:8px;text-align:center;padding:12px;margin-top:8px}
  .bal{font-size:18px;font-weight:bold;color:${balance>0?'#dc2626':'#16a34a'}}
  .footer{text-align:center;font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px}
</style></head><body>
<div class="card">
  <div class="header">
    ${logoHtml}
    <div class="school">${schoolName}</div>
    <div class="rtitle">Payment Receipt &mdash; ${receipt_number}</div>
  </div>
  <div class="row"><span class="label">Student</span><span class="value">${student.last_name} ${student.first_name}</span></div>
  <div class="row"><span class="label">Reg. Number</span><span class="value">${student.reg_number}</span></div>
  <div class="row"><span class="label">Class</span><span class="value">${classRow?.name||'—'}</span></div>
  <div class="row"><span class="label">Term</span><span class="value">${termRow?.name}, ${termRow?.session_name}</span></div>
  <div class="row"><span class="label">Payment Date</span><span class="value">${payment_date}</span></div>
  <div class="row"><span class="label">Method</span><span class="value">${String(payment_method||'').toUpperCase()}</span></div>
  ${reference ? `<div class="row"><span class="label">Reference</span><span class="value">${reference}</span></div>` : ''}
  <div class="amt-box">
    <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Amount Paid</div>
    <div class="amt">${fmt(amount_paid)}</div>
  </div>
  <div class="bal-box">
    <div style="font-size:12px;color:#6b7280;margin-bottom:4px">${balance>0?'Outstanding Balance':'Account Status'}</div>
    <div class="bal">${balance>0 ? fmt(balance)+' remaining' : '&#10003; Fully Paid'}</div>
  </div>
  <div class="footer">
    Thank you for your payment.<br/>
    ${settings.phone ? 'Tel: '+settings.phone : ''} ${settings.email ? '&bull; '+settings.email : ''}
  </div>
</div></body></html>`
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
