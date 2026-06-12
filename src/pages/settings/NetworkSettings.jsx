// src/pages/settings/NetworkSettings.jsx
// ─────────────────────────────────────────────────────────────────────────────
// LAN multi-user configuration.
//   Standalone — everything on this machine (default)
//   Server     — this machine holds the database and serves other stations
//   Client     — this machine connects to the server; no local database
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import {
  Monitor, Server, Laptop, Wifi, Copy, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Plug,
} from 'lucide-react'

const MODES = [
  { id: 'standalone', icon: Monitor, title: 'Standalone',
    desc: 'Everything on this computer. The default for a single-machine setup.' },
  { id: 'server', icon: Server, title: 'Server (host)',
    desc: 'This computer keeps the database and serves the other stations on your network.' },
  { id: 'client', icon: Laptop, title: 'Client (station)',
    desc: 'This computer connects to the server. All data lives on the server.' },
]

export default function NetworkSettings() {
  const [cfg, setCfg]       = useState(null)
  const [ips, setIps]       = useState([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [dirty, setDirty]   = useState(false)

  useEffect(() => {
    window.api.netGetConfig().then(setCfg).catch(() => {})
    window.api.netLanIps().then(setIps).catch(() => {})
  }, [])

  const update = (patch) => { setCfg(c => ({ ...c, ...patch })); setDirty(true); setTestResult(null) }

  const save = async () => {
    setSaving(true)
    try {
      const r = await window.api.netSaveConfig({
        mode: cfg.mode, port: Number(cfg.port) || 4790,
        token: cfg.token,
        serverHost: (cfg.serverHost || '').trim(),
        serverPort: Number(cfg.serverPort) || 4790,
        serverToken: (cfg.serverToken || '').trim(),
      })
      if (r.error) toast.error(`Saved, but the server could not start: ${r.error}`)
      else toast.success('Network settings saved')
      setCfg(c => ({ ...c, ...r }))
      setDirty(false)
      if (r.needsRestart) toast.info('Restart the app for the new mode to take full effect', { autoClose: 6000 })
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const testConnection = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await window.api.netTestConnection({
        host: (cfg.serverHost || '').trim(),
        port: Number(cfg.serverPort) || 4790,
        token: (cfg.serverToken || '').trim(),
      })
      setTestResult(r)
    } catch (e) { setTestResult({ ok: false, error: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`))
  }

  if (!cfg) return null

  return (
    <div className="space-y-4">
      {/* Mode selection */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">How is this computer used?</h3>
        <p className="text-xs text-gray-400 mb-3">
          For multiple stations (e.g. two bursar desks), set ONE computer as the Server and the others as Clients.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {MODES.map(m => (
            <button key={m.id}
              className={`text-left p-3.5 rounded-xl border-2 transition ${
                cfg.mode === m.id ? 'border-blue-500 bg-blue-50/60' : 'border-gray-150 border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => update({ mode: m.id })}>
              <m.icon size={18} className={cfg.mode === m.id ? 'text-blue-600' : 'text-gray-400'} />
              <p className={`font-semibold text-sm mt-1.5 ${cfg.mode === m.id ? 'text-blue-700' : 'text-gray-700'}`}>{m.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SERVER settings */}
      {cfg.mode === 'server' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Server size={15} className="text-blue-500" /> Server settings
            </h3>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
              cfg.running ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
              <Wifi size={11} /> {cfg.running ? 'Serving clients' : 'Not running (save / restart)'}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Port</label>
              <input type="number" className="form-input w-32" value={cfg.port || 4790}
                onChange={e => update({ port: e.target.value })} />
              <p className="text-[11px] text-gray-400 mt-1">Allow this port through Windows Firewall on this machine.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Join token (give this to each client)</label>
              <div className="flex gap-1.5">
                <input className="form-input flex-1 font-mono text-sm" value={cfg.token || ''} readOnly
                  placeholder="Generated when you save" />
                {cfg.token && (
                  <button className="btn btn-sm btn-secondary" title="Copy token" onClick={() => copy(cfg.token, 'Token')}>
                    <Copy size={13} />
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" title="Generate a new token (clients must re-enter it)"
                  onClick={() => update({ token: Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('') })}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">This computer's address — clients connect to one of these:</label>
            <div className="flex flex-wrap gap-2">
              {ips.map(ip => (
                <button key={ip.address}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                  title={`Network: ${ip.iface} — click to copy`}
                  onClick={() => copy(ip.address, 'Address')}>
                  {ip.address} <Copy size={11} className="text-slate-400" />
                </button>
              ))}
              {!ips.length && <span className="text-xs text-gray-400">No network detected — connect to the school network.</span>}
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>Keep this computer on while stations are working. Backups, restores, and settings changes should be done here on the server.</span>
          </div>
        </div>
      )}

      {/* CLIENT settings */}
      {cfg.mode === 'client' && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Laptop size={15} className="text-blue-500" /> Connect to the server
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 block mb-1">Server address (IP)</label>
              <input className="form-input font-mono" placeholder="e.g. 192.168.1.100"
                value={cfg.serverHost || ''} onChange={e => update({ serverHost: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Port</label>
              <input type="number" className="form-input" value={cfg.serverPort || 4790}
                onChange={e => update({ serverPort: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Join token (from the server screen)</label>
            <input className="form-input font-mono" placeholder="Paste the token shown on the server"
              value={cfg.serverToken || ''} onChange={e => update({ serverToken: e.target.value })} />
          </div>

          <div className="flex items-center gap-3">
            <button className="btn btn-sm btn-secondary" disabled={testing || !cfg.serverHost} onClick={testConnection}>
              <Plug size={13} /> {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && (
              <span className={`text-xs font-medium flex items-center gap-1 ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {testResult.ok ? <><CheckCircle2 size={13} /> Connected — server and token are working</> : <><XCircle size={13} /> {testResult.error}</>}
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 text-[11.5px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
            <Wifi size={13} className="flex-shrink-0 mt-0.5" />
            <span>In client mode this station has no local database — every screen reads and writes the server's data live. Printing still happens on this machine.</span>
          </div>
        </div>
      )}

      {dirty && (
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Network Settings'}
          </button>
        </div>
      )}
    </div>
  )
}
