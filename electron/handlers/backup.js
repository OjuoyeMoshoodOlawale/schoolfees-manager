const { ipcMain, dialog } = require('electron')
const fs   = require('fs')
const path = require('path')
const { closeDb, reopenDb, getDbPath } = require('../lib/database')

module.exports = function registerBackupHandlers() {

  ipcMain.handle('backup:get-db-path', () => getDbPath())

  // ── Backup current DB to file ─────────────────────────────────────────────
  ipcMain.handle('backup:local', async () => {
    const dbPath = getDbPath()
    const result = await dialog.showSaveDialog({
      defaultPath: `schoolfees_backup_${new Date().toISOString().slice(0,10)}.db`,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })
    if (result.canceled) return { ok: false }

    try {
      fs.copyFileSync(dbPath, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ── Restore / Load a different DB file ────────────────────────────────────
  ipcMain.handle('backup:restore-local', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Database File to Load',
      filters: [{ name: 'SchoolFees Database', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled) return { ok: false }

    const sourcePath = result.filePaths[0]
    const dbPath     = getDbPath()

    // Validate the file is a SQLite database
    try {
      const header = Buffer.alloc(16)
      const fd = fs.openSync(sourcePath, 'r')
      fs.readSync(fd, header, 0, 16, 0)
      fs.closeSync(fd)
      const magic = header.toString('utf8', 0, 16)
      if (!magic.startsWith('SQLite format 3')) {
        return { ok: false, error: 'The selected file is not a valid SQLite database.' }
      }
    } catch (e) {
      return { ok: false, error: 'Cannot read the selected file: ' + e.message }
    }

    // Safety copy of current DB
    const timestamp  = Date.now()
    const safetyPath = dbPath.replace('.db', `_before_restore_${timestamp}.db`)

    try {
      // Step 1: Save safety copy while DB is still open
      fs.copyFileSync(dbPath, safetyPath)

      // Step 2: Close DB — releases all file locks
      closeDb()

      // Step 3: On Windows, wait a moment for file handles to release
      await new Promise(resolve => setTimeout(resolve, 300))

      // Step 4: Replace the database file
      fs.copyFileSync(sourcePath, dbPath)

      // Step 5: Reopen to verify it works
      reopenDb()

      return { ok: true, safetyPath }
    } catch (e) {
      // If replace failed, try to restore from safety copy
      try {
        if (fs.existsSync(safetyPath)) {
          closeDb()
          fs.copyFileSync(safetyPath, dbPath)
          reopenDb()
        }
      } catch {}
      return { ok: false, error: `Failed to load database: ${e.message}` }
    }
  })

  // ── Reload renderer after restore ────────────────────────────────────────
  ipcMain.handle('backup:reload-app', () => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      // Give the DB a moment to settle before reload
      setTimeout(() => win.reload(), 300)
    }
    return { ok: true }
  })
}

// ── Cloud folder sync (simpler alternative to OAuth) ─────────────────────────
const path_m = require('path')
const fs_m   = require('fs')

function getSyncConfigPath() {
  const { getDbPath } = require('../lib/database')
  return path_m.join(path_m.dirname(getDbPath()), 'sync_folder.json')
}
function loadSyncConfig() {
  try { return JSON.parse(fs_m.readFileSync(getSyncConfigPath(), 'utf8')) } catch { return null }
}
function saveSyncConfig(cfg) {
  fs_m.writeFileSync(getSyncConfigPath(), JSON.stringify(cfg, null, 2))
}

ipcMain.handle('backup:get-sync-folder', () => loadSyncConfig())

ipcMain.handle('backup:set-sync-folder', async (_, { folder }) => {
  try {
    saveSyncConfig({ folder, enabled: true })
    return { ok: true }
  } catch(e) { return { ok: false, error: e.message } }
})

ipcMain.handle('backup:pick-sync-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Cloud Sync Folder (e.g. Google Drive or OneDrive folder)',
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('backup:sync-now', async () => {
  const cfg    = loadSyncConfig()
  if (!cfg?.folder || !cfg.enabled) return { ok: false, error: 'No sync folder configured' }
  const { getDbPath } = require('../lib/database')
  const dbPath = getDbPath()
  const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dest   = path_m.join(cfg.folder, `schoolfees_backup_${stamp}.db`)
  try {
    if (!fs_m.existsSync(cfg.folder)) return { ok: false, error: 'Sync folder not found. Is your cloud drive mounted?' }
    fs_m.copyFileSync(dbPath, dest)
    // Keep last 10 in sync folder
    const files = fs_m.readdirSync(cfg.folder)
      .filter(f => f.startsWith('schoolfees_backup_') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs_m.statSync(path_m.join(cfg.folder, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    files.slice(10).forEach(f => { try { fs_m.unlinkSync(path_m.join(cfg.folder, f.name)) } catch {} })
    saveSyncConfig({ ...cfg, lastSync: new Date().toISOString() })
    return { ok: true, path: dest }
  } catch(e) { return { ok: false, error: e.message } }
})
