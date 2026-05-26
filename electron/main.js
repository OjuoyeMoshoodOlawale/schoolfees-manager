const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── DB Path Setup ────────────────────────────────────────────────────────────
const dbDir = isDev
  ? path.join(__dirname, '..', 'database')
  : path.join(process.resourcesPath, 'database')

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'schoolfees.db')

// ─── Safe local-file protocol — replaces file:// so webSecurity stays ON ─────
// Usage in renderer: <img src="localfile:///absolute/path/to/image.png">
// Registered before app is ready (required by Electron).
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true } }
])

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
require('./handlers/payroll')
require('./handlers/expenses')

// ── Start auto-backup scheduler ───────────────────────────────────────────────
const { startScheduler } = require('./lib/scheduler')
startScheduler()

// ─── Utility IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-path', (_, p) => shell.openPath(p))
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:get-db-dir', () => dbDir)

// Toggle OS-level screenshot/screen capture protection for sensitive screens
ipcMain.handle('app:set-content-protection', (_, enabled) => {
  if (win) win.setContentProtection(!!enabled)
  return { ok: true }
})

// ─── Clean Print — renders pure HTML in a hidden window, no app chrome ─────────
ipcMain.handle('app:print-html', async (_, { html, silent = false }) => {
  // Convert any localfile:// image src to inline base64 so the data: URL context can render them
  let processedHtml = html
  const imgRegex = /src="localfile:\/\/([^"]+)"/g
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const filePath = decodeURIComponent(match[1])
    try {
      if (fs.existsSync(filePath)) {
        const ext  = path.extname(filePath).toLowerCase().replace('.', '') || 'png'
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        const b64  = fs.readFileSync(filePath).toString('base64')
        processedHtml = processedHtml.replace(match[0], `src="data:${mime};base64,${b64}"`)
      }
    } catch { /* skip — image just won't show */ }
  }

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
    </head><body>${processedHtml}</body></html>`

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
  // Register safe local-file protocol: localfile:///path → serves file from disk
  protocol.handle('localfile', (request) => {
    // Strip the scheme — localfile:///C:/... → /C:/... or localfile:///home/... → /home/...
    const filePath = decodeURIComponent(request.url.replace('localfile://', ''))
    return net.fetch(`file://${filePath}`)
  })

  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // webSecurity stays ON (default true) — use localfile:// for local images
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
