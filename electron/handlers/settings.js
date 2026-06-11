const { ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')
const { getDb } = require('../lib/database')
const defaults  = require('../lib/defaults')

module.exports = function registerSettingsHandlers(dbDir) {

  ipcMain.handle('settings:get', () => {
    const s = getDb().prepare('SELECT * FROM school_settings WHERE id=1').get()
    if (s?.logo_path) s.logo_path = s.logo_path.replace(/\\/g, '/')
    return s
  })

  ipcMain.handle('settings:save', (_, data) => {
    const db = getDb()
    const fields = [
      'school_name','address','phone','email','account_number','bank_name','account_name',
      'logo_path','currency_symbol','currency_code','currency_name','date_format',
      'receipt_footer','sms_enabled','sms_provider','sms_api_key','sms_sender_id',
      'email_enabled','email_smtp_host','email_smtp_port','email_smtp_user',
      'email_smtp_pass','email_from','auto_backup','backup_time',
      'thermal_width','print_copies',
      'reg_number_format','reg_number_prefix','reg_seq_reset',
      'auto_send_receipt',
      'auto_send_email_receipt',
    ]
    const sets  = fields.map(f => `${f}=?`).join(',')
    const vals  = fields.map(f => data[f] !== undefined ? data[f] : null)
    db.prepare(`UPDATE school_settings SET ${sets}, updated_at=datetime('now') WHERE id=1`).run(vals)
    return { ok: true }
  })

  // Developer-only: toggle accounting module
  ipcMain.handle('settings:set-accounting', (_, enabled) => {
    getDb().prepare('UPDATE school_settings SET accounting_enabled=? WHERE id=1').run([enabled ? 1 : 0])
    getDb().prepare("UPDATE app_state SET value=? WHERE key='accounting_enabled'").run([enabled ? '1' : '0'])
    return { ok: true }
  })

  ipcMain.handle('settings:pick-logo', async (_, schoolName) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp'] }],
      properties: ['openFile']
    })
    if (result.canceled) return null
    const src  = result.filePaths[0]
    const ext  = path.extname(src)
    // Unique filename each upload so the renderer never serves a stale cached image
    const dest = path.join(dbDir, `logo_${Date.now()}${ext}`)
    fs.copyFileSync(src, dest)
    // Clean up older logo files to avoid clutter
    try {
      for (const f of fs.readdirSync(dbDir)) {
        if (/^logo[_.]/.test(f) && path.join(dbDir, f) !== dest) {
          try { fs.unlinkSync(path.join(dbDir, f)) } catch {}
        }
      }
    } catch {}
    // Always return forward slashes — backslashes break localfile:// URLs on Windows
    return dest.replace(/\\/g, '/')
  })

  ipcMain.handle('settings:currencies', () => defaults.currencies)

  ipcMain.handle('settings:get-currency', () => {
    const s = getDb().prepare('SELECT currency_symbol, currency_code, currency_name FROM school_settings WHERE id=1').get()
    // Normalize to consistent field names used in frontend
    const symbol = s?.currency_symbol || '₦'
    const code   = s?.currency_code   || 'NGN'
    const name   = s?.currency_name   || 'Nigerian Naira'
    return { symbol, code, name, currency_symbol: symbol, currency_code: code, currency_name: name }
  })
}
