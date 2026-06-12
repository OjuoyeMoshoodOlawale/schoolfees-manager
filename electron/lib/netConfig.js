// electron/lib/netConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Network mode configuration for LAN multi-user.
//   standalone — this machine keeps everything local (default)
//   server     — this machine hosts the database and serves clients over LAN
//   client     — this machine connects to a server; it has NO local database
// Stored as JSON in userData (NOT the database — a client has no database).
// ─────────────────────────────────────────────────────────────────────────────
const { app } = require('electron')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const crypto = require('crypto')

const FILE = () => path.join(app.getPath('userData'), 'network.json')

const DEFAULTS = {
  mode: 'standalone',          // 'standalone' | 'server' | 'client'
  port: 4790,                  // server listen port
  token: '',                   // server shared secret (generated on first server use)
  serverHost: '',              // client: server IP/hostname
  serverPort: 4790,            // client: server port
  serverToken: '',             // client: token from the server screen
}

function loadNetConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8'))
    return { ...DEFAULTS, ...raw }
  } catch { return { ...DEFAULTS } }
}

function saveNetConfig(cfg) {
  const merged = { ...loadNetConfig(), ...cfg }
  // First time entering server mode → generate a strong join token
  if (merged.mode === 'server' && !merged.token) {
    merged.token = crypto.randomBytes(12).toString('hex')
  }
  fs.writeFileSync(FILE(), JSON.stringify(merged, null, 2))
  return merged
}

/** All non-internal IPv4 addresses of this machine, for the server screen. */
function lanIps() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) out.push({ iface: name, address: i.address })
    }
  }
  return out
}

module.exports = { loadNetConfig, saveNetConfig, lanIps }
