import { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import {
  CloudUpload, HardDrive, FolderOpen, AlertCircle,
  CheckCircle2, RefreshCw, Database, FolderSearch
} from 'lucide-react'
import { PageHeader, Confirm, Spinner } from '../components/ui'

function Card({ icon: Icon, title, subtitle, color = 'blue', children }) {
  const border = color === 'blue' ? 'border-blue-200' : color === 'green' ? 'border-emerald-200' : 'border-purple-200'
  const iconBg = color === 'blue' ? 'bg-blue-50 text-blue-600' : color === 'green' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'
  return (
    <div className={`card border ${border}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} />
        </div>
        <div><h2 className="font-semibold text-gray-900">{title}</h2><p className="text-sm text-gray-500 mt-0.5">{subtitle}</p></div>
      </div>
      {children}
    </div>
  )
}

export default function BackupPage() {
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [busy, setBusy]                     = useState(false)
  const [dbPath, setDbPath]                 = useState('')
  const [lastBackup, setLastBackup]         = useState(null)

  useEffect(() => {
    window.api.getDbPath().then(p => setDbPath(p))
  }, [])

  const handleBackup = async () => {
    setBusy(true)
    try {
      const result = await window.api.backupLocal()
      if (result.ok) {
        setLastBackup(new Date().toLocaleString('en-NG'))
        toast.success(`✅ Backup saved to:\n${result.path}`)
      } else {
        toast.info('Backup cancelled')
      }
    } catch { toast.error('Backup failed') }
    finally { setBusy(false) }
  }

  const handleRestore = async () => {
    setBusy(true)
    try {
      const result = await window.api.restoreLocal()
      if (result.ok) {
        toast.success('Database restored! Reloading app…')
        setTimeout(() => window.api.reloadApp(), 1500)
      } else {
        toast.info('Restore cancelled')
      }
    } catch (e) {
      toast.error(e.message || 'Restore failed')
    } finally { setBusy(false); setConfirmRestore(false) }
  }

  const openDbFolder = () => {
    if (dbPath) {
      const folder = dbPath.replace(/[/\\][^/\\]+$/, '')
      window.api.openPath(folder)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Backup & Restore"
        subtitle="Switch between school databases, backup your data, and restore from any .db file."
      />

      {/* Warning */}
      <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2.5 text-sm text-amber-800">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <span>
          Restoring replaces <strong>all current data</strong> with the selected file.
          A safety copy is automatically saved before every restore.
        </span>
      </div>

      <div className="space-y-4">

        {/* Switch Database — the main workflow */}
        <Card icon={Database} title="Switch / Load Database"
          subtitle="Load a different school's database or the demo database. Use this to switch between clients."
          color="purple">
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 space-y-1">
              <p className="font-semibold">How to load a database:</p>
              <p>1. Copy the <code className="bg-purple-200 px-1 rounded">.db</code> file anywhere on your PC</p>
              <p>2. Click <strong>"Load Database File"</strong> below and select it</p>
              <p>3. App reloads automatically with the new data</p>
              <p className="text-purple-600 mt-1">💡 Demo database: copy <code className="bg-purple-200 px-1 rounded">demo/demo.db</code> and load it</p>
            </div>
            <button
              className="btn w-full justify-center py-2.5 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium text-sm flex items-center gap-2"
              onClick={() => setConfirmRestore(true)}
              disabled={busy}
            >
              <FolderSearch size={16} />
              {busy ? 'Loading…' : 'Load Database File (.db)'}
            </button>
          </div>
        </Card>

        {/* Local backup */}
        <Card icon={HardDrive} title="Backup Current Database"
          subtitle="Save the current database to USB, hard disk or any folder."
          color="blue">
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              <span>Works offline · Single file · Fast</span>
              {lastBackup && <span className="ml-auto text-xs text-gray-400">Last: {lastBackup}</span>}
            </div>
            <div className="flex gap-3">
              <button className="btn-primary btn flex-1 justify-center" onClick={handleBackup} disabled={busy}>
                <HardDrive size={15} /> {busy ? 'Saving…' : 'Backup Now'}
              </button>
            </div>
          </div>
        </Card>

        {/* Google Drive — coming soon */}
        <Card icon={CloudUpload} title="Google Drive Backup"
          subtitle="Automatic cloud backup — like WhatsApp. Coming in next update."
          color="green">
          <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-400">
            <CloudUpload size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-500">Coming Soon</p>
            <p className="text-xs mt-1">Automatic versioned backup to Google Drive</p>
          </div>
        </Card>

        {/* Current DB path info */}
        <div className="card bg-gray-50 border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" /> Current Database
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="text-gray-400 flex-shrink-0">Location:</span>
              <button onClick={openDbFolder}
                className="font-mono text-xs text-blue-600 hover:underline break-all text-left">
                {dbPath || 'Loading…'}
              </button>
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-1 text-xs text-gray-500">
              <p>• To manually replace the DB: copy your <code className="bg-gray-200 px-1 rounded">.db</code> file to the folder above, rename it <code className="bg-gray-200 px-1 rounded">schoolfees.db</code>, then restart the app.</p>
              <p>• Or use <strong>Load Database File</strong> above — it handles everything automatically.</p>
              <p>• A safety copy (<code className="bg-gray-200 px-1 rounded">schoolfees_before_restore_[timestamp].db</code>) is always saved before any restore.</p>
            </div>
          </div>
        </div>

      </div>

      <Confirm
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={handleRestore}
        danger
        title="Load Database File"
        message="This will replace all current data with the selected .db file. A safety copy of the current database will be saved first. The app will reload automatically. Continue?"
      />
    </div>
  )
}
