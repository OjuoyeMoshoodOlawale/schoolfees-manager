const { ipcMain, dialog, app } = require('electron')
const fs   = require('fs')
const path = require('path')
const { closeDb, reopenDb, getDb, getDbPath } = require('../lib/database')
const { deriveBackupKey, encryptDb, decryptBackup, validateSqliteBytes } = require('../lib/backupCrypto')

// ─── Sync folder config (NovaPOS Google Drive method) ─────────────────────────
// The user points to their Google Drive Desktop / OneDrive / Dropbox sync
// folder on disk. Encrypted backups are COPIED there and the cloud client
// does the actual syncing. No OAuth, no API keys, nothing to expire.
function getSyncConfigPath() {
  return path.join(path.dirname(getDbPath()), 'sync_folder.json')
}
function loadSyncConfig() {
  try { return JSON.parse(fs.readFileSync(getSyncConfigPath(), 'utf8')) } catch { return null }
}
function saveSyncConfig(cfg) {
  fs.writeFileSync(getSyncConfigPath(), JSON.stringify(cfg, null, 2))
}

// ─── System backup folder ──────────────────────────────────────────────────────
function getBackupDir() {
  const dir = path.join(path.dirname(getDbPath()), 'backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function pruneBackups(dir, prefix, ext, keep) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith(ext))
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    files.slice(keep).forEach(f => { try { fs.unlinkSync(path.join(dir, f.name)) } catch {} })
  } catch {}
}

// ─── Core backup: encrypt → system folder → copy to sync folder ───────────────
// Exported so the nightly scheduler uses the EXACT same code path.
function performEncryptedBackup({ prefix = 'schoolfees-backup' } = {}) {
  const db        = getDb()
  const key       = deriveBackupKey(db)
  const dbPath    = getDbPath()
  const backupDir = getBackupDir()
  const ts        = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename  = `${prefix}-${ts}.sfenc`

  const blob = encryptDb(dbPath, key)

  // 1) System backup folder
  const destPath = path.join(backupDir, filename)
  fs.writeFileSync(destPath, blob)
  pruneBackups(backupDir, prefix, '.sfenc', 30)

  // 2) Copy to cloud sync folder (Google Drive Desktop etc.) if configured
  let syncCopied = false, syncError = null
  const cfg = loadSyncConfig()
  if (cfg?.folder && cfg.enabled) {
    try {
      if (!fs.existsSync(cfg.folder)) throw new Error('Sync folder not found — is your cloud drive mounted?')
      fs.writeFileSync(path.join(cfg.folder, filename), blob)
      pruneBackups(cfg.folder, prefix, '.sfenc', 10)
      saveSyncConfig({ ...cfg, lastSync: new Date().toISOString() })
      syncCopied = true
    } catch (e) { syncError = e.message }
  }

  // Persist metadata
  try {
    const exists = db.prepare("SELECT key FROM app_state WHERE key='last_backup_at'").get()
    if (exists) db.prepare("UPDATE app_state SET value=? WHERE key='last_backup_at'").run([new Date().toISOString()])
    else db.prepare("INSERT INTO app_state (key,value) VALUES ('last_backup_at',?)").run([new Date().toISOString()])
  } catch {}

  return { ok: true, path: destPath, filename, size: blob.length, syncCopied, syncError }
}

module.exports = function registerBackupHandlers() {

  ipcMain.handle('backup:get-db-path', () => getDbPath())

  // ── Backup Now — encrypted, to system folder + sync folder ─────────────────
  ipcMain.handle('backup:now', async () => {
    try { return performEncryptedBackup() }
    catch (e) { return { ok: false, error: e.message } }
  })

  // ── Download encrypted backup (save-as: USB stick, another PC…) ────────────
  ipcMain.handle('backup:local', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Download Encrypted SchoolFees Backup',
      defaultPath: `schoolfees-backup-${new Date().toISOString().slice(0,10)}.sfenc`,
      filters: [{ name: 'SchoolFees Encrypted Backup', extensions: ['sfenc'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    try {
      const db   = getDb()
      const blob = encryptDb(getDbPath(), deriveBackupKey(db))
      fs.writeFileSync(result.filePath, blob)
      return { ok: true, path: result.filePath }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ── Restore — NovaPOS safety flow ───────────────────────────────────────────
  // Nothing is written to disk until EVERY check passes AND the user confirms:
  //   1. Pick file (.sfenc encrypted, or legacy plain .db)
  //   2. Decrypt/read fully INTO MEMORY — zero disk writes
  //   3. Validate SQLite magic bytes — reject garbage before touching anything
  //   4. Native OS confirmation dialog with file details
  //   5. Safety copy of current DB → close DB → write → verify byte count
  //   6. App relaunches automatically — guarantees completely fresh DB handles
  // The live database file is NEVER deleted. On any failure the safety copy
  // is put back and the app keeps running on the original data.
  ipcMain.handle('backup:restore-local', async () => {
    const pick = await dialog.showOpenDialog({
      title: 'Select SchoolFees Backup to Restore',
      filters: [
        { name: 'SchoolFees Encrypted Backup', extensions: ['sfenc'] },
        { name: 'Legacy SQLite Database',      extensions: ['db'] },
        { name: 'All Backup Files',            extensions: ['sfenc', 'db'] },
      ],
      properties: ['openFile']
    })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, cancelled: true }

    const selectedFile = pick.filePaths[0]
    const fileName     = path.basename(selectedFile)
    let plaintext, formatLabel

    // ── Decode/decrypt to memory only ─────────────────────────────────────────
    try {
      if (fileName.toLowerCase().endsWith('.sfenc')) {
        const db  = getDb()
        const key = deriveBackupKey(db)
        plaintext = decryptBackup(fs.readFileSync(selectedFile), key)
        formatLabel = 'Encrypted (AES-256-GCM) — decryption verified ✓'
      } else {
        plaintext = fs.readFileSync(selectedFile)
        formatLabel = 'Legacy unencrypted SQLite (.db)'
      }
      validateSqliteBytes(plaintext)
    } catch (e) {
      return { ok: false, error: e.message }
    }

    // ── Native OS confirmation ────────────────────────────────────────────────
    const m  = fileName.match(/(\d{4}-\d{2}-\d{2}[_T-][\d:-]+)/)
    const ts = m ? m[1] : 'unknown date'
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Confirm Database Restore',
      message: 'Replace current data with this backup?',
      detail: [
        `File    : ${fileName}`,
        `Date    : ${ts}`,
        `Format  : ${formatLabel}`,
        `DB size : ${(plaintext.length / 1024 / 1024).toFixed(2)} MB`,
        '',
        'This will replace ALL current students, payments, bills and settings.',
        'The application will restart automatically.',
        '',
        'WARNING: This cannot be undone. A safety copy of the current data',
        'will be kept beside the database file.',
      ].join('\n'),
      buttons: ['Cancel', 'Restore Now'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response === 0) return { ok: false, cancelled: true }

    // ── Write validated bytes, verify, relaunch ───────────────────────────────
    const dbPath     = getDbPath()
    const safetyPath = dbPath.replace('.db', `_before_restore_${Date.now()}.db`)
    try {
      // Safety copy while DB is still open
      fs.copyFileSync(dbPath, safetyPath)

      // Close DB — release all file locks (Windows needs a beat)
      closeDb()
      await new Promise(r => setTimeout(r, 400))

      // Remove ONLY WAL/SHM sidecar files — NEVER the main db file
      for (const side of ['-wal', '-shm']) {
        try { if (fs.existsSync(dbPath + side)) fs.unlinkSync(dbPath + side) } catch {}
      }

      fs.writeFileSync(dbPath, plaintext)

      // Verify the write landed completely
      const written = fs.statSync(dbPath).size
      if (written !== plaintext.length) {
        throw new Error(`Restore write incomplete — expected ${plaintext.length} bytes, got ${written}. Check disk space.`)
      }

      // Clean restart — guarantees no stale DB handles anywhere in the app
      setTimeout(() => { app.relaunch(); app.exit(0) }, 600)
      return { ok: true, restarting: true, safetyPath }
    } catch (e) {
      // Roll back to the safety copy — original data is never lost
      try {
        if (fs.existsSync(safetyPath)) {
          fs.copyFileSync(safetyPath, dbPath)
        }
        reopenDb()
      } catch {}
      return { ok: false, error: `Restore failed: ${e.message}. Your original data is unchanged.` }
    }
  })

  // ── List backups in the system backup folder ────────────────────────────────
  ipcMain.handle('backup:list-local', () => {
    try {
      const dir = getBackupDir()
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.sfenc'))
        .map(f => {
          const st = fs.statSync(path.join(dir, f))
          return { name: f, path: path.join(dir, f), size: st.size, mtime: st.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch { return [] }
  })

  // ── Reload renderer (legacy compat — restore now relaunches instead) ────────
  ipcMain.handle('backup:reload-app', () => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (win) setTimeout(() => win.reload(), 300)
    return { ok: true }
  })

  // ── Cloud sync folder (NovaPOS Google Drive method) ─────────────────────────
  ipcMain.handle('backup:get-sync-folder', () => loadSyncConfig())

  // List the encrypted backups sitting in the user's ONE backup folder
  ipcMain.handle('backup:list-folder', () => {
    const cfg = loadSyncConfig()
    if (!cfg?.folder) return { configured: false, files: [] }
    try {
      if (!fs.existsSync(cfg.folder)) return { configured: true, missing: true, files: [] }
      const files = fs.readdirSync(cfg.folder)
        .filter(f => f.endsWith('.sfenc'))
        .map(f => {
          const st = fs.statSync(path.join(cfg.folder, f))
          return { name: f, size: st.size, mtime: st.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 15)
      return { configured: true, files }
    } catch (e) { return { configured: true, error: e.message, files: [] } }
  })

  ipcMain.handle('backup:set-sync-folder', async (_, { folder, enabled = true }) => {
    try { saveSyncConfig({ ...(loadSyncConfig() || {}), folder, enabled }); return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('backup:pick-sync-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Backup Folder',
      message: 'Select your Google Drive (or OneDrive/Dropbox) folder — encrypted backups will be copied there and synced by your cloud app.',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { folder: null, canceled: true }
    const folder = result.filePaths[0]
    // Persist immediately so the selection survives even if the renderer
    // forgets to call set-sync-folder afterwards.
    try { saveSyncConfig({ ...(loadSyncConfig() || {}), folder, enabled: true }) } catch {}
    return { folder }
  })

  ipcMain.handle('backup:sync-now', async () => {
    const cfg = loadSyncConfig()
    if (!cfg?.folder || !cfg.enabled) return { ok: false, error: 'No sync folder configured' }
    try {
      const r = performEncryptedBackup()
      if (!r.syncCopied) return { ok: false, error: r.syncError || 'Copy to sync folder failed' }
      return { ok: true, path: path.join(cfg.folder, r.filename) }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

// Export for the nightly scheduler — same code path as manual Backup Now
module.exports.performEncryptedBackup = performEncryptedBackup
module.exports.loadSyncConfig = loadSyncConfig
