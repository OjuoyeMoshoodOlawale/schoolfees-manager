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
const netConfig = require('./lib/network.config')

// Use network DB if configured, otherwise use local DB
const effectiveDbPath = (() => {
  if (netConfig.USE_NETWORK_DB && netConfig.SHARE_PATH) {
    const path = require('path')
    const networkPath = path.join(netConfig.SHARE_PATH, netConfig.DB_FILENAME)
    console.log('[DB] Using network database:', networkPath)
    return networkPath
  }
  return dbPath
})()

setDbPath(effectiveDbPath)

// ─── Register All Handler Modules ─────────────────────────────────────────────
require('./handlers/settings')(dbDir)
require('./handlers/backup')()
require('./handlers/gdrive')()
require('./handlers/core')()
require('./handlers/fees')()
require('./handlers/billing')()
require('./handlers/payments')()
require('./handlers/auth')()
require('./handlers/activation')()
require('./handlers/communications')()
require('./handlers/accounting')()

// ── Start auto-backup scheduler ───────────────────────────────────────────────
const { startScheduler } = require('./lib/scheduler')
startScheduler()

// ─── Utility IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-path', (_, p) => shell.openPath(p))
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:get-db-dir', () => dbDir)

// ─── Clean Print — renders pure HTML in a hidden window, no app chrome ─────────
ipcMain.handle('app:print-html', async (_, { html, silent = false }) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      width: 800, height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    const fullHtml = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 12pt; background: white; }
        @page { margin: 1cm; }
      </style>
    </head><body>${html}</body></html>`

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print(
        { silent, printBackground: true, margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
        (success, errorType) => {
          printWin.destroy()
          resolve({ ok: success, error: success ? null : errorType })
        }
      )
    })
  })
})

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

// ─── Graceful shutdown on Ctrl+C / kill in dev ────────────────────────────────
// Without these, Vite/nodemon kills the process before closeDb() runs,
// leaving the WASM DB un-flushed → activation row lost → setup wizard on next start.
function gracefulShutdown(signal) {
  console.log(`[main] ${signal} received — closing DB before exit`)
  try { require('./lib/database').closeDb() } catch {}
  process.exit(0)
}
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))   // Ctrl+C in terminal
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))  // kill / system shutdown
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'))  // nodemon restart signal
