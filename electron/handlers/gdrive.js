const { ipcMain, shell, BrowserWindow } = require('electron')
const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')
const http = require('http')
const url  = require('url')
const { getDbPath } = require('../lib/database')

// ── OAuth2 credentials (public desktop app client — not secret) ───────────────
// Schools must set up their own Google Cloud project OR we ship a shared one.
// For distribution, replace these with your real client_id from Google Console.
// These are placeholder values — the UI will guide the user to set theirs.
const SCOPES = ['https://www.googleapis.com/auth/drive.file']
const REDIRECT_PORT = 42813
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`

// ── Token/config storage — use app userData so credentials survive DB moves ───
// Storing next to the DB caused "not connected" when DB was copied to another PC
// because the new machine has a different path and the token file wasn't copied.
function getCredentialDir() {
  const { app } = require('electron')
  const dir = path.join(app.getPath('userData'), 'gdrive')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
function getTokenPath()  { return path.join(getCredentialDir(), 'gdrive_token.json') }
function getConfigPath() { return path.join(getCredentialDir(), 'gdrive_config.json') }

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) } catch { return null }
}
function saveConfig(cfg) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2))
}
function loadToken() {
  try { return JSON.parse(fs.readFileSync(getTokenPath(), 'utf8')) } catch { return null }
}
function saveToken(token) {
  fs.writeFileSync(getTokenPath(), JSON.stringify(token, null, 2))
}

function makeOAuth2Client(cfg) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT_URI)
}

// ── Check connection status ───────────────────────────────────────────────────
ipcMain.handle('gdrive:status', () => {
  const cfg   = loadConfig()
  const token = loadToken()
  return {
    configured: !!cfg,
    connected:  !!(cfg && token),
    email:      token?.email || null,
    lastBackup: token?.lastBackup || null,
    folderId:   token?.folderId  || null,
  }
})

// ── Save OAuth credentials from user ─────────────────────────────────────────
ipcMain.handle('gdrive:save-credentials', (_, { client_id, client_secret }) => {
  try {
    saveConfig({ client_id, client_secret })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── Start OAuth flow (opens browser, waits for redirect) ─────────────────────
ipcMain.handle('gdrive:connect', async () => {
  const cfg = loadConfig()
  if (!cfg) return { ok: false, error: 'No credentials configured.' }

  const oauth2 = makeOAuth2Client(cfg)
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  return new Promise((resolve) => {
    let handled = false

    const server = http.createServer(async (req, res) => {
      if (handled) return
      handled = true

      const parsed = url.parse(req.url, true)
      const code   = parsed.query.code
      const error  = parsed.query.error

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#dc2626">&#10060; Connection failed</h2>
          <p>${error || 'No authorisation code returned.'}</p>
          <p>You can close this tab and try again.</p>
        </body></html>`)
        server.close()
        return resolve({ ok: false, error: error || 'No code returned from Google.' })
      }

      // Process the code first, THEN send the success page
      try {
        const { tokens } = await oauth2.getToken(code)
        oauth2.setCredentials(tokens)

        const people = google.oauth2({ version: 'v2', auth: oauth2 })
        const info   = await people.userinfo.get()
        const email  = info.data.email

        const drive    = google.drive({ version: 'v3', auth: oauth2 })
        const existing = await drive.files.list({
          q: "name='SchoolFees Manager Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'files(id)',
        })
        let folderId
        if (existing.data.files.length > 0) {
          folderId = existing.data.files[0].id
        } else {
          const folder = await drive.files.create({
            requestBody: { name: 'SchoolFees Manager Backups', mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id',
          })
          folderId = folder.data.id
        }

        saveToken({ ...tokens, email, folderId })

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#16a34a">&#10003; SchoolFees Manager connected!</h2>
          <p>Signed in as <strong>${email}</strong></p>
          <p>You can close this tab and return to the app.</p>
        </body></html>`)
        server.close()
        resolve({ ok: true, email, folderId })
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#dc2626">&#10060; Connection error</h2>
          <p>${e.message}</p>
        </body></html>`)
        server.close()
        resolve({ ok: false, error: e.message })
      }
    })

    server.listen(REDIRECT_PORT, () => {
      shell.openExternal(authUrl)
    })

    server.on('error', (e) => {
      resolve({ ok: false, error: `Could not start local server: ${e.message}` })
    })

    // Timeout after 3 minutes
    setTimeout(() => {
      server.close()
      resolve({ ok: false, error: 'Authentication timed out. Please try again.' })
    }, 3 * 60 * 1000)
  })
})

// ── Disconnect ────────────────────────────────────────────────────────────────
ipcMain.handle('gdrive:disconnect', () => {
  try {
    const tp = getTokenPath()
    if (fs.existsSync(tp)) fs.unlinkSync(tp)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── Upload backup to Google Drive ─────────────────────────────────────────────
ipcMain.handle('gdrive:backup', async () => {
  const cfg   = loadConfig()
  const token = loadToken()
  if (!cfg || !token) return { ok: false, error: 'Not connected to Google Drive.' }

  const oauth2 = makeOAuth2Client(cfg)
  oauth2.setCredentials(token)

  // Auto-refresh token
  oauth2.on('tokens', (newTokens) => {
    const merged = { ...loadToken(), ...newTokens }
    saveToken(merged)
  })

  try {
    const drive    = google.drive({ version: 'v3', auth: oauth2 })
    const dbPath   = getDbPath()
    const now      = new Date()
    const stamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `schoolfees_backup_${stamp}.db`

    // Upload
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [token.folderId],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(dbPath),
      },
      fields: 'id, name, size',
    })

    // Prune: keep only last 10 backups in the folder
    const list = await drive.files.list({
      q: `'${token.folderId}' in parents and trashed=false`,
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime)',
    })
    const extras = list.data.files.slice(10)
    for (const f of extras) {
      await drive.files.delete({ fileId: f.id }).catch(() => {})
    }

    // Save last backup time
    const updatedToken = { ...loadToken(), lastBackup: now.toISOString() }
    saveToken(updatedToken)

    return {
      ok: true,
      filename,
      fileId: response.data.id,
      size:   response.data.size,
      time:   now.toISOString(),
    }
  } catch (e) {
    // Token expired / revoked
    if (e.code === 401 || (e.message && e.message.includes('invalid_grant'))) {
      // Clear token so user reconnects
      try { fs.unlinkSync(getTokenPath()) } catch {}
      return { ok: false, error: 'Google Drive session expired. Please reconnect.' }
    }
    return { ok: false, error: e.message }
  }
})

// ── List remote backups ───────────────────────────────────────────────────────
ipcMain.handle('gdrive:list-backups', async () => {
  const cfg   = loadConfig()
  const token = loadToken()
  if (!cfg || !token) return { ok: false, files: [] }

  const oauth2 = makeOAuth2Client(cfg)
  oauth2.setCredentials(token)

  try {
    const drive = google.drive({ version: 'v3', auth: oauth2 })
    const list  = await drive.files.list({
      q: `'${token.folderId}' in parents and trashed=false`,
      orderBy: 'createdTime desc',
      fields: 'files(id, name, size, createdTime)',
      pageSize: 20,
    })
    return { ok: true, files: list.data.files }
  } catch (e) {
    return { ok: false, files: [], error: e.message }
  }
})

// ── Download and restore a remote backup ─────────────────────────────────────
ipcMain.handle('gdrive:restore', async (_, { fileId }) => {
  const cfg   = loadConfig()
  const token = loadToken()
  if (!cfg || !token) return { ok: false, error: 'Not connected.' }

  const oauth2 = makeOAuth2Client(cfg)
  oauth2.setCredentials(token)

  const { closeDb, reopenDb } = require('../lib/database')
  const dbPath = getDbPath()

  try {
    const drive = google.drive({ version: 'v3', auth: oauth2 })

    // Download to a temp file first
    const tempPath = dbPath + '.gdrive_restore_tmp'
    const dest     = fs.createWriteStream(tempPath)

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    await new Promise((resolve, reject) => {
      res.data.pipe(dest)
      dest.on('finish', resolve)
      dest.on('error', reject)
    })

    // Validate it's a SQLite file
    const header = Buffer.alloc(16)
    const fd = fs.openSync(tempPath, 'r')
    fs.readSync(fd, header, 0, 16, 0)
    fs.closeSync(fd)
    if (!header.toString('utf8', 0, 16).startsWith('SQLite format 3')) {
      fs.unlinkSync(tempPath)
      return { ok: false, error: 'Downloaded file is not a valid SQLite database.' }
    }

    // Safety copy
    const safePath = dbPath.replace('.db', `_before_gdrive_restore_${Date.now()}.db`)
    fs.copyFileSync(dbPath, safePath)

    closeDb()
    await new Promise(r => setTimeout(r, 300))
    fs.copyFileSync(tempPath, dbPath)
    fs.unlinkSync(tempPath)
    reopenDb()

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

module.exports = function registerGDriveHandlers() {
  // handlers registered above via ipcMain.handle at module load
}

// ── Scheduler IPC ─────────────────────────────────────────────────────────────
const { loadSchedulerConfig, saveSchedulerConfig, runLocalAutoBackup } = require('../lib/scheduler')

ipcMain.handle('scheduler:get-config', () => loadSchedulerConfig())
ipcMain.handle('scheduler:save-config', (_, cfg) => {
  try {
    saveSchedulerConfig(cfg)
    // Restart scheduler with new settings
    const { startScheduler, stopScheduler } = require('../lib/scheduler')
    stopScheduler()
    if (cfg.enabled) startScheduler()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
ipcMain.handle('scheduler:run-now', async () => {
  const result = runLocalAutoBackup()
  return result
})

// ── Update checker ────────────────────────────────────────────────────────────
ipcMain.handle('app:check-update', async () => {
  try {
    const { app } = require('electron')
    const currentVersion = app.getVersion()

    const res  = await fetch('https://api.github.com/repos/OjuoyeMoshoodOlawale/schoolfees-manager/releases/latest', {
      headers: { 'User-Agent': 'SchoolFeesManager/' + currentVersion }
    })
    if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` }

    const data       = await res.json()
    const latest     = data.tag_name?.replace(/^v/, '') || data.name
    const notes      = data.body || ''
    const releaseUrl = data.html_url || 'https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager/releases'
    const downloadUrl = data.assets?.[0]?.browser_download_url || releaseUrl

    // Simple semver comparison — "1.0.0" parts
    const toNum = v => v.replace(/[^0-9.]/g, '').split('.').map(Number)
    const [cMaj, cMin, cPat] = toNum(currentVersion)
    const [lMaj, lMin, lPat] = toNum(latest)
    const hasUpdate =
      lMaj > cMaj ||
      (lMaj === cMaj && lMin > cMin) ||
      (lMaj === cMaj && lMin === cMin && lPat > cPat)

    return { ok: true, currentVersion, latestVersion: latest, hasUpdate, notes, releaseUrl, downloadUrl }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
