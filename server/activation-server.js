#!/usr/bin/env node
/**
 * SchoolFees Manager — Standalone Activation Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency Node HTTP server. Deploy whenever online activation is
 * needed — the app already calls api.schoolfeesmanager.com/activate as a
 * fallback when a key isn't recognised offline.
 *
 * Run:
 *   SF_DEV_SECRET=yoursecret SF_ADMIN_TOKEN=youradmintoken node server/activation-server.js
 *   (PORT defaults to 8787)
 *
 * Endpoints:
 *   POST /activate
 *     Body: { license_key, school_name, machine_id }
 *     → { ok:true, tier, max_students, expires_at:null }  or  { ok:false, error }
 *     Validates machine-bound keys with the same HMAC the desktop app uses,
 *     and logs every activation to activations.log (JSON lines).
 *
 *   GET /generate?machine_id=...&tier=demo|standard|unlimited
 *     Header: x-admin-token: <SF_ADMIN_TOKEN>
 *     → { ok:true, key, tier, max_students }
 *     Lets you generate keys remotely (e.g. from your phone) without the CLI.
 *
 *   GET /health → { ok:true }
 * ─────────────────────────────────────────────────────────────────────────────
 */
const http = require('http')
const fs   = require('fs')
const path = require('path')
const { createHmac, timingSafeEqual } = require('crypto')

const PORT        = Number(process.env.PORT || 8787)
const DEV_SECRET  = process.env.SF_DEV_SECRET  || 'SF_MASTER_SECRET_2025_OJUOYE'
const ADMIN_TOKEN = process.env.SF_ADMIN_TOKEN || 'CHANGE-ME-ADMIN-TOKEN'
const LOG_FILE    = path.join(__dirname, 'activations.log')

const TIERS = {
  D: { tier: 'demo',      max_students: 5,     label: 'Demo' },
  S: { tier: 'standard',  max_students: 500,   label: 'Standard' },
  U: { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
}
const TIER_LETTER = { demo: 'D', standard: 'S', unlimited: 'U' }

function computeKey(machineId, tierLetter) {
  const h = createHmac('sha256', DEV_SECRET)
    .update(`${String(machineId).toLowerCase()}:${tierLetter}`)
    .digest('hex').toUpperCase().slice(0, 16)
  return `SFM${tierLetter}-${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`
}

function verifyKey(entered, machineId) {
  const key = String(entered || '').trim().toUpperCase().replace(/\s/g, '')
  const m = key.match(/^SFM([DSU])-/)
  if (!m) return null
  const expected = computeKey(machineId, m[1])
  if (key.length !== expected.length) return null
  try {
    if (timingSafeEqual(Buffer.from(key), Buffer.from(expected))) return TIERS[m[1]]
  } catch {}
  return null
}

function logLine(obj) {
  try { fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n') } catch {}
}

function json(res, code, body) {
  const data = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(data)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true })

  // ── Remote key generation (admin only) ──────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/generate') {
    if (req.headers['x-admin-token'] !== ADMIN_TOKEN)
      return json(res, 401, { ok: false, error: 'Unauthorized' })
    const machineId = url.searchParams.get('machine_id') || ''
    const tier      = (url.searchParams.get('tier') || 'unlimited').toLowerCase()
    const letter    = TIER_LETTER[tier]
    if (!/^[a-f0-9]{64}$/i.test(machineId)) return json(res, 400, { ok: false, error: 'Invalid machine_id' })
    if (!letter) return json(res, 400, { ok: false, error: 'Invalid tier' })
    const key = computeKey(machineId, letter)
    logLine({ event: 'generate', machineId, tier })
    return json(res, 200, { ok: true, key, tier, max_students: TIERS[letter].max_students })
  }

  // ── Activation validation (called by the desktop app) ───────────────────────
  if (req.method === 'POST' && url.pathname === '/activate') {
    let body = ''
    req.on('data', d => { body += d; if (body.length > 10_000) req.destroy() })
    req.on('end', () => {
      try {
        const { license_key, school_name, machine_id } = JSON.parse(body || '{}')
        if (!license_key || !machine_id)
          return json(res, 400, { ok: false, error: 'Missing license_key or machine_id' })

        const match = verifyKey(license_key, machine_id)
        if (!match) {
          logLine({ event: 'activate_failed', machine_id, school_name, key: String(license_key).slice(0, 24) })
          return json(res, 200, { ok: false, error: 'Invalid license key for this machine' })
        }
        logLine({ event: 'activated', machine_id, school_name, tier: match.tier })
        return json(res, 200, { ok: true, tier: match.tier, max_students: match.max_students, expires_at: null })
      } catch {
        return json(res, 400, { ok: false, error: 'Bad request' })
      }
    })
    return
  }

  json(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`SchoolFees activation server listening on :${PORT}`)
  if (ADMIN_TOKEN === 'CHANGE-ME-ADMIN-TOKEN') console.log('⚠️  Set SF_ADMIN_TOKEN before exposing /generate publicly')
})
