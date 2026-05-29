import { useState } from 'react'
import { toast } from 'react-toastify'
import { Upload, FileJson, AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import { PageHeader } from '../../components/ui'

export default function ImportDataPage() {
  const [filepath, setFilepath]   = useState('')
  const [preview,  setPreview]    = useState(null)
  const [loading,  setLoading]    = useState(false)
  const [result,   setResult]     = useState(null)
  const [wipeFirst, setWipeFirst] = useState(false)

  const pick = async () => {
    const p = await window.api.importPickFile()
    if (!p) return
    setFilepath(p)
    setPreview(null); setResult(null)
    setLoading(true)
    try {
      const pv = await window.api.importPreview(p)
      setPreview(pv)
    } catch(e) { toast.error(e.message || 'Could not read file') }
    finally { setLoading(false) }
  }

  const execute = async () => {
    if (!filepath) return
    const msg = wipeFirst
      ? 'This will DELETE all existing students, bills, and payments, then load the import file. Are you sure?'
      : 'This will ADD the students, bills, and payments from the import file to your existing data. Continue?'
    if (!confirm(msg)) return
    setLoading(true)
    try {
      const r = await window.api.importExecute({ filepath, wipe: wipeFirst })
      setResult(r)
      toast.success(`Imported ${r.students} students, ${r.bills} bills, ${r.payments} payments`)
    } catch(e) { toast.error(e.message || 'Import failed') }
    finally { setLoading(false) }
  }

  const fmt = n => '₦' + Number(n||0).toLocaleString('en-NG')

  return (
    <div className="space-y-5">
      <PageHeader title="Import Data" subtitle="Load students, bills, and payments from a client's spreadsheet (JSON format)" />

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileJson size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Step 1 — Select import file</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Choose a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.json</code> file
          produced by the spreadsheet parser. The file contains students, fee items, bills, and payments
          ready to load into the database.
        </p>
        <div className="flex gap-3 items-center">
          <button className="btn btn-primary" onClick={pick} disabled={loading}>
            <Upload size={14} /> {filepath ? 'Choose another file' : 'Choose JSON file'}
          </button>
          {filepath && (
            <span className="text-xs text-gray-500 font-mono break-all">{filepath}</span>
          )}
        </div>
      </div>

      {loading && !preview && (
        <div className="card flex items-center gap-3 py-6">
          <Loader className="animate-spin text-blue-600" size={20} />
          <span className="text-gray-600">Reading file…</span>
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-emerald-600" />
            <h2 className="font-semibold text-gray-800">Step 2 — Review what will be imported</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="School"        value={preview.school_name}  />
            <Stat label="Session"       value={preview.session} />
            <Stat label="Current Term"  value={preview.current_term} />
            <Stat label="Students"      value={`${preview.students} (${preview.boarders} boarders)`} />
            <Stat label="Total Bills"   value={preview.bills} />
            <Stat label="Total Payments" value={preview.payments} />
            <Stat label="Total Billed"  value={fmt(preview.billed_total)} />
            <Stat label="Total Paid"    value={fmt(preview.paid_total)} />
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">By class</h3>
          <table className="data-table mb-4">
            <thead><tr><th>Class</th><th className="text-right">Students</th></tr></thead>
            <tbody>
              {Object.entries(preview.by_class).map(([c, n]) =>
                <tr key={c}><td>{c}</td><td className="text-right font-mono">{n}</td></tr>
              )}
            </tbody>
          </table>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Before you click Import:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Make a backup of your database first (Settings → Backup & Restore)</li>
                <li>Verify the session and term are correct</li>
                <li>If you've already entered some students manually, leave "Wipe existing" off</li>
                <li>Imported payments use the prefix <code>IMP-YYYY-NNNN</code> so you can find them later</li>
              </ul>
            </div>
          </div>

          <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
            <input type="checkbox" checked={wipeFirst} onChange={e => setWipeFirst(e.target.checked)} />
            <span className="text-red-600 font-medium">Wipe all existing students/bills/payments first</span>
            <span className="text-gray-500 text-xs">(check only on a brand-new installation)</span>
          </label>

          <button className="btn btn-primary" onClick={execute} disabled={loading}>
            {loading ? <><Loader size={14} className="animate-spin" /> Importing…</> : 'Run Import'}
          </button>
        </div>
      )}

      {result && (
        <div className="card border-emerald-300 bg-emerald-50">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-emerald-600" />
            <h2 className="font-semibold text-emerald-800">Import complete</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat label="Students" value={result.students} />
            <Stat label="Bills"    value={result.bills} />
            <Stat label="Payments" value={result.payments} />
            <Stat label="Skipped"  value={result.skipped} />
          </div>
          {result.warnings?.length > 0 && (
            <details>
              <summary className="text-sm text-amber-700 cursor-pointer">
                {result.warnings.length} warnings — click to expand
              </summary>
              <ul className="text-xs text-amber-800 mt-2 list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                {result.warnings.map((w,i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-gray-800 mt-1">{value}</p>
    </div>
  )
}
