/**
 * Backward-compatibility shim — all logic now lives in communications.js.
 * Any file that still requires('./communications_helper') will get the
 * unified functions from the single source of truth.
 */
const comms = require('./communications')
module.exports = {
  sendSmsMessage:   comms.sendSms,
  sendEmailReceipt: (settings, { to, subject, html, logoPath } = {}) =>
    comms.sendEmail(settings, { to, subject, html, logoPath }),
}
