/**
 * Shared send helpers used by payments.js, reversal handler, etc.
 * Keeps sending logic in one place so it's consistent everywhere.
 */

const SMS_PROVIDERS = require('./communications').SMS_PROVIDERS_MAP || null

async function sendSmsMessage(settings, phone, message) {
  if (!settings?.sms_enabled) return { ok: false, error: 'SMS not enabled in settings' }
  if (!settings?.sms_provider) return { ok: false, error: 'No SMS provider configured' }
  if (!phone?.trim()) return { ok: false, error: 'No phone number' }

  // Normalize Nigerian number
  const digits = phone.replace(/\D/g, '')
  let normalized = phone
  if (digits.startsWith('234'))           normalized = '+' + digits
  else if (digits.startsWith('0') && digits.length === 11) normalized = '+234' + digits.slice(1)
  else if (digits.length === 10)          normalized = '+234' + digits

  const providerKey = settings.sms_provider
  const providers = {
    termii: async () => {
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: normalized, from: settings.sms_sender_id || 'SchoolFees', sms: message, type: 'plain', api_key: settings.sms_api_key, channel: 'generic' }),
      })
      const d = await res.json()
      if (d.code === 'ok' || d.message_id) return { ok: true, ref: d.message_id || 'sent' }
      return { ok: false, error: d.message || JSON.stringify(d) }
    },
    bulksms: async () => {
      const params = new URLSearchParams({ api_token: settings.sms_api_key, from: 'SchoolFees', to: normalized, body: message, dnd: 2 })
      const res = await fetch(`https://www.bulksmsnigeria.com/api/v2/sms/create?${params}`)
      const d = await res.json()
      if (d.data) return { ok: true, ref: String(d.data?.id || 'sent') }
      return { ok: false, error: d.message || JSON.stringify(d) }
    },
  }

  const send = providers[providerKey]
  if (!send) return { ok: false, error: `Unknown SMS provider: ${providerKey}` }

  try {
    return await send()
  } catch(e) {
    return { ok: false, error: e.message }
  }
}

async function sendEmailReceipt(settings, { to, subject, html, logoPath }) {
  if (!settings?.email_smtp_host || !settings?.email_smtp_user || !settings?.email_smtp_pass) {
    return { ok: false, error: 'SMTP not configured. Go to Settings → Email.' }
  }
  if (!to?.trim()) return { ok: false, error: 'No email address' }

  const nodemailer = require('nodemailer')
  const fs = require('fs')
  const transporter = nodemailer.createTransport({
    host: settings.email_smtp_host,
    port: parseInt(settings.email_smtp_port) || 587,
    secure: parseInt(settings.email_smtp_port) === 465,
    auth: { user: settings.email_smtp_user, pass: settings.email_smtp_pass },
    tls: { rejectUnauthorized: false },
  })

  const mailOptions = {
    from: `"${settings.school_name || 'SchoolFees'}" <${settings.email_smtp_user}>`,
    to, subject, html,
  }

  // Embed school logo as inline attachment if available
  if (logoPath && fs.existsSync(logoPath)) {
    mailOptions.attachments = [{
      filename: 'school_logo.png',
      path: logoPath,
      cid: 'school_logo',
    }]
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    return { ok: true, messageId: info.messageId }
  } catch(e) {
    return { ok: false, error: e.message }
  }
}

module.exports = { sendSmsMessage, sendEmailReceipt }
