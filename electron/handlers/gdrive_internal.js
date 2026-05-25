/**
 * Shared backup logic callable from both IPC handlers and the scheduler
 */
const { google } = require('googleapis')
const fs   = require('fs')
const path = require('path')
const { getDbPath } = require('../lib/database')

const REDIRECT_PORT = 42813
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`

function getTokenPath() {
  return path.join(path.dirname(getDbPath()), 'gdrive_token.json')
}
function getConfigPath() {
  return path.join(path.dirname(getDbPath()), 'gdrive_config.json')
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) } catch { return null }
}
function loadToken() {
  try { return JSON.parse(fs.readFileSync(getTokenPath(), 'utf8')) } catch { return null }
}
function saveToken(t) {
  fs.writeFileSync(getTokenPath(), JSON.stringify(t, null, 2))
}

async function backupNow() {
  const cfg   = loadConfig()
  const token = loadToken()
  if (!cfg || !token) return { ok: false, error: 'Not connected to Google Drive.' }

  const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT_URI)
  oauth2.setCredentials(token)
  oauth2.on('tokens', (newTokens) => saveToken({ ...loadToken(), ...newTokens }))

  const drive    = google.drive({ version: 'v3', auth: oauth2 })
  const dbPath   = getDbPath()
  const now      = new Date()
  const stamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `schoolfees_backup_${stamp}.db`

  const response = await drive.files.create({
    requestBody: { name: filename, parents: [token.folderId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(dbPath) },
    fields: 'id, name, size',
  })

  // Prune to 10
  const list = await drive.files.list({
    q: `'${token.folderId}' in parents and trashed=false`,
    orderBy: 'createdTime desc',
    fields: 'files(id)',
  })
  for (const f of list.data.files.slice(10)) {
    await drive.files.delete({ fileId: f.id }).catch(() => {})
  }

  saveToken({ ...loadToken(), lastBackup: now.toISOString() })
  return { ok: true, filename, fileId: response.data.id, time: now.toISOString() }
}

module.exports = { backupNow }
