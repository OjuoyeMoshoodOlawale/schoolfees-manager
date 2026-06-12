// src/pages/BackupPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// ONE simple backup story:
//   • You choose ONE folder — point it at your Google Drive (desktop) folder.
//   • "Backup Now" writes an encrypted backup there. Google Drive uploads it.
//   • The automatic nightly backup writes to the SAME folder.
//   • Restore picks any .sfenc backup file and safely swaps the database.
// (A hidden internal safety copy is also kept next to the database — that's
//  automatic and never needs your attention.)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import {
  CloudUpload, FolderSearch, AlertCircle, ShieldCheck, FolderCheck,
  Clock, Download, Upload, RefreshCw, HardDrive, CheckCircle2,
} from 'lucide-react'
import { PageHeader, Confirm } from '../components/ui'

function fmtSize(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB'
  if (b > 1024)    return (b / 1024).toFixed(0) + ' KB'
  return b + ' B'
}

export default function BackupPage() {
  const [syncCfg, setSyncCfg]   = useState(null)   // { folder, enabled, lastSync }
  const [folderList, setFolderList] = useState(null)
  const [sched, setSched]       = useState(null)   // { enabled, time }
  const [busy, setBusy]         = useState(false)
  const [schedSaving, setSchedSaving] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const loadAll = useCallback(() => {
    window.api.getSyncFolder().then(setSyncCfg).catch(() => {})
    window.api.listFolderBackups().then(setFolderList).catch(() => {})
    window.api.schedulerGetConfig().then(setSched).catch(() => {})
  }, [])
  useEffect(() => { loadAll() }, [loadAll])

  // ── Choose the ONE backup folder ──────────────────────────────────────────
  const handlePickFolder = async () => {
    const r = await window.api.pickSyncFolder()
    if (r?.folder) {
      await window.api.setSyncFolder({ folder: r.folder, enabled: true })
      toast.success('Backup folder set!')
      loadAll()
    }
  }

  // ── Backup Now → the one folder ───────────────────────────────────────────
  const handleBackupNow = async () => {
    if (!syncCfg?.folder) { toast.error('Choose your backup folder first'); return }
    setBusy(true)
    try {
      const r = await window.api.backupNow()
      if (r.ok && r.syncCopied) toast.success('Encrypted backup saved to your backup folder!')
      else if (r.ok && r.syncError) toast.warn(`Backup made, but the folder copy failed: ${r.syncError}`)
      else if (r.ok) toast.success('Encrypted backup saved!')
      else toast.error(r.error || 'Backup failed')
      loadAll()
    } catch (e) { toast.error(e.message || 'Backup failed') }
    finally { setBusy(false) }
  }

  // ── Save an extra copy anywhere (USB stick etc.) ──────────────────────────
  const handleSaveCopy = async () => {
    setBusy(true)
    try {
      const r = await window.api.backupLocal()
      if (r.ok) toast.success('Backup copy saved!')
      else if (r.error) toast.error(r.error)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = async () => {
    setBusy(true)
    try {
      const r = await window.api.restoreLocal()
      if (r.ok && r.restarting) toast.success('Restore verified — app is restarting…')
      else if (r.cancelled) toast.info('Restore cancelled')
      else if (r.error) toast.error(r.error)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false); setConfirmRestore(false) }
  }

  // ── Auto-backup schedule ──────────────────────────────────────────────────
  const handleSaveSchedule = async (next) => {
    setSchedSaving(true)
    try {
      const cfg = { ...sched, ...next }
      setSched(cfg)
      const r = await window.api.schedulerSaveConfig(cfg)
      if (r?.ok !== false) toast.success('Automatic backup updated')
    } catch (e) { toast.error(e.message) }
    finally { setSchedSaving(false) }
  }

  const folderOk = !!syncCfg?.folder

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Backup & Restore"
        subtitle="One folder. Point it at your Google Drive folder and every backup lands there."
      />

      {/* STEP 1 — the one folder */}
      <div className={`card mb-4 border ${folderOk ? 'border-emerald-200' : 'border-amber-300'}`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${folderOk ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
            {folderOk ? <FolderCheck size={19}/> : <FolderSearch size={19}/>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-800">Your backup folder</h2>
            {folderOk ? (
              <>
                <p className="text-xs text-gray-500 mt-0.5 font-mono truncate" title={syncCfg.folder}>{syncCfg.folder}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Every backup — manual and automatic — is saved here as an encrypted <span className="font-mono">.sfenc</span> file.
                  If this is inside your Google Drive folder, Drive uploads it to the cloud automatically.
                  {syncCfg.lastSync && <> Last backup: <span className="font-medium text-gray-500">{new Date(syncCfg.lastSync).toLocaleString('en-NG')}</span></>}
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-700 mt-0.5">
                No folder chosen yet. Pick a folder <span className="font-semibold">inside your Google Drive</span> (e.g.
                <span className="font-mono"> G:\My Drive\SchoolFees Backups</span>) so every backup is automatically uploaded to the cloud.
              </p>
            )}
          </div>
          <button className="btn btn-sm btn-secondary flex-shrink-0" onClick={handlePickFolder}>
            <FolderSearch size={13}/> {folderOk ? 'Change' : 'Choose Folder'}
          </button>
        </div>
      </div>

      {/* STEP 2 — actions */}
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <button className="card hover:shadow-md transition text-left disabled:opacity-50" disabled={busy || !folderOk} onClick={handleBackupNow}>
          <CloudUpload size={20} className="text-blue-500 mb-2"/>
          <p className="font-semibold text-sm text-gray-800">Backup Now</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Encrypt and save to your backup folder.</p>
        </button>
        <button className="card hover:shadow-md transition text-left disabled:opacity-50" disabled={busy} onClick={handleSaveCopy}>
          <Download size={20} className="text-gray-500 mb-2"/>
          <p className="font-semibold text-sm text-gray-800">Save a Copy…</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Extra copy to a USB stick or any folder.</p>
        </button>
        <button className="card hover:shadow-md transition text-left disabled:opacity-50" disabled={busy} onClick={() => setConfirmRestore(true)}>
          <Upload size={20} className="text-amber-500 mb-2"/>
          <p className="font-semibold text-sm text-gray-800">Restore…</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Bring back the database from a backup file.</p>
        </button>
      </div>

      {/* STEP 3 — automatic nightly backup */}
      <div className="card mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
            <Clock size={18}/>
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 text-sm">Automatic backup</h2>
            <p className="text-[11px] text-gray-400">Backs up to the same folder every day — no clicks needed.</p>
          </div>
          <input
            type="time"
            className="form-input w-28 text-sm"
            value={sched?.time || '23:00'}
            disabled={schedSaving || !sched?.enabled}
            onChange={e => handleSaveSchedule({ time: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" className="w-4 h-4 accent-violet-600"
              checked={!!sched?.enabled}
              disabled={schedSaving}
              onChange={e => handleSaveSchedule({ enabled: e.target.checked })}
            />
            <span className="text-xs font-medium text-gray-600">{sched?.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/* Recent backups in the folder */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <HardDrive size={15} className="text-gray-400"/> Backups in your folder
          </h2>
          <button className="text-[11px] text-blue-500 hover:underline flex items-center gap-1" onClick={loadAll}>
            <RefreshCw size={11}/> Refresh
          </button>
        </div>
        {!folderOk && <p className="text-xs text-gray-300 py-3">Choose a backup folder to see your backups.</p>}
        {folderOk && folderList?.missing && (
          <p className="text-xs text-amber-600 py-2 flex items-center gap-1.5">
            <AlertCircle size={13}/> Folder not found — is your Google Drive running and signed in?
          </p>
        )}
        {folderOk && folderList?.files?.length === 0 && !folderList.missing && (
          <p className="text-xs text-gray-300 py-3">No backups yet — click Backup Now to create the first one.</p>
        )}
        {folderList?.files?.map(f => (
          <div key={f.name} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
            <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0"/>
            <span className="flex-1 text-xs font-mono text-gray-600 truncate">{f.name}</span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtSize(f.size)}</span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(f.mtime).toLocaleString('en-NG')}</span>
          </div>
        ))}
        <p className="text-[10.5px] text-gray-300 mt-3 flex items-center gap-1">
          <CheckCircle2 size={11}/> Backups are AES-256 encrypted and tied to your licence — they can't be opened on another machine.
          The app also keeps internal safety copies automatically.
        </p>
      </div>

      <Confirm
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={handleRestore}
        danger
        title="Restore Database"
        message="Restoring replaces ALL current data with the backup's contents. A safety copy of the current database is kept automatically. Continue?"
      />
    </div>
  )
}
