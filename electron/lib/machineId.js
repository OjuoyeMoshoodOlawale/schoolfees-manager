// electron/lib/machineId.js
// ─────────────────────────────────────────────────────────────────────────────
// Stable, anonymous machine identifier + machine-bound activation keys.
// Same pattern as NovaPOS:
//   • Machine ID = SHA-256 of hardware info, persisted to .machine_id so it
//     never changes even if hardware info reads differently later.
//   • Activation key = HMAC-SHA256(SECRET, machineId:tier), so a key only
//     works on the machine it was generated for.
//
// Key format:  SFM{T}-XXXX-XXXX-XXXX-XXXX
//   T = D (Demo, 5 students) | S (Standard, 500) | U (Unlimited)
//   e.g. SFMU-4CB8-65FB-0C28-3CD8
//
// The developer generates keys with:  node scripts/gen-activation-key.js
// or via the standalone server in   server/activation-server.js
// ─────────────────────────────────────────────────────────────────────────────
const { createHash, createHmac, timingSafeEqual } = require('crypto')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

// Must match scripts/gen-activation-key.js and server/activation-server.js.
// Override at runtime with SF_DEV_SECRET when building a customer release.
const DEV_SECRET = process.env.SF_DEV_SECRET || 'SF_MASTER_SECRET_2025_OJUOYE'

const TIERS = {
  D: { tier: 'demo',      max_students: 5,     label: 'Demo' },
  S: { tier: 'standard',  max_students: 500,   label: 'Standard' },
  U: { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
}

let _machineId = null

// userData path with env-var fallbacks (never trust app.getPath blindly)
function safeUserDataPath() {
  try {
    const { app } = require('electron')
    const p = app && app.getPath ? app.getPath('userData') : null
    if (p) return p
  } catch { /* not in electron context (CLI/server) */ }
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'schoolfees')
  if (process.env.HOME)    return path.join(process.env.HOME, '.schoolfees')
  return path.join(path.dirname(process.execPath), 'schoolfees-data')
}

/** Stable SHA-256 machine ID — computed once, persisted to .machine_id */
function getMachineId() {
  if (_machineId) return _machineId
  const dir = safeUserDataPath()
  const idFile = path.join(dir, '.machine_id')
  try {
    if (fs.existsSync(idFile)) {
      const saved = fs.readFileSync(idFile, 'utf8').trim()
      if (/^[a-f0-9]{64}$/.test(saved)) { _machineId = saved; return _machineId }
    }
  } catch { /* fall through to compute */ }

  const cpus     = os.cpus()
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown'
  const raw = `${cpuModel}|${os.hostname()}|${os.platform()}|${os.arch()}|${os.totalmem()}`
  _machineId = createHash('sha256').update(raw).digest('hex')

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(idFile, _machineId, 'utf8')
  } catch { /* non-fatal: ID is still deterministic from hardware */ }
  return _machineId
}

/** Compute the expected key for a machine + tier letter (D/S/U) */
function computeExpectedKey(machineId, tierLetter) {
  const h = createHmac('sha256', DEV_SECRET)
    .update(`${machineId}:${tierLetter}`)
    .digest('hex').toUpperCase().slice(0, 16)
  return `SFM${tierLetter}-${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`
}

/**
 * Verify an entered key against THIS machine.
 * Returns { tier, max_students, label } if valid, otherwise null.
 * Constant-time comparison to prevent timing attacks.
 */
function verifyActivationKey(entered) {
  const key = String(entered || '').trim().toUpperCase().replace(/\s/g, '')
  const m = key.match(/^SFM([DSU])-/)
  if (!m) return null
  const tierLetter = m[1]
  const expected = computeExpectedKey(getMachineId(), tierLetter)
  if (key.length !== expected.length) return null
  try {
    if (timingSafeEqual(Buffer.from(key), Buffer.from(expected))) return TIERS[tierLetter]
  } catch { /* length mismatch already handled, but be safe */ }
  return null
}

module.exports = { getMachineId, computeExpectedKey, verifyActivationKey, TIERS, DEV_SECRET }
