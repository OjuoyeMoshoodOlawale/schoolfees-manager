const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── DB Path Setup ────────────────────────────────────────────────────────────
const dbDir = isDev
  ? path.join(__dirname, '..', 'database')
  : path.join(process.resourcesPath, 'database')

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'schoolfees.db')

const { setDbPath } = require('./lib/database')
setDbPath(dbPath)

// ─── Register All Handler Modules ─────────────────────────────────────────────
require('./handlers/settings')(dbDir)
require('./handlers/backup')()
require('./handlers/core')()
require('./handlers/fees')()
require('./handlers/billing')()
require('./handlers/payments')()
require('./handlers/auth')()
require('./handlers/activation')()
require('./handlers/communications')()
require('./handlers/accounting')()

// ─── Utility IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-path', (_, p) => shell.openPath(p))
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:get-db-dir', () => dbDir)

// ─── Window ───────────────────────────────────────────────────────────────────
let win
function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    titleBarStyle: 'default',
    show: false,
  })
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => win.setTitle('SchoolFees Manager'))
}
app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    require('./lib/database').closeDb()
    app.quit()
  }
})
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
