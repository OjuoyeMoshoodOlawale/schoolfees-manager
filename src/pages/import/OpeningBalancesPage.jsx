import { useEffect, useState, useRef } from 'react'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx'
import { Upload, Download, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function OpeningBalancesPage() {
  const { fmt } = useAuth()
  const fileRef  = useRef()
  const [rows, setRows]       = useState([])
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [term, setTerm]       = useState(null)

  useEffect(() => { window.api.getCurrentTerm().then(t => setTerm(t)) }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const parsed = data.map((r, i) => {
        const reg     = String(r['Reg Number'] || r['reg_number'] || r['RegNumber'] || '').trim()
        const name    = String(r['Student Name'] || r['Name'] || '').trim()
        const balance = parseFloat(r['Opening Balance'] || r['Balance'] || r['Amount'] || 0)
        const errors  = []
        if (!reg) errors.push('Reg Number required')
        if (isNaN(balance) || balance < 0) errors.push('Balance must be a positive number')
        return { _row: i + 2, reg_number: reg, name, balance, _valid: errors.length === 0, _errors: errors }
      }).filter(r => r.reg_number || r.name)
      setRows(parsed)
      setResult(null)
    }
    reader.readAsBinaryString(file)
  }

  const handleImport = async () => {
    const valid = rows.filter(r => r._valid)
    if (!valid.length) { toast.error('No valid rows to import'); return }
    if (!term) { toast.error('No active term set'); return }
    setLoading(true)
    try {
      const res = await window.api.importOpeningBalances({
        rows: valid,
        term_id: term.id
      })
      setResult(res)
      if (res.ok) toast.success(`${res.imported} balance${res.imported !== 1 ? 's' : ''} imported`)
      else toast.error(res.error)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Reg Number', 'Student Name', 'Opening Balance'],
      ['STU/2024/001', 'Ade Johnson', 15000],
      ['STU/2024/002', 'Bola Smith',  8500],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Opening Balances')
    XLSX.writeFile(wb, 'opening_balances_template.xlsx')
  }

  const validCount   = rows.filter(r => r._valid).length
  const invalidCount = rows.filter(r => !r._valid).length

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Import Opening Balances"
        subtitle="Import outstanding balances for students switching from manual records."
        actions={
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> Download Template
          </button>
        }
      />

      {!term && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          No active term set. Please set a current term before importing balances.
        </div>
      )}

      {/* Info */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">How it works</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Upload an Excel file with each student's outstanding balance from previous records</li>
          <li>• Balances are imported as carry-over entries into the <strong>current term</strong>: <span className="font-medium">{term ? `${term.session_name} — ${term.name}` : '(no term set)'}</span></li>
          <li>• If a balance already exists for a student in this term, it will be <strong>replaced</strong></li>
          <li>• Required columns: <code className="bg-gray-100 px-1 rounded">Reg Number</code>, <code className="bg-gray-100 px-1 rounded">Opening Balance</code></li>
        </ul>
      </div>

      {/* Upload */}
      <div className="card mb-5">
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="font-medium text-gray-600">Click to upload Excel file</p>
          <p className="text-xs text-gray-400 mt-1">.xlsx or .xls — see template above</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Preview — {rows.length} rows · {validCount} valid · {invalidCount} errors
            </h3>
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={loading || !validCount || !term}>
              {loading ? 'Importing…' : `Import ${validCount} Balances`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Reg Number</th>
                  <th>Name</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={!r._valid ? 'bg-red-50' : ''}>
                    <td className="text-gray-400">{r._row}</td>
                    <td className="font-mono text-xs">{r.reg_number}</td>
                    <td>{r.name}</td>
                    <td className="text-right font-medium">{fmt(r.balance)}</td>
                    <td>
                      {r._valid
                        ? <span className="badge badge-green">✓ Valid</span>
                        : <span className="badge badge-red" title={r._errors.join(', ')}>✗ {r._errors[0]}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-xl border flex gap-3 ${result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {result.ok ? <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" /> : <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <div>
            <p className={`font-semibold ${result.ok ? 'text-emerald-800' : 'text-red-800'}`}>
              {result.ok ? 'Import complete' : 'Import failed'}
            </p>
            {result.ok && (
              <p className="text-sm text-emerald-700">
                {result.imported} imported · {result.skipped} skipped (not found)
              </p>
            )}
            {result.errors?.length > 0 && (
              <ul className="mt-1 text-xs text-red-700">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
