const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

// ── Phone number normalizer (Nigerian numbers → +234xxxxxxxxxx) ───────────────
function normalizePhone(phone) {
  if (!phone) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('234')) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11) return '+234' + digits.slice(1)
  if (digits.length === 10) return '+234' + digits
  return '+' + digits // already has country code
}


// Add new providers here as you integrate them.
// Each provider must implement: sendSms(apiKey, senderId, phone, message) -> { ok, ref }
const SMS_PROVIDERS = {

  termii: {
    name: 'Termii',
    website: 'https://termii.com',
    fields: ['api_key', 'sender_id'],
    async send(config, phone, message) {
      try {
        // Normalize Nigerian number to international format
        const normalized = normalizePhone(phone)
        const res = await fetch('https://api.ng.termii.com/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: normalized,
            from: config.sender_id || 'SchoolFees',
            sms: message,
            type: 'plain',
            api_key: config.api_key,
            channel: 'generic',
          }),
        })
        const data = await res.json()
        if (data.code === 'ok' || data.message_id) {
          return { ok: true, ref: data.message_id || 'sent' }
        }
        return { ok: false, error: data.message || 'Termii error' }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    }
  },

  bulksms: {
    name: 'BulkSMS Nigeria',
    website: 'https://www.bulksmsnigeria.com',
    fields: ['api_token'],
    async send(config, phone, message) {
      try {
        const normalized = normalizePhone(phone)
        const params = new URLSearchParams({
          api_token: config.api_token,
          from: 'SchoolFees',
          to: normalized,
          body: message,
          dnd: 2,
        })
        const res  = await fetch(`https://www.bulksmsnigeria.com/api/v2/sms/create?${params}`)
        const data = await res.json()
        if (data.data) return { ok: true, ref: String(data.data?.id || 'sent') }
        return { ok: false, error: data.message || 'BulkSMS error' }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    }
  },

  twilio: {
    name: 'Twilio',
    website: 'https://twilio.com',
    fields: ['account_sid', 'auth_token', 'from_number'],
    async send(config, phone, message) {
      try {
        const normalized = normalizePhone(phone)
        const auth = Buffer.from(`${config.account_sid}:${config.auth_token}`).toString('base64')
        const res  = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: config.from_number, To: normalized, Body: message }),
        })
        const data = await res.json()
        if (data.sid) return { ok: true, ref: data.sid }
        return { ok: false, error: data.message || 'Twilio error' }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    }
  },
}

// ─── Email Provider Interface ─────────────────────────────────────────────────
async function sendEmail(settings, { to, subject, html, text }) {
  const nodemailer = require('nodemailer')

  if (!settings.email_smtp_host || !settings.email_smtp_user || !settings.email_smtp_pass) {
    return { ok: false, error: 'SMTP not configured. Go to Settings → Email.' }
  }

  const transporter = nodemailer.createTransport({
    host: settings.email_smtp_host,
    port: parseInt(settings.email_smtp_port) || 587,
    secure: parseInt(settings.email_smtp_port) === 465,
    auth: { user: settings.email_smtp_user, pass: settings.email_smtp_pass },
    tls: { rejectUnauthorized: false },
  })

  try {
    const fromName = settings.school_name || 'SchoolFees Manager'
    const info = await transporter.sendMail({
      from: `"${fromName}" <${settings.email_smtp_user}>`,
      to, subject,
      html: html || `<pre>${text || ''}</pre>`,
      text: text || '',
    })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = function registerCommunicationHandlers() {

  // ── SMS ────────────────────────────────────────────────────────────────────

  ipcMain.handle('sms:list-providers', () => {
    return Object.entries(SMS_PROVIDERS).map(([key, p]) => ({
      key, name: p.name, website: p.website, fields: p.fields
    }))
  })

  ipcMain.handle('sms:send', async (_, { phone, message, student_id }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()

    if (!settings.sms_enabled) return { ok: false, error: 'SMS is not enabled in Settings' }

    const provider = SMS_PROVIDERS[settings.sms_provider]
    if (!provider) return { ok: false, error: `Unknown SMS provider: ${settings.sms_provider}` }

    const result = await provider.send(
      { api_key: settings.sms_api_key, sender_id: settings.sms_sender_id },
      phone, message
    )

    // Log the attempt
    db.prepare(`INSERT INTO sms_log (phone, student_id, message, status, provider_ref, sent_at)
      VALUES (?,?,?,?,?,datetime('now'))`)
      .run([phone, student_id || null, message, result.ok ? 'sent' : 'failed', result.ref || ''])

    return result
  })

  ipcMain.handle('sms:bulk-send', async (_, { recipients, message }) => {
    // recipients: [{ phone, student_id, name }]
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (!settings.sms_enabled) return { ok: false, error: 'SMS not enabled' }

    const results = { sent: 0, failed: 0, errors: [] }
    const provider = SMS_PROVIDERS[settings.sms_provider]
    if (!provider) return { ok: false, error: `Unknown provider: ${settings.sms_provider}` }

    for (const r of recipients) {
      const res = await provider.send(
        { api_key: settings.sms_api_key, sender_id: settings.sms_sender_id },
        r.phone, message
      )
      db.prepare(`INSERT INTO sms_log (phone, student_id, message, status, sent_at)
        VALUES (?,?,?,?,datetime('now'))`)
        .run([r.phone, r.student_id || null, message, res.ok ? 'sent' : 'failed'])
      if (res.ok) results.sent++
      else { results.failed++; results.errors.push(`${r.name}: ${res.error}`) }
    }
    return { ok: true, ...results }
  })

  ipcMain.handle('sms:log', (_, { limit = 100 } = {}) => {
    return getDb().prepare(`SELECT l.*, s.first_name, s.last_name
      FROM sms_log l LEFT JOIN students s ON s.id=l.student_id
      ORDER BY l.id DESC LIMIT ?`).all([limit])
  })

  ipcMain.handle('sms:test', async (_, { phone, provider_key }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    const provider = SMS_PROVIDERS[provider_key || settings.sms_provider]
    if (!provider) return { ok: false, error: 'Provider not found' }
    return provider.send(
      { api_key: settings.sms_api_key, sender_id: settings.sms_sender_id },
      phone, 'SchoolFees Manager test message'
    )
  })

  // ── Email ──────────────────────────────────────────────────────────────────

  ipcMain.handle('email:send', async (_, { to, subject, html, text, student_id }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (!settings.email_enabled) return { ok: false, error: 'Email is not enabled in Settings' }

    const result = await sendEmail(settings, { to, subject, html, text })

    db.prepare(`INSERT INTO email_log (email, student_id, subject, body, status, sent_at)
      VALUES (?,?,?,?,?,datetime('now'))`)
      .run([to, student_id || null, subject, html || text || '', result.ok ? 'sent' : 'failed'])

    return result
  })

  ipcMain.handle('email:send-receipt', async (_, { payment_id }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (!settings.email_enabled) return { ok: false, error: 'Email not enabled in Settings.' }

    // Get payment + student details
    const payment = db.prepare(`SELECT p.*, s.first_name, s.last_name, s.reg_number,
      s.parent_email, s.parent_name, c.name as class_name,
      t.name as term_name, ses.name as session_name
      FROM payments p
      JOIN students s ON s.id=p.student_id
      JOIN terms t ON t.id=p.term_id
      JOIN sessions ses ON ses.id=t.session_id
      LEFT JOIN student_status ss ON ss.student_id=p.student_id AND ss.term_id=p.term_id
      LEFT JOIN classes c ON c.id=ss.class_id
      WHERE p.id=?`).get([payment_id])

    if (!payment) return { ok: false, error: 'Payment not found.' }
    if (!payment.parent_email) return { ok: false, error: `No email address on file for ${payment.first_name} ${payment.last_name}.` }

    const school     = settings.school_name || 'SchoolFees Manager'
    const currency   = settings.currency_symbol || '₦'
    const amount     = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2 }).format(payment.amount_paid)
    const studentName = `${payment.first_name} ${payment.last_name}`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin:0; padding: 20px; }
  .card { background: #fff; border-radius: 8px; max-width: 520px; margin: 0 auto; padding: 32px; }
  .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
  .school-name { font-size: 20px; font-weight: bold; color: #1e3a8a; }
  .receipt-title { font-size: 14px; color: #6b7280; margin-top: 4px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .label { color: #6b7280; }
  .value { font-weight: 600; color: #111827; }
  .amount-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center; padding: 16px; margin: 20px 0; }
  .amount { font-size: 28px; font-weight: bold; color: #1d4ed8; }
  .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px; }
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="school-name">${school}</div>
    <div class="receipt-title">Payment Receipt — ${payment.receipt_number}</div>
  </div>
  <div class="row"><span class="label">Student</span><span class="value">${studentName}</span></div>
  <div class="row"><span class="label">Reg. Number</span><span class="value">${payment.reg_number}</span></div>
  <div class="row"><span class="label">Class</span><span class="value">${payment.class_name || '—'}</span></div>
  <div class="row"><span class="label">Term</span><span class="value">${payment.term_name}, ${payment.session_name}</span></div>
  <div class="row"><span class="label">Payment Date</span><span class="value">${payment.payment_date}</span></div>
  <div class="row"><span class="label">Payment Method</span><span class="value">${payment.payment_method}</span></div>
  ${payment.reference ? `<div class="row"><span class="label">Reference</span><span class="value">${payment.reference}</span></div>` : ''}
  <div class="amount-box">
    <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Amount Paid</div>
    <div class="amount">${currency}${amount}</div>
  </div>
  <div class="footer">
    Thank you for your payment.<br>
    This receipt was generated by ${school}'s SchoolFees Manager.
  </div>
</div>
</body></html>`

    const result = await sendEmail(settings, {
      to:      payment.parent_email,
      subject: `Payment Receipt — ${payment.receipt_number} | ${school}`,
      html,
    })

    db.prepare(`INSERT INTO email_log (email, student_id, subject, body, status, sent_at)
      VALUES (?,?,?,?,?,datetime('now'))`)
      .run([payment.parent_email, payment.student_id, `Receipt ${payment.receipt_number}`, html, result.ok ? 'sent' : 'failed'])

    return result
  })

  ipcMain.handle('email:test', async (_, { to }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    return sendEmail(settings, {
      to, subject: 'SchoolFees Manager Test Email',
      html: '<p>This is a test email from SchoolFees Manager.</p>'
    })
  })

  ipcMain.handle('email:log', (_, { limit = 100 } = {}) => {
    return getDb().prepare(`SELECT l.*, s.first_name, s.last_name
      FROM email_log l LEFT JOIN students s ON s.id=l.student_id
      ORDER BY l.id DESC LIMIT ?`).all([limit])
  })
}
