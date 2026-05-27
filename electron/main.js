const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── DB Path Setup ────────────────────────────────────────────────────────────
// Dev:        <project>/database/schoolfees.db  (easy to inspect during development)
// Production: C:\Users\USER\AppData\Roaming\SchoolFees Manager\data\schoolfees.db
//             (hidden from casual access, survives app updates/reinstalls)
const dbDir = isDev
  ? path.join(__dirname, '..', 'database')
  : path.join(app.getPath('userData'), 'data')

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'schoolfees.db')

// ── In production: migrate DB from old resources path if it exists there ──────
if (!isDev) {
  const oldPath = path.join(process.resourcesPath, 'database', 'schoolfees.db')
  if (fs.existsSync(oldPath) && !fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(oldPath, dbPath)
      console.log('[main] Migrated DB from resources to userData')
      fs.unlinkSync(oldPath)
    } catch (e) { console.warn('[main] DB migration warning:', e.message) }
  }

  // Restrict NTFS permissions on the data folder so only the current user can read it
  // icacls: remove inheritance, reset to owner-only, grant current user full control
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      execSync(`icacls "${dbDir}" /inheritance:r /grant:r "%USERNAME%:F" /T /C`, { stdio: 'ignore' })
      console.log('[main] DB folder permissions restricted to current user')
    } else {
      execSync(`chmod 700 "${dbDir}"`, { stdio: 'ignore' })
    }
  } catch {}
}

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
require('./handlers/errorHandler')  // load first — safeHandle must exist before other handlers use it
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
require('./handlers/inventory')

// ── Start auto-backup scheduler ───────────────────────────────────────────────
const { startScheduler } = require('./lib/scheduler')
startScheduler()

// ─── Utility IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-path',     (_, p)   => shell.openPath(p))
ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url))
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
    let filePath = decodeURIComponent(match[1])
    // Remove leading slash before Windows drive letter: /C:/path → C:/path
    if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)
    // Use path.normalize to get the correct OS path separator
    filePath = path.normalize(filePath)
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
    const { pathToFileURL } = require('url')
    try {
      // Electron may or may not percent-encode the URL — handle both cases
      let raw = request.url.replace(/^localfile:\/\//, '')
      // Decode only if it looks encoded (contains %)
      if (raw.includes('%')) raw = decodeURIComponent(raw)
      // Remove leading slash before Windows drive letter: /C:/path → C:/path
      if (/^\/[A-Za-z]:/.test(raw)) raw = raw.slice(1)
      // Normalise backslashes → forward slashes
      raw = raw.replace(/\\/g, '/')
      // Use pathToFileURL which correctly handles spaces and special chars
      const fileUrl = pathToFileURL(raw).href
      return net.fetch(fileUrl)
    } catch (e) {
      console.warn('[localfile] Failed to serve:', request.url, e.message)
      return new Response('Not found', { status: 404 })
    }
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

  // ── Security: block navigation away from the app and external window opens ──
  win.webContents.on('will-navigate', (event, navUrl) => {
    const allowed = isDev ? 'http://localhost:5173' : 'file://'
    if (!navUrl.startsWith(allowed)) {
      event.preventDefault()
      console.warn('[security] Blocked navigation to:', navUrl)
    }
  })
  // External links open in the system browser, never in the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

// ─── DB lock file cleanup ─────────────────────────────────────────────────────
// SQLite WAL mode leaves a .lock file that prevents reopening after a crash.
// Delete lock files/dirs on startup and every quit path.
function cleanDbLock() {
  const exts = ['.lock', '-journal', '-wal', '-shm']
  for (const ext of exts) {
    const lockPath = dbPath + ext
    try {
      if (!fs.existsSync(lockPath)) continue
      const stat = fs.statSync(lockPath)
      if (stat.isDirectory()) {
        fs.rmSync(lockPath, { recursive: true, force: true })
        console.log('[main] Removed lock directory:', ext)
      } else {
        fs.unlinkSync(lockPath)
        console.log('[main] Removed lock file:', ext)
      }
    } catch {}
  }
}
cleanDbLock() // Run immediately on startup — before DB opens

app.whenReady().then(() => {
  // Hide native menu bar in production — keep in dev for DevTools access
  if (app.isPackaged) Menu.setApplicationMenu(null)
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    require('./lib/database').closeDb()
    cleanDbLock()
    app.quit()
  }
})
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ─── Graceful shutdown on Ctrl+C / kill in dev ────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`[main] ${signal} received — closing DB before exit`)
  try { require('./lib/database').closeDb() } catch {}
  cleanDbLock()
  process.exit(0)
}
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'))
