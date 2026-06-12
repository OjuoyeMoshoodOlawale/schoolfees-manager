const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

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

// ─── LAN multi-user (server/client) ───────────────────────────────────────────
// Capture EVERY ipcMain.handle registration into a registry so the LAN bridge
// can execute the same handlers for client machines. Must be patched BEFORE
// the handler modules below are required.
const { loadNetConfig, saveNetConfig, lanIps } = require('./lib/netConfig')
const { startLanServer, stopLanServer, lanServerRunning } = require('./lib/lanServer')
const ipcRegistry = new Map()
{
  const origHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, fn) => { ipcRegistry.set(channel, fn); return origHandle(channel, fn) }
}
const netCfg = loadNetConfig()
const IS_CLIENT = netCfg.mode === 'client'
if (IS_CLIENT) console.log(`[LAN] CLIENT mode — data served by ${netCfg.serverHost}:${netCfg.serverPort}`)

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
require('./handlers/dataImport')

// ── Start auto-backup scheduler (not on clients — the server owns the DB) ───
const { startScheduler } = require('./lib/scheduler')
if (!IS_CLIENT) startScheduler()

// ─── Network mode IPC (always local — never routed to a server) ──────────────
// Synchronous variant so the preload can decide routing before the app loads.
ipcMain.on('net:get-config-sync', (event) => { event.returnValue = loadNetConfig() })
ipcMain.handle('net:get-config', () => ({ ...loadNetConfig(), running: lanServerRunning() }))
ipcMain.handle('net:lan-ips',    () => lanIps())
ipcMain.handle('net:save-config', (_, cfg) => {
  const merged = saveNetConfig(cfg || {})
  // Apply server start/stop live where possible; mode switches need a restart
  if (merged.mode === 'server') {
    try { startLanServer(ipcRegistry, { port: merged.port, token: merged.token }) } catch (e) { return { ...merged, error: e.message } }
  } else {
    stopLanServer()
  }
  return { ...merged, running: lanServerRunning(), needsRestart: true }
})
ipcMain.handle('net:test-connection', async (_, { host, port, token }) => {
  try {
    const ping = await fetch(`http://${host}:${port}/ping`, { signal: AbortSignal.timeout(4000) }).then(r => r.json())
    if (!ping?.ok) return { ok: false, error: 'Server responded but is not SchoolFees Manager' }
    // Authenticated round-trip — proves the token too
    const res = await fetch(`http://${host}:${port}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sf-token': token || '' },
      body: JSON.stringify({ channel: 'activation:status', data: null }),
      signal: AbortSignal.timeout(4000),
    }).then(r => r.json())
    if (res.__error) return { ok: false, error: res.__error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'No response — check the IP, port, and that the server app is running' : e.message }
  }
})

// ─── Utility IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('shell:open-path',     (_, p)   => shell.openPath(p))
ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url))
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:get-db-dir', () => dbDir)

// ─── User Guides (bundled PDFs) ─────────────────────────────────────────────
function getGuidesDir() {
  return isDev
    ? path.join(__dirname, '..', 'resources', 'guides')
    : path.join(process.resourcesPath, 'guides')
}

ipcMain.handle('guides:list', () => {
  try {
    const dir = getGuidesDir()
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .sort()
      .map(filename => {
        // "01-Students-User-Guide.pdf" → { title: "Students", filename, sizeKb }
        const base = filename.replace(/\.pdf$/i, '')
        const titlePart = base.replace(/^\d+\s*-\s*/, '').replace(/-User-Guide$/i, '')
        const title = titlePart.replace(/-/g, ' ').replace(/\band\b/g, '&')
        const stat = fs.statSync(path.join(dir, filename))
        return { filename, title, sizeKb: Math.round(stat.size / 1024) }
      })
  } catch (e) {
    console.warn('[guides] list failed:', e.message)
    return []
  }
})

ipcMain.handle('guides:open', (_, filename) => {
  try {
    // Validate filename — must be a simple .pdf name, no path traversal
    if (typeof filename !== 'string' || !/^[\w\-. &]+\.pdf$/i.test(filename)) {
      throw new Error('Invalid guide filename')
    }
    const fullPath = path.join(getGuidesDir(), filename)
    if (!fs.existsSync(fullPath)) throw new Error('Guide file not found')
    return shell.openPath(fullPath)
  } catch (e) {
    return e.message || 'Failed to open guide'
  }
})

// Toggle OS-level screenshot/screen capture protection for sensitive screens
ipcMain.handle('app:set-content-protection', (_, enabled) => {
  if (win) win.setContentProtection(!!enabled)
  return { ok: true }
})

// ─── Clean Print — plain PRINT PREVIEW window by default ───────────────────────
// Every print in the app goes through here. Default behaviour: open a visible
// preview window showing exactly what will print, with a Print / Close toolbar
// (hidden on paper via @media print). Pass { direct:true } or { silent:true }
// to skip the preview and print immediately (e.g. thermal receipt printers).
// HTML is loaded from a temp file (not a data: URL) so large bulk jobs with
// embedded base64 logos never hit URL length limits.
ipcMain.handle('app:print-html', async (_, { html, silent = false, direct = false, title = 'Print Preview' }) => {
  // Convert any localfile:// image src to inline base64 so the preview window can render them
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

  const showPreview = !silent && !direct

  const toolbarHtml = showPreview ? `
    <div class="sf-print-toolbar">
      <span class="sf-pt-title">🖨️ Print Preview</span>
      <span class="sf-pt-hint">Review the document, then click Print to send it to your printer.</span>
      <div class="sf-pt-actions">
        <button class="sf-pt-print" onclick="window.print()">Print</button>
        <button class="sf-pt-close" onclick="window.close()">Close</button>
      </div>
    </div>
    <div class="sf-print-paper">` : ''
  const toolbarClose = showPreview ? '</div>' : ''

  const fullHtml = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; font-size: 12pt; background: ${showPreview ? '#525659' : 'white'}; }
      @page { size: A4; margin: 1cm; }
      ${showPreview ? `
      .sf-print-toolbar {
        position: sticky; top: 0; z-index: 9999;
        display: flex; align-items: center; gap: 12px;
        background: #1e293b; color: #fff; padding: 10px 16px;
        font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,.35);
      }
      .sf-pt-title { font-weight: 700; white-space: nowrap; }
      .sf-pt-hint  { color: #94a3b8; font-size: 11.5px; flex: 1; }
      .sf-pt-actions { display: flex; gap: 8px; }
      .sf-pt-print, .sf-pt-close {
        border: 0; border-radius: 6px; padding: 7px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer;
      }
      .sf-pt-print { background: #2563eb; color: #fff; }
      .sf-pt-print:hover { background: #1d4ed8; }
      .sf-pt-close { background: #475569; color: #fff; }
      .sf-pt-close:hover { background: #334155; }
      /* The preview "paper" mirrors a real A4 page: 21cm wide, with the SAME
         1cm @page margin applied as inner padding. This makes the preview a
         true what-you-see-is-what-you-print view — printing no longer shifts
         the layout, because the content box is identical in both modes. */
      .sf-print-paper {
        background: #fff;
        width: 21cm; max-width: 21cm;
        margin: 16px auto 32px;
        padding: 1cm;
        box-shadow: 0 4px 18px rgba(0,0,0,.4);
        min-height: 29.7cm;
      }
      @media print {
        body { background: white; }
        .sf-print-toolbar { display: none !important; }
        /* In print, the @page margin supplies the edge spacing, so the paper
           wrapper drops its own width/margin/padding to avoid double margins
           and a narrower content area than the preview showed. */
        .sf-print-paper {
          width: auto; max-width: none;
          margin: 0; padding: 0;
          box-shadow: none; min-height: 0;
        }
      }` : ''}
    </style>
  </head><body>${toolbarHtml}${processedHtml}${toolbarClose}</body></html>`

  // Write to a temp file — avoids data: URL size limits on bulk print jobs
  const tmpFile = path.join(os.tmpdir(), `sf-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(tmpFile, fullHtml, 'utf8')
  const cleanupTmp = () => { try { fs.unlinkSync(tmpFile) } catch {} }

  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      width: showPreview ? 980 : 800,
      height: showPreview ? 760 : 600,
      show: showPreview,
      title,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    printWin.loadFile(tmpFile)

    if (showPreview) {
      // Preview mode: window stays open until the user prints/closes it
      printWin.once('closed', cleanupTmp)
      printWin.webContents.once('did-finish-load', () => resolve({ ok: true, preview: true }))
    } else {
      // Direct/silent mode: print immediately, no preview (thermal printers etc.)
      printWin.webContents.once('did-finish-load', () => {
        printWin.webContents.print(
          { silent, printBackground: true, margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
          (success, errorType) => {
            printWin.destroy()
            cleanupTmp()
            resolve({ ok: success, error: success ? null : errorType })
          }
        )
      })
    }
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
    autoHideMenuBar: true,   // hide the menu bar (Alt reveals it temporarily in dev)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // webSecurity stays ON (default true) — use localfile:// for local images
    },
    titleBarStyle: 'default',
    show: false,
  })
  // Remove the application menu entirely so no menu bar shows in any build
  win.setMenuBarVisibility(false)
  Menu.setApplicationMenu(null)
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => win.setTitle('SchoolFees Manager'))

  // ── Block DevTools / inspection shortcuts in production ───────────────────
  // Normal users cannot open the console. Support staff use a secret combo:
  // Ctrl+Shift+Alt+D  (only works in production, opens DevTools for diagnostics)
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase()
      const blocked =
        key === 'f12' ||
        (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (input.meta    && input.alt   && (key === 'i' || key === 'j'))   // mac
      // Secret support combo: Ctrl+Shift+Alt+D → allow DevTools
      const supportCombo = input.control && input.shift && input.alt && key === 'd'
      if (supportCombo) {
        win.webContents.openDevTools({ mode: 'detach' })
        event.preventDefault()
        return
      }
      if (blocked) event.preventDefault()
    })
    // Also prevent right-click → Inspect
    win.webContents.on('context-menu', (e) => e.preventDefault())
  }

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
  // LAN multi-user: in server mode, start serving clients on launch
  if (netCfg.mode === 'server') {
    try { startLanServer(ipcRegistry, { port: netCfg.port, token: netCfg.token }) }
    catch (e) { console.error('[LAN] failed to start server:', e.message) }
  }
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
