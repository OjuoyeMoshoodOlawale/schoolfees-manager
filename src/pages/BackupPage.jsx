import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import {
  CloudUpload, HardDrive, FolderSearch, AlertCircle,
  CheckCircle2, RefreshCw, Database, FolderSearch as FolderIcon,
  Cloud, CloudOff, Wifi, WifiOff, Clock, Trash2, Download,
  RotateCcw, Settings, ChevronDown, ChevronUp, Play, Link, Unlink
} from 'lucide-react'
import { PageHeader, Confirm, Spinner } from '../components/ui'

// ── Sub-card wrapper ──────────────────────────────────────────────────────────
function Card({ icon: Icon, title, subtitle, color = 'blue', children, badge }) {
  const border = { blue: 'border-blue-200', green: 'border-emerald-200', purple: 'border-purple-200', orange: 'border-orange-200' }[color]
  const iconBg = { blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600' }[color]
  return (
    <div className={`card border ${border}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            {badge}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Pill({ children, green, red, yellow }) {
  const cls = green ? 'bg-emerald-100 text-emerald-700' : red ? 'bg-red-100 text-red-700' : yellow ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{children}</span>
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BackupPage() {
  const [dbPath, setDbPath]             = useState('')
  const [busy, setBusy]                 = useState(false)
  const [lastLocalBackup, setLastLocal] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmGDriveRestore, setConfirmGDriveRestore] = useState(null)

  // GDrive state
  const [gdriveStatus, setGDriveStatus] = useState(null)
  const [gdriveFiles, setGDriveFiles]   = useState([])
  const [showCreds, setShowCreds]       = useState(false)
  const [creds, setCreds]               = useState({ client_id: '', client_secret: '' })
  const [gdriveLoading, setGDriveLoading] = useState(false)

  // Cloud folder sync state
  const [syncCfg, setSyncCfg]     = useState(null)
  const [syncing, setSyncing]     = useState(false)

  // Scheduler state
  const [schedCfg, setSchedCfg]   = useState(null)
  const [schedSaving, setSchedSaving] = useState(false)

  const loadAll = useCallback(async () => {
    window.api.getDbPath().then(p => setDbPath(p))
    window.api.gdriveStatus().then(s => setGDriveStatus(s))
    window.api.schedulerGetConfig().then(c => setSchedCfg(c))
    window.api.getSyncFolder().then(s => setSyncCfg(s))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const loadGDriveFiles = async () => {
    const res = await window.api.gdriveListBackups()
    if (res.ok) setGDriveFiles(res.files)
  }

  useEffect(() => {
    if (gdriveStatus?.connected) loadGDriveFiles()
  }, [gdriveStatus?.connected])

  // ── Local backup ─────────────────────────────────────────────────────────
  const handleLocalBackup = async () => {
    setBusy(true)
    try {
      const r = await window.api.backupLocal()
      if (r.ok) { setLastLocal(new Date().toLocaleString('en-NG')); toast.success(`Backup saved!`) }
      else toast.info('Backup cancelled')
    } catch { toast.error('Backup failed') }
    finally { setBusy(false) }
  }

  const handleLocalRestore = async () => {
    setBusy(true)
    try {
      const r = await window.api.restoreLocal()
      if (r.ok) { toast.success('Restored! Reloading…'); setTimeout(() => window.api.reloadApp(), 1500) }
      else if (r.error) toast.error(r.error)
      else toast.info('Cancelled')
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false); setConfirmRestore(false) }
  }

  // ── Google Drive ──────────────────────────────────────────────────────────
  const handleSaveCreds = async () => {
    if (!creds.client_id || !creds.client_secret) return toast.error('Both fields are required.')
    const r = await window.api.gdriveSaveCreds(creds)
    if (r.ok) { toast.success('Credentials saved!'); setShowCreds(false); loadAll() }
    else toast.error(r.error)
  }

  const handleConnect = async () => {
    setGDriveLoading(true)
    toast.info('Opening Google sign-in in your browser…', { autoClose: 5000 })
    try {
      const r = await window.api.gdriveConnect()
      if (r.ok) { toast.success(`Connected as ${r.email}!`); loadAll(); loadGDriveFiles() }
      else toast.error(r.error || 'Connection failed')
    } catch (e) { toast.error(e.message) }
    finally { setGDriveLoading(false) }
  }

  const handleDisconnect = async () => {
    await window.api.gdriveDisconnect()
    setGDriveStatus(s => ({ ...s, connected: false, email: null }))
    setGDriveFiles([])
    toast.success('Disconnected from Google Drive')
  }

  const handleGDriveBackup = async () => {
    setGDriveLoading(true)
    try {
      const r = await window.api.gdriveBackup()
      if (r.ok) { toast.success(`Uploaded: ${r.filename}`); loadAll(); loadGDriveFiles() }
      else toast.error(r.error)
    } catch (e) { toast.error(e.message) }
    finally { setGDriveLoading(false) }
  }

  const handleGDriveRestore = async () => {
    if (!confirmGDriveRestore) return
    setBusy(true)
    try {
      const r = await window.api.gdriveRestore({ fileId: confirmGDriveRestore.id })
      if (r.ok) { toast.success('Restored from Drive! Reloading…'); setTimeout(() => window.api.reloadApp(), 1500) }
      else toast.error(r.error)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false); setConfirmGDriveRestore(null) }
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────
  const handleSaveScheduler = async () => {
    setSchedSaving(true)
    try {
      const r = await window.api.schedulerSaveConfig(schedCfg)
      if (r.ok) toast.success('Scheduler settings saved!')
      else toast.error(r.error)
    } catch (e) { toast.error(e.message) }
    finally { setSchedSaving(false) }
  }

  const handleRunNow = async () => {
    const r = await window.api.schedulerRunNow()
    if (r.ok) toast.success(`Auto-backup saved: ${r.path}`)
    else toast.error(r.error)
  }

  const openDbFolder = () => {
    if (dbPath) window.api.openPath(dbPath.replace(/[/\\][^/\\]+$/, ''))
  }

  const fmtSize = bytes => {
    if (!bytes) return '—'
    const n = parseInt(bytes)
    if (n < 1024) return `${n} B`
    if (n < 1048576) return `${(n/1024).toFixed(1)} KB`
    return `${(n/1048576).toFixed(1)} MB`
  }
  const fmtDriveDate = iso => iso ? new Date(iso).toLocaleString('en-NG') : '—'

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Backup & Restore"
        subtitle="Local backup, Google Drive cloud backup, and auto-scheduler."
      />

      {/* Warning */}
      <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2.5 text-sm text-amber-800">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <span>Restoring replaces <strong>all current data</strong>. A safety copy is always saved first.</span>
      </div>

      <div className="space-y-4">

        {/* ── Local Backup ── */}
        <Card icon={HardDrive} title="Local Backup" subtitle="Save or restore the database from USB, hard disk, or any folder." color="blue">
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              <span>Works offline · Single file · Instant</span>
              {lastLocalBackup && <span className="ml-auto text-xs text-gray-400">Last: {lastLocalBackup}</span>}
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary flex-1 justify-center" onClick={handleLocalBackup} disabled={busy}>
                <HardDrive size={15} /> Backup Now
              </button>
              <button className="btn btn-secondary flex-1 justify-center" onClick={() => setConfirmRestore(true)} disabled={busy}>
                <FolderSearch size={15} /> Load .db File
              </button>
            </div>
          </div>
        </Card>

        {/* ── Cloud Folder Sync ── */}
        <Card icon={Cloud} title="Cloud Folder Sync" subtitle="Sync to any local Google Drive or OneDrive folder — zero setup required." color="green"
          badge={syncCfg?.enabled && syncCfg?.folder ? <Pill green><Wifi size={10} className="inline mr-1" />Active</Pill> : <Pill yellow>Not set</Pill>}
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              If Google Drive or OneDrive desktop app is installed, it syncs a local folder automatically.
              Just point SchoolFees Manager at that folder — no Google account setup needed.
            </p>
            <div className="flex gap-2">
              <input
                className="form-input text-xs flex-1 font-mono"
                readOnly
                value={syncCfg?.folder || ''}
                placeholder="No folder selected"
              />
              <button className="btn btn-secondary btn-sm whitespace-nowrap" onClick={async () => {
                const folder = await window.api.pickSyncFolder()
                if (folder) {
                  await window.api.setSyncFolder({ folder })
                  setSyncCfg({ folder, enabled: true })
                  toast.success('Sync folder saved!')
                }
              }}>
                Browse…
              </button>
            </div>
            {syncCfg?.folder && (
              <div className="space-y-2">
                {syncCfg.lastSync && (
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> Last sync: {fmtDriveDate(syncCfg.lastSync)}</p>
                )}
                <button
                  className="btn w-full justify-center py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium text-sm flex items-center gap-2"
                  onClick={async () => {
                    setSyncing(true)
                    try {
                      const r = await window.api.syncNow()
                      if (r.ok) { toast.success('Synced to cloud folder!'); loadAll() }
                      else toast.error(r.error)
                    } catch(e) { toast.error(e.message) }
                    finally { setSyncing(false) }
                  }}
                  disabled={syncing}
                >
                  <CloudUpload size={14} /> {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Google Drive Backup (OAuth — Advanced) ── */}
        <Card
          icon={CloudUpload}
          title="Google Drive Backup (Advanced)"
          subtitle="Automatic versioned cloud backup — accessible from anywhere."
          color="green"
          badge={gdriveStatus?.connected
            ? <Pill green><Wifi size={10} className="inline mr-1" />Connected</Pill>
            : <Pill red><WifiOff size={10} className="inline mr-1" />Not connected</Pill>}
        >
          {!gdriveStatus?.configured && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Setup required — one-time only:</p>
              <p>1. Go to <a href="#" onClick={e => { e.preventDefault(); window.api.openPath && shell.openExternal('https://console.cloud.google.com') }} className="underline">Google Cloud Console</a>, create a project</p>
              <p>2. Enable the <strong>Google Drive API</strong></p>
              <p>3. Create OAuth 2.0 credentials (Desktop App type)</p>
              <p>4. Copy the Client ID and Client Secret below</p>
            </div>
          )}

          {/* Credentials toggle */}
          <button
            className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 mb-3"
            onClick={() => setShowCreds(v => !v)}
          >
            <span className="flex items-center gap-1.5"><Settings size={13} /> OAuth Credentials</span>
            {showCreds ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showCreds && (
            <div className="mb-3 space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <label className="form-label text-xs">Client ID</label>
                <input className="form-input text-xs font-mono" placeholder="12345-xxx.apps.googleusercontent.com"
                  value={creds.client_id} onChange={e => setCreds(c => ({ ...c, client_id: e.target.value }))} />
              </div>
              <div>
                <label className="form-label text-xs">Client Secret</label>
                <input className="form-input text-xs font-mono" type="password" placeholder="GOCSPX-..."
                  value={creds.client_secret} onChange={e => setCreds(c => ({ ...c, client_secret: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-sm w-full justify-center" onClick={handleSaveCreds}>
                Save Credentials
              </button>
            </div>
          )}

          {gdriveStatus?.configured && !gdriveStatus?.connected && (
            <button
              className="btn w-full justify-center py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium text-sm flex items-center gap-2 mb-3"
              onClick={handleConnect} disabled={gdriveLoading}
            >
              <Link size={15} /> {gdriveLoading ? 'Connecting…' : 'Connect Google Account'}
            </button>
          )}

          {gdriveStatus?.connected && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-emerald-800 font-medium">{gdriveStatus.email}</span>
                <button className="ml-auto text-xs text-red-500 hover:text-red-700 flex items-center gap-1" onClick={handleDisconnect}>
                  <Unlink size={11} /> Disconnect
                </button>
              </div>

              {gdriveStatus.lastBackup && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock size={11} /> Last backup: {fmtDriveDate(gdriveStatus.lastBackup)}
                </div>
              )}

              <button
                className="btn w-full justify-center py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium text-sm flex items-center gap-2"
                onClick={handleGDriveBackup} disabled={gdriveLoading}
              >
                <CloudUpload size={15} /> {gdriveLoading ? 'Uploading…' : 'Backup to Drive Now'}
              </button>

              {/* Drive backup history */}
              {gdriveFiles.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Cloud Backups (last 10)</p>
                  <div className="space-y-1">
                    {gdriveFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-700 hover:bg-gray-100">
                        <Cloud size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="flex-1 font-mono truncate">{f.name}</span>
                        <span className="text-gray-400">{fmtSize(f.size)}</span>
                        <span className="text-gray-400">{new Date(f.createdTime).toLocaleDateString('en-NG')}</span>
                        <button
                          className="btn btn-sm btn-secondary text-xs px-2 py-1"
                          onClick={() => setConfirmGDriveRestore(f)}
                          title="Restore this backup"
                        >
                          <RotateCcw size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Auto-backup Scheduler ── */}
        <Card icon={Clock} title="Auto-Backup Scheduler" subtitle="Automatic nightly backup — runs silently in the background." color="orange"
          badge={schedCfg?.enabled ? <Pill green>On</Pill> : <Pill yellow>Off</Pill>}
        >
          {schedCfg && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Enable nightly auto-backup</span>
                <button
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${schedCfg.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  onClick={() => setSchedCfg(c => ({ ...c, enabled: !c.enabled }))}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${schedCfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="form-label text-xs">Backup time</label>
                  <input type="time" className="form-input text-sm"
                    value={schedCfg.time || '23:00'}
                    onChange={e => setSchedCfg(c => ({ ...c, time: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="form-label text-xs">Keep last N local copies</label>
                  <input type="number" min={1} max={30} className="form-input text-sm"
                    value={schedCfg.keepLocal || 7}
                    onChange={e => setSchedCfg(c => ({ ...c, keepLocal: parseInt(e.target.value) || 7 }))} />
                </div>
              </div>

              {gdriveStatus?.connected && (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-sm text-emerald-800">Also backup to Google Drive nightly</span>
                  <button
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${schedCfg.gdriveEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
                    onClick={() => setSchedCfg(c => ({ ...c, gdriveEnabled: !c.gdriveEnabled }))}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${schedCfg.gdriveEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button className="btn btn-primary flex-1 justify-center" onClick={handleSaveScheduler} disabled={schedSaving}>
                  <CheckCircle2 size={14} /> {schedSaving ? 'Saving…' : 'Save Settings'}
                </button>
                <button className="btn btn-secondary justify-center gap-2" onClick={handleRunNow} title="Run local backup right now">
                  <Play size={13} /> Run Now
                </button>
              </div>

              <p className="text-xs text-gray-400">
                Auto-backups are saved to: <code className="bg-gray-100 px-1 rounded">database/auto_backups/</code>
              </p>
            </div>
          )}
        </Card>

        {/* ── Switch/Load DB ── */}
        <Card icon={Database} title="Switch / Load Database" subtitle="Load a different school's database or the demo database." color="purple">
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 space-y-1">
              <p className="font-semibold">How to load a database:</p>
              <p>1. Copy the <code className="bg-purple-200 px-1 rounded">.db</code> file anywhere on your PC</p>
              <p>2. Click <strong>"Load Database File"</strong> and select it — app reloads automatically</p>
              <p className="text-purple-600 mt-1">💡 Demo: copy <code className="bg-purple-200 px-1 rounded">demo/demo.db</code> and load it</p>
            </div>
            <button
              className="btn w-full justify-center py-2.5 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium text-sm flex items-center gap-2"
              onClick={() => setConfirmRestore(true)} disabled={busy}
            >
              <FolderIcon size={16} /> Load Database File (.db)
            </button>
          </div>
        </Card>

        {/* ── DB path info ── */}
        <div className="card bg-gray-50 border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Database size={14} className="text-gray-400" /> Current Database
          </h3>
          <button onClick={openDbFolder} className="font-mono text-xs text-blue-600 hover:underline break-all text-left">
            {dbPath || 'Loading…'}
          </button>
        </div>

      </div>

      {/* Confirm local restore */}
      <Confirm
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={handleLocalRestore}
        danger
        title="Load Database File"
        message="This will replace all current data with the selected .db file. A safety copy of the current database will be saved first. The app will reload automatically. Continue?"
      />

      {/* Confirm GDrive restore */}
      <Confirm
        open={!!confirmGDriveRestore}
        onClose={() => setConfirmGDriveRestore(null)}
        onConfirm={handleGDriveRestore}
        danger
        title="Restore from Google Drive"
        message={`This will restore "${confirmGDriveRestore?.name}" and replace all current data. A safety copy is saved first. Continue?`}
      />
    </div>
  )
}
