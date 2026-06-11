// electron/lib/backupCrypto.js
// ─────────────────────────────────────────────────────────────────────────────
// Encrypted backup format (.sfenc) — same design as NovaPOS's .novaenc:
//
//   [0-3]   magic   'SFMB' (4 bytes)
//   [4]     version 0x01   (1 byte)
//   [5-16]  nonce   (12 bytes — AES-GCM IV)
//   [17-32] authTag (16 bytes — GCM authentication tag)
//   [33…]   ciphertext (encrypted SQLite bytes)
//
// Key derivation: SHA-256(license_key + app salt) — so a backup can be
// restored on any machine activated with the SAME licence key. Before
// activation, a random key is generated once and persisted in app_state.
//
// decryptBackup() throws with a clear message on wrong key / corrupt file —
// the GCM auth tag guarantees we never write garbage over the live database.
// ─────────────────────────────────────────────────────────────────────────────
const { createHash, createCipheriv, createDecipheriv, randomBytes } = require('crypto')
const fs = require('fs')

const MAGIC_STR  = 'SFMB'
const VERSION_B  = 0x01
const NONCE_LEN  = 12
const TAG_LEN    = 16
const HEADER_LEN = 4 + 1 + NONCE_LEN + TAG_LEN // 33 bytes

const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'utf8').slice(0, 15)

/** Derive the 32-byte AES key for this installation (tied to the licence key). */
function deriveBackupKey(db) {
  const act = db.prepare('SELECT license_key FROM activation WHERE id=1').get()
  if (act?.license_key) {
    return createHash('sha256')
      .update(`${act.license_key}:schoolfees-encrypted-backup-v1`)
      .digest()
  }
  // Pre-activation fallback: generate once and persist in app_state
  let stored = db.prepare("SELECT value FROM app_state WHERE key='backup_enc_key'").get()?.value || ''
  if (!stored || stored.length < 64) {
    stored = randomBytes(32).toString('hex')
    const exists = db.prepare("SELECT key FROM app_state WHERE key='backup_enc_key'").get()
    if (exists) db.prepare("UPDATE app_state SET value=? WHERE key='backup_enc_key'").run([stored])
    else db.prepare("INSERT INTO app_state (key,value) VALUES ('backup_enc_key',?)").run([stored])
  }
  return Buffer.from(stored, 'hex')
}

/** Encrypt the live SQLite DB file → self-contained .sfenc blob. */
function encryptDb(dbPath, key) {
  const plaintext = fs.readFileSync(dbPath)
  const nonce     = randomBytes(NONCE_LEN)
  const cipher    = createCipheriv('aes-256-gcm', key, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag       = cipher.getAuthTag()
  return Buffer.concat([
    Buffer.from(MAGIC_STR),   // 4
    Buffer.from([VERSION_B]), // 1
    nonce,                    // 12
    tag,                      // 16
    encrypted,                // variable
  ])
}

/** Decrypt a .sfenc blob back to plain SQLite bytes. Throws on any problem. */
function decryptBackup(blob, key) {
  if (blob.length < HEADER_LEN + 100) {
    throw new Error('File is too small to be a valid SchoolFees encrypted backup.')
  }
  if (blob.slice(0, 4).toString() !== MAGIC_STR) {
    throw new Error('Not a SchoolFees encrypted backup (.sfenc) — wrong file format.')
  }
  const version = blob[4]
  if (version !== VERSION_B) {
    throw new Error(`Unsupported backup version (${version}). Update SchoolFees Manager and try again.`)
  }
  const nonce      = blob.slice(5, 5 + NONCE_LEN)
  const tag        = blob.slice(5 + NONCE_LEN, HEADER_LEN)
  const ciphertext = blob.slice(HEADER_LEN)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error(
      'Decryption failed — wrong encryption key or corrupted file.\n' +
      'Backups are tied to your licence key. To restore on a new machine,\n' +
      'activate it with the SAME licence key first.'
    )
  }
}

/** Validate that bytes are a real SQLite database before any disk write. */
function validateSqliteBytes(plaintext) {
  if (!plaintext || plaintext.length < 100) {
    throw new Error(`Invalid backup content — file is too small (${plaintext ? plaintext.length : 0} bytes).`)
  }
  if (!plaintext.slice(0, 15).equals(SQLITE_MAGIC)) {
    throw new Error(
      'Invalid backup — content is not a valid SQLite database.\n' +
      'Possible causes:\n' +
      '  • Wrong file selected\n' +
      '  • Backup created under a different licence key\n' +
      '  • File is corrupted'
    )
  }
  return true
}

module.exports = { deriveBackupKey, encryptDb, decryptBackup, validateSqliteBytes, MAGIC_STR, HEADER_LEN }
