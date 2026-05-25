const { ipcMain, dialog, app } = require('electron')
const fs   = require('fs')
const path = require('path')
const { closeDb, reopenDb, getDbPath } = require('../lib/database')

module.exports = function registerBackupHandlers() {

  ipcMain.handle('backup:get-db-path', () => getDbPath())

  ipcMain.handle('backup:local', async () => {
    const dbPath = getDbPath()
    const result = await dialog.showSaveDialog({
      defaultPath: `schoolfees_backup_${new Date().toISOString().slice(0,10)}.db`,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })
    if (result.canceled) return { ok: false }
    fs.copyFileSync(dbPath, result.filePath)
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('backup:restore-local', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled) return { ok: false }

    const dbPath = getDbPath()

    // 1. Save safety copy BEFORE closing
    const safetyPath = dbPath.replace('.db', `_before_restore_${Date.now()}.db`)
    fs.copyFileSync(dbPath, safetyPath)

    // 2. CLOSE the DB connection — this is the fix for the restore not reflecting
    closeDb()

    // 3. Replace the file
    fs.copyFileSync(result.filePaths[0], dbPath)

    // 4. Reopen immediately so next request works
    reopenDb()

    return { ok: true, safetyPath }
  })

  // Called from renderer after restore to force full app reload
  ipcMain.handle('backup:reload-app', () => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.reload()
    return { ok: true }
  })
}
