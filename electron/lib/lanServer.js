// electron/lib/lanServer.js
// ─────────────────────────────────────────────────────────────────────────────
// LAN bridge for multi-user mode.
// The SERVER machine runs this tiny HTTP server inside the Electron main
// process. Client machines send their window.api calls here as
//   POST /ipc   { channel, data }   with header  x-sf-token: <join token>
// and the call is executed against THIS machine's handlers + database —
// so every cashier station works on the one shared database.
//
// Security:
//   • every request must carry the join token (timing-safe compared)
//   • only channels that were registered through ipcMain are callable
//   • a small denylist blocks machine-local/dangerous channels
//   • binds on the LAN; intended for trusted school networks only
// ─────────────────────────────────────────────────────────────────────────────
const http   = require('http')
const crypto = require('crypto')

// Channels that must never be executed remotely on the server
const DENY = new Set([
  'app:print-html',            // printing must happen on the caller's machine
  'backup:restore-local',      // restoring/relaunching the server remotely = chaos
  'backup:reload-app',
  'net:save-config',           // network reconfig only at the server keyboard
  'net:get-config',
  'net:test-connection',
  'net:lan-ips',
])

let serverInstance = null

function tsEqual(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''))
  if (ba.length !== bb.length || !ba.length) return false
  try { return crypto.timingSafeEqual(ba, bb) } catch { return false }
}

/**
 * Start the LAN bridge.
 * @param {Map<string,Function>} registry  channel → handler(event, data)
 * @param {{port:number, token:string}} cfg
 */
function startLanServer(registry, cfg) {
  stopLanServer()
  const srv = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')

    // Lightweight unauthenticated health check used by "Test connection"
    if (req.method === 'GET' && req.url === '/ping') {
      res.end(JSON.stringify({ ok: true, app: 'schoolfees-manager' }))
      return
    }

    if (req.method !== 'POST' || req.url !== '/ipc') {
      res.statusCode = 404
      res.end(JSON.stringify({ __error: 'Not found' }))
      return
    }
    if (!tsEqual(req.headers['x-sf-token'], cfg.token)) {
      res.statusCode = 401
      res.end(JSON.stringify({ __error: 'Invalid or missing join token' }))
      return
    }

    let body = ''
    req.on('data', c => { body += c; if (body.length > 8_000_000) req.destroy() })
    req.on('end', async () => {
      try {
        const { channel, data } = JSON.parse(body || '{}')
        if (!channel || DENY.has(channel) || !registry.has(channel)) {
          res.statusCode = 400
          res.end(JSON.stringify({ __error: `Channel not available remotely: ${channel}` }))
          return
        }
        const result = await registry.get(channel)(null, data)
        res.end(JSON.stringify({ result: result === undefined ? null : result }))
      } catch (e) {
        res.statusCode = 200 // transport ok; carry the app error through
        res.end(JSON.stringify({ __error: e.message || 'Handler failed' }))
      }
    })
  })

  srv.on('error', (e) => console.error('[LAN] server error:', e.message))
  srv.listen(cfg.port, '0.0.0.0', () =>
    console.log(`[LAN] SchoolFees server listening on port ${cfg.port}`))
  serverInstance = srv
  return srv
}

function stopLanServer() {
  if (serverInstance) { try { serverInstance.close() } catch {} ; serverInstance = null }
}

function lanServerRunning() { return !!serverInstance }

module.exports = { startLanServer, stopLanServer, lanServerRunning }
