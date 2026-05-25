const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

// ─── SMS Provider Interface ───────────────────────────────────────────────────
// Add new providers here as you integrate them.
// Each provider must implement: sendSms(apiKey, senderId, phone, message) -> { ok, ref }
const SMS_PROVIDERS = {

  termii: {
    name: 'Termii',
    website: 'https://termii.com',
    fields: ['api_key', 'sender_id'],
    async send(config, phone, message) {
      // TODO: integrate when API key is available
      // const res = await fetch('https://api.ng.termii.com/api/sms/send', { ... })
      return { ok: false, error: 'Termii integration coming soon' }
    }
  },

  bulksms: {
    name: 'BulkSMS Nigeria',
    website: 'https://www.bulksmsnigeria.com',
    fields: ['api_token'],
    async send(config, phone, message) {
      // TODO: integrate when API key is available
      return { ok: false, error: 'BulkSMS Nigeria integration coming soon' }
    }
  },

  twilio: {
    name: 'Twilio',
    website: 'https://twilio.com',
    fields: ['account_sid', 'auth_token', 'from_number'],
    async send(config, phone, message) {
      // TODO: integrate when credentials available
      return { ok: false, error: 'Twilio integration coming soon' }
    }
  },
}

// ─── Email Provider Interface ─────────────────────────────────────────────────
async function sendEmail(settings, { to, subject, html }) {
  // TODO: integrate nodemailer when SMTP creds available
  // const nodemailer = require('nodemailer')
  // const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } })
  // await transporter.sendMail({ from, to, subject, html })
  return { ok: false, error: 'Email integration coming soon — configure SMTP in Settings' }
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

  ipcMain.handle('email:send', async (_, { to, subject, html, student_id }) => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (!settings.email_enabled) return { ok: false, error: 'Email is not enabled in Settings' }

    const result = await sendEmail(settings, { to, subject, html })

    db.prepare(`INSERT INTO email_log (email, student_id, subject, body, status, sent_at)
      VALUES (?,?,?,?,?,datetime('now'))`)
      .run([to, student_id || null, subject, html, result.ok ? 'sent' : 'failed'])

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
