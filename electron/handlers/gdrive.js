const { ipcMain, shell, BrowserWindow } = require('electron')
const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')
const http = require('http')
const url  = require('url')
const { getDbPath } = require('../lib/database')

const SCOPES        = ['https://www.googleapis.com/auth/drive.file']
const REDIRECT_PORT = 42813
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`

// ── Credential storage ────────────────────────────────────────────────────────
function getCredentialDir() {
  const { app } = require('electron')
  const dir = path.join(app.getPath('userData'), 'gdrive')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
const getTokenPath  = () => path.join(getCredentialDir(), 'gdrive_token.json')
const getConfigPath = () => path.join(getCredentialDir(), 'gdrive_config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) } catch { return null }
}
function saveConfig(cfg) { fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2)) }
function loadToken()     {
  try { return JSON.parse(fs.readFileSync(getTokenPath(), 'utf8')) } catch { return null }
}
function saveToken(t)    { fs.writeFileSync(getTokenPath(), JSON.stringify(t, null, 2)) }

function makeOAuth2Client(cfg) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT_URI)
}

// ── SHARED: get an authenticated Drive client, refreshing token if needed ─────
// Used by backup, list, and restore — ensures token is always fresh.
async function getAuthenticatedDrive() {
  const cfg   = loadConfig()
  const token = loadToken()
  if (!cfg || !token) throw new Error('Not connected to Google Drive. Please connect first.')
  if (!token.refresh_token) throw new Error('No refresh token stored. Please disconnect and reconnect Google Drive.')

  const oauth2 = makeOAuth2Client(cfg)
  oauth2.setCredentials(token)

  // Persist new tokens whenever googleapis auto-refreshes
  oauth2.on('tokens', (newTokens) => {
    const merged = { ...loadToken(), ...newTokens }
    saveToken(merged)
    oauth2.setCredentials(merged)
  })

  // Proactively refresh if missing access_token or expiring within 2 minutes
  const needsRefresh = !token.access_token ||
    (token.expiry_date && token.expiry_date < Date.now() + 120_000)

  if (needsRefresh) {
    try {
      const { credentials } = await oauth2.refreshAccessToken()
      const merged = { ...loadToken(), ...credentials }
      saveToken(merged)
      oauth2.setCredentials(merged)
    } catch (refreshErr) {
      // If refresh fails with invalid_grant the token is revoked — clear it
      if (refreshErr.message?.includes('invalid_grant') || refreshErr.code === 400) {
        try { fs.unlinkSync(getTokenPath()) } catch {}
        throw new Error('Google Drive session has expired or was revoked. Please reconnect in Backup & Restore.')
      }
      // Other errors (network) — try with what we have
      console.warn('[gdrive] Proactive refresh failed:', refreshErr.message)
    }
  }

  return { drive: google.drive({ version: 'v3', auth: oauth2 }), token: loadToken() }
}

// ── Status ────────────────────────────────────────────────────────────────────
ipcMain.handle('gdrive:status', () => {
  const cfg   = loadConfig()
  const token = loadToken()
  // configured = file exists AND both fields are non-empty strings
  const hasValidCreds = !!(cfg?.client_id?.trim() && cfg?.client_secret?.trim())
  return {
    configured:    hasValidCreds,
    connected:     !!(hasValidCreds && token?.refresh_token),
    email:         token?.email      || null,
    lastBackup:    token?.lastBackup || null,
    folderId:      token?.folderId   || null,
    client_id_hint: cfg?.client_id   ? cfg.client_id.slice(0, 12) + '…' : null,
  }
})

// ── Get saved client_id (for pre-fill — never returns secret) ────────────────
ipcMain.handle('gdrive:get-client-id', () => {
  const cfg = loadConfig()
  return { client_id: cfg?.client_id || '' }
})

// ── Save credentials ──────────────────────────────────────────────────────────
ipcMain.handle('gdrive:save-credentials', (_, { client_id, client_secret }) => {
  try { saveConfig({ client_id, client_secret }); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

// ── OAuth connect flow ────────────────────────────────────────────────────────
ipcMain.handle('gdrive:connect', async () => {
  const cfg = loadConfig()
  if (!cfg?.client_id?.trim() || !cfg?.client_secret?.trim()) {
    return { ok: false, error: 'OAuth credentials are missing or incomplete. Open the "OAuth Credentials" section, enter your Client ID and Client Secret, click Save Credentials, then try connecting again.' }
  }

  const oauth2  = makeOAuth2Client(cfg)
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline', scope: SCOPES, prompt: 'consent',
  })

  return new Promise((resolve) => {
    let handled = false

    const server = http.createServer(async (req, res) => {
      if (handled) return
      handled = true

      const parsed = url.parse(req.url, true)
      const code   = parsed.query.code
      const error  = parsed.query.error

      const sendPage = (ok, title, body) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:${ok ? '#16a34a' : '#dc2626'}">${ok ? '✓' : '✗'} ${title}</h2>
          <p>${body}</p><p>You can close this tab.</p></body></html>`)
      }

      if (error || !code) {
        sendPage(false, 'Connection failed', error || 'No authorisation code returned.')
        server.close()
        return resolve({ ok: false, error: error || 'No code returned from Google.' })
      }

      try {
        const { tokens } = await oauth2.getToken(code)
        if (!tokens.refresh_token) {
          // Token reuse — user already authorised before; revoke and retry
          sendPage(false, 'No refresh token',
            'Google did not return a refresh token. In Google Drive, go to your account → Security → Third-party apps → remove SchoolFees Manager, then try connecting again.')
          server.close()
          return resolve({ ok: false, error: 'No refresh_token. Revoke the app in Google account and reconnect.' })
        }
        oauth2.setCredentials(tokens)

        const people  = google.oauth2({ version: 'v2', auth: oauth2 })
        const info    = await people.userinfo.get()
        const email   = info.data.email

        const drive    = google.drive({ version: 'v3', auth: oauth2 })
        const existing = await drive.files.list({
          q: "name='SchoolFees Manager Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'files(id)',
        })
        const folderId = existing.data.files.length > 0
          ? existing.data.files[0].id
          : (await drive.files.create({
              requestBody: { name: 'SchoolFees Manager Backups', mimeType: 'application/vnd.google-apps.folder' },
              fields: 'id',
            })).data.id

        saveToken({ ...tokens, email, folderId })
        sendPage(true, 'SchoolFees Manager connected!', `Signed in as <strong>${email}</strong>`)
        server.close()
        resolve({ ok: true, email, folderId })
      } catch (e) {
        sendPage(false, 'Connection error', e.message)
        server.close()
        resolve({ ok: false, error: e.message })
      }
    })

    server.listen(REDIRECT_PORT, () => shell.openExternal(authUrl))
    server.on('error', (e) => resolve({ ok: false, error: `Could not start local server: ${e.message}` }))
    setTimeout(() => { server.close(); resolve({ ok: false, error: 'Authentication timed out.' }) }, 3 * 60 * 1000)
  })
})

// ── Disconnect ────────────────────────────────────────────────────────────────
ipcMain.handle('gdrive:disconnect', () => {
  try { const tp = getTokenPath(); if (fs.existsSync(tp)) fs.unlinkSync(tp); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

// ── Backup ────────────────────────────────────────────────────────────────────
ipcMain.handle('gdrive:backup', async () => {
  try {
    const { drive, token } = await getAuthenticatedDrive()
    const dbPath   = getDbPath()
    const now      = new Date()
    const stamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `schoolfees_backup_${stamp}.db`

    const response = await drive.files.create({
      requestBody: { name: filename, parents: [token.folderId] },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(dbPath) },
      fields: 'id, name, size',
    })

    // Keep last 10 backups
    const list   = await drive.files.list({
      q: `'${token.folderId}' in parents and trashed=false`,
      orderBy: 'createdTime desc', fields: 'files(id,name,createdTime)',
    })
    for (const f of list.data.files.slice(10)) {
      await drive.files.delete({ fileId: f.id }).catch(() => {})
    }

    saveToken({ ...loadToken(), lastBackup: now.toISOString() })
    return { ok: true, filename, fileId: response.data.id, size: response.data.size, time: now.toISOString() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── List remote backups ───────────────────────────────────────────────────────
ipcMain.handle('gdrive:list-backups', async () => {
  try {
    const { drive, token } = await getAuthenticatedDrive()
    const list = await drive.files.list({
      q: `'${token.folderId}' in parents and trashed=false`,
      orderBy: 'createdTime desc', fields: 'files(id,name,size,createdTime)', pageSize: 20,
    })
    return { ok: true, files: list.data.files }
  } catch (e) {
    return { ok: false, files: [], error: e.message }
  }
})

// ── Restore ───────────────────────────────────────────────────────────────────
ipcMain.handle('gdrive:restore', async (_, { fileId }) => {
  try {
    const { drive } = await getAuthenticatedDrive()
    const dbPath    = getDbPath()
    const tempPath  = dbPath + '.gdrive_restore_tmp'
    const dest      = fs.createWriteStream(tempPath)

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    await new Promise((resolve, reject) => { res.data.pipe(dest); dest.on('finish', resolve); dest.on('error', reject) })

    // Validate SQLite header
    const header = Buffer.alloc(16)
    const fd = fs.openSync(tempPath, 'r')
    fs.readSync(fd, header, 0, 16, 0)
    fs.closeSync(fd)
    if (!header.toString('utf8', 0, 16).startsWith('SQLite format 3')) {
      fs.unlinkSync(tempPath)
      return { ok: false, error: 'Downloaded file is not a valid SQLite database.' }
    }

    const { closeDb, reopenDb } = require('../lib/database')
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

module.exports = function registerGDriveHandlers() {}

// ── Scheduler ─────────────────────────────────────────────────────────────────
const { loadSchedulerConfig, saveSchedulerConfig, runLocalAutoBackup } = require('../lib/scheduler')

ipcMain.handle('scheduler:get-config', () => loadSchedulerConfig())
ipcMain.handle('scheduler:save-config', (_, cfg) => {
  try {
    saveSchedulerConfig(cfg)
    const { startScheduler, stopScheduler } = require('../lib/scheduler')
    stopScheduler()
    if (cfg.enabled) startScheduler()
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('scheduler:run-now', async () => runLocalAutoBackup())

// ── Update checker ────────────────────────────────────────────────────────────
ipcMain.handle('app:check-update', async () => {
  try {
    const { app }    = require('electron')
    const current    = app.getVersion()
    const res        = await fetch(
      'https://api.github.com/repos/OjuoyeMoshoodOlawale/schoolfees-manager/releases/latest',
      { headers: { 'User-Agent': 'SchoolFeesManager/' + current } }
    )
    if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` }

    const data     = await res.json()
    const latest   = data.tag_name?.replace(/^v/, '') || data.name
    const toNum    = v => v.replace(/[^0-9.]/g, '').split('.').map(Number)
    const [cM,cN,cP] = toNum(current)
    const [lM,lN,lP] = toNum(latest)
    const hasUpdate  = lM > cM || (lM===cM && lN > cN) || (lM===cM && lN===cN && lP > cP)
    return { ok: true, currentVersion: current, latestVersion: latest, hasUpdate,
      notes: data.body||'', releaseUrl: data.html_url||'', downloadUrl: data.assets?.[0]?.browser_download_url||data.html_url||'' }
  } catch (e) { return { ok: false, error: e.message } }
})
