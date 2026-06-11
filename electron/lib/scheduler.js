/**
 * Auto-backup scheduler — nightly at 11 PM
 * Runs both local (rotating) and Google Drive (if connected) backups
 */
const cron = require('node-cron')
const fs   = require('fs')
const path = require('path')
const { getDbPath } = require('./database')

let scheduledTask = null

function getAutoBackupDir() {
  const dbPath = getDbPath()
  const dir    = path.join(path.dirname(dbPath), 'auto_backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getSchedulerConfigPath() {
  return path.join(path.dirname(getDbPath()), 'scheduler_config.json')
}

function loadSchedulerConfig() {
  try { return JSON.parse(fs.readFileSync(getSchedulerConfigPath(), 'utf8')) }
  catch { return { enabled: true, time: '23:00', keepLocal: 7 } }
}
function saveSchedulerConfig(cfg) {
  fs.writeFileSync(getSchedulerConfigPath(), JSON.stringify(cfg, null, 2))
}

// ── Local rotating backup ─────────────────────────────────────────────────────
// Uses the SAME encrypted backup code path as the manual "Backup Now" button:
// AES-256-GCM .sfenc → system backup folder → copy to Google Drive sync folder.
// A plain rotating copy is also kept in auto_backups as a last-resort fallback.
function runLocalAutoBackup() {
  const cfg    = loadSchedulerConfig()
  const dbPath = getDbPath()
  const dir    = getAutoBackupDir()
  const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // 1) Encrypted backup + cloud sync copy (primary)
  let encrypted = null
  try {
    const { performEncryptedBackup } = require('../handlers/backup')
    encrypted = performEncryptedBackup({ prefix: 'auto' })
    console.log(`[Scheduler] Encrypted auto-backup saved: ${encrypted.path}` +
      (encrypted.syncCopied ? ' (synced to cloud folder)' : ''))
  } catch (e) {
    console.error('[Scheduler] Encrypted auto-backup failed:', e.message)
  }

  // 2) Plain rotating safety copy (fallback — local only, never synced)
  const dest = path.join(dir, `auto_${stamp}.db`)
  try {
    fs.copyFileSync(dbPath, dest)
    const keep   = cfg.keepLocal || 7
    const files  = fs.readdirSync(dir)
      .filter(f => f.startsWith('auto_') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    files.slice(keep).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f.name)) } catch {}
    })
    console.log(`[Scheduler] Auto-backup saved: ${dest}`)
    return { ok: true, path: encrypted?.path || dest, syncCopied: !!encrypted?.syncCopied }
  } catch (e) {
    console.error('[Scheduler] Auto-backup failed:', e.message)
    if (encrypted?.ok) return { ok: true, path: encrypted.path, syncCopied: encrypted.syncCopied }
    return { ok: false, error: e.message }
  }
}

// ── Google Drive auto-backup ──────────────────────────────────────────────────
async function runGDriveAutoBackup() {
  const { ipcMain } = require('electron')
  // Reuse the gdrive:backup handler logic directly
  try {
    const gdriveModule = require('../handlers/gdrive_internal')
    const result = await gdriveModule.backupNow()
    if (result.ok) {
      console.log(`[Scheduler] GDrive backup uploaded: ${result.filename}`)
    } else {
      console.log(`[Scheduler] GDrive backup skipped: ${result.error}`)
    }
    return result
  } catch (e) {
    console.error('[Scheduler] GDrive backup error:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Schedule management ───────────────────────────────────────────────────────
function parseTime(timeStr) {
  // "23:00" → { hour: 23, minute: 0 }
  const [h, m] = (timeStr || '23:00').split(':').map(Number)
  return { hour: isNaN(h) ? 23 : h, minute: isNaN(m) ? 0 : m }
}

function startScheduler() {
  const cfg = loadSchedulerConfig()
  if (!cfg.enabled) return

  if (scheduledTask) {
    scheduledTask.destroy()
    scheduledTask = null
  }

  const { hour, minute } = parseTime(cfg.time)
  const expression = `${minute} ${hour} * * *`

  scheduledTask = cron.schedule(expression, async () => {
    console.log('[Scheduler] Running nightly backup...')
    const result = runLocalAutoBackup()   // encrypted .sfenc + cloud sync copy + rotating plain copy

    // Notify the user that the auto-backup finished
    try {
      const { BrowserWindow, Notification } = require('electron')
      const win = BrowserWindow.getAllWindows()[0]
      const when = new Date().toLocaleString('en-NG')
      if (result?.ok) {
        // In-app toast via the renderer
        if (win) win.webContents.send('backup:auto-done', {
          ok: true, at: when, syncCopied: !!result.syncCopied, path: result.path,
        })
        // Native OS notification (shows even if the window is minimised)
        if (Notification && Notification.isSupported()) {
          new Notification({
            title: 'SchoolFees Manager — Backup Complete',
            body: `Automatic backup saved${result.syncCopied ? ' and synced to your cloud folder' : ''} at ${when}.`,
            silent: true,
          }).show()
        }
      } else if (win) {
        win.webContents.send('backup:auto-done', { ok: false, at: when, error: result?.error })
      }
    } catch (e) { console.log('[Scheduler] Notify skip:', e.message) }
  })

  console.log(`[Scheduler] Auto-backup scheduled at ${cfg.time} daily`)
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.destroy()
    scheduledTask = null
    console.log('[Scheduler] Auto-backup stopped')
  }
}

module.exports = { startScheduler, stopScheduler, runLocalAutoBackup, loadSchedulerConfig, saveSchedulerConfig }
