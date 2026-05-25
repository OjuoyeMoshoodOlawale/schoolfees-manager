import { useState } from 'react'
import { toast } from 'react-toastify'
import { CloudUpload, HardDrive, FolderOpen, AlertCircle, CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react'
import { PageHeader, Confirm } from '../components/ui'

function BackupCard({ icon: Icon, title, subtitle, color = 'blue', children }) {
  const c = { blue: 'bg-blue-50 border-blue-200 text-blue-600', green: 'bg-emerald-50 border-emerald-200 text-emerald-600' }[color] || ''
  return (
    <div className={`card border ${color === 'blue' ? 'border-blue-200' : 'border-emerald-200'}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-10 h-10 rounded-lg ${c.split(' ')[0]} flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} className={c.split(' ')[2]} />
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
  const [lastBackup, setLastBackup]         = useState(null)

  const handleLocalBackup = async () => {
    setBusy(true)
    try {
      const result = await window.api.backupLocal()
      if (result.ok) {
        setLastBackup(new Date().toLocaleString())
        toast.success(`Backup saved to ${result.path}`)
      } else toast.info('Backup cancelled')
    } catch { toast.error('Backup failed') }
    finally { setBusy(false) }
  }

  const handleLocalRestore = async () => {
    setBusy(true)
    try {
      const result = await window.api.restoreLocal()
      if (result.ok) {
        toast.success('Database restored. Reloading app…')
        // Wait 1.5s then reload — this is critical, triggers full window reload
        setTimeout(async () => {
          await window.api.reloadApp()
        }, 1500)
      } else toast.info('Restore cancelled')
    } catch { toast.error('Restore failed') }
    finally { setBusy(false); setConfirmRestore(false) }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Backup & Restore" subtitle="Keep your data safe. Back up regularly." />

      <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2.5 text-sm text-amber-800">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
        Always back up before restoring. A safety copy is saved automatically before any restore.
      </div>

      <div className="space-y-4">
        <BackupCard icon={HardDrive} title="Local Backup" subtitle="Save database to USB, hard disk, or any folder." color="blue">
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              Works offline · Entire database in one file · Fast
              {lastBackup && <span className="ml-auto text-xs text-gray-400">Last: {lastBackup}</span>}
            </div>
            <div className="flex gap-3">
              <button className="btn-primary btn" onClick={handleLocalBackup} disabled={busy}>
                <HardDrive size={15} /> {busy ? 'Saving…' : 'Backup Now'}
              </button>
              <button className="btn-secondary btn" onClick={() => setConfirmRestore(true)} disabled={busy}>
                <FolderOpen size={15} /> Restore from File
              </button>
            </div>
          </div>
        </BackupCard>

        <BackupCard icon={CloudUpload} title="Google Drive Backup" subtitle="Back up to Google Drive. Access from any computer." color="green">
          <div className="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-500">
            <CloudUpload size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-600">Coming in next update</p>
            <p className="text-xs text-gray-400 mt-1">Automatic versioned backup to Google Drive, like WhatsApp.</p>
          </div>
        </BackupCard>

        <div className="card bg-gray-50 border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" /> How Backup Works
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• Your entire database is one file: <code className="bg-gray-200 px-1 rounded text-xs font-mono">schoolfees.db</code></p>
            <p>• Backup copies that file to your chosen location.</p>
            <p>• To restore on a new PC: install the app, then use Restore from File.</p>
            <p>• Before every restore, a safety copy is saved as <code className="bg-gray-200 px-1 rounded text-xs font-mono">schoolfees_before_restore.db</code>.</p>
            <p>• After restore the app reloads automatically to reflect the new data.</p>
          </div>
        </div>
      </div>

      <Confirm open={confirmRestore} onClose={() => setConfirmRestore(false)} onConfirm={handleLocalRestore} danger
        title="Restore Database"
        message="This will replace ALL current data with the selected backup file. A safety copy will be saved first. The app will reload after restore. Continue?" />
    </div>
  )
}
