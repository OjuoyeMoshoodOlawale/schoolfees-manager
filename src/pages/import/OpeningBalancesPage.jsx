import { useEffect, useState, useRef } from 'react'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx'
import { Upload, Download, CheckCircle2, AlertCircle, FileSpreadsheet, Lock, Unlock } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function OpeningBalancesPage() {
  const { fmt, isAdmin, user } = useAuth()
  const fileRef  = useRef()
  const [rows, setRows]       = useState([])
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [term, setTerm]       = useState(null)
  const [lockInfo, setLockInfo] = useState(null) // { locked, count }

  const refreshLock = async (t) => {
    if (!t) return
    try { setLockInfo(await window.api.openingBalancesStatus({ term_id: t.id })) } catch {}
  }

  useEffect(() => {
    window.api.getCurrentTerm().then(t => { setTerm(t); refreshLock(t) })
  }, [])

  const handleUnlock = async () => {
    if (!isAdmin) { toast.error('Only an administrator can unlock opening balances'); return }
    if (!window.confirm('Unlock opening balances for this term? This allows re-importing and overwriting existing balances.')) return
    try {
      await window.api.openingBalancesUnlock({ term_id: term.id, admin_username: user?.username })
      toast.success('Opening balances unlocked')
      refreshLock(term)
    } catch (e) { toast.error(e.message) }
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: 'binary' })
      // Read EVERY sheet — the template has one tab per class
      const data = wb.SheetNames.flatMap(sn =>
        XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' })
          .map(r => ({ ...r, _sheet: sn }))
      )
      const seenRegs = new Set()
      const MAX_BALANCE = 10_000_000
      const parsed = data.map((r, i) => {
        const reg     = String(r['Reg Number'] || r['reg_number'] || r['RegNumber'] || '').trim()
        // Accept "15,000" / "₦15000" by stripping non-numeric characters
        const rawBal  = String(r['Opening Balance'] ?? r['Balance'] ?? r['Amount'] ?? 0).replace(/[₦,\s]/g, '')
        const name    = String(r['Student Name'] || r['Name'] || '').trim()
        const balance = parseFloat(rawBal || 0)
        const errors  = []
        if (!reg) errors.push('Reg Number required')
        if (isNaN(balance) || balance < 0) errors.push('Balance must be a non-negative number')
        if (balance > MAX_BALANCE) errors.push(`Balance exceeds ₦${MAX_BALANCE.toLocaleString()} limit`)
        const regKey = reg.toUpperCase()
        if (reg && seenRegs.has(regKey)) errors.push('Duplicate Reg Number in file')
        if (reg) seenRegs.add(regKey)
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
      if (res.ok) {
        toast.success(`${res.imported} balance${res.imported !== 1 ? 's' : ''} imported — records are now locked`)
        setRows([])            // hide the imported data from the screen
        refreshLock(term)      // show the locked banner
      }
      else toast.error(res.error)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const downloadTemplate = async () => {
    if (!term) { toast.error('No active term set'); return }
    try {
      const res = await window.api.openingBalancesTemplate({ term_id: term.id })
      if (!res.ok) { toast.error(res.error || 'Could not build template'); return }
      const wb = XLSX.utils.book_new()
      if (!res.sheets.length) {
        // No students yet — fall back to a sample sheet
        const ws = XLSX.utils.aoa_to_sheet([
          ['Reg Number', 'Student Name', 'Opening Balance'],
          ['STU/2024/001', 'Ade Johnson', 15000],
        ])
        XLSX.utils.book_append_sheet(wb, ws, 'Opening Balances')
      } else {
        // One tab per class, pre-filled with every active student in that
        // class. Existing balances appear so they can be reviewed/updated.
        for (const sheet of res.sheets) {
          const aoa = [
            ['Reg Number', 'Student Name', 'Opening Balance'],
            ...sheet.students.map(s => [s.reg_number, s.name, s.existing_balance]),
          ]
          const ws = XLSX.utils.aoa_to_sheet(aoa)
          ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }]
          // Sheet names max 31 chars and no special chars
          const tabName = sheet.class_name.replace(/[\\/?*[\]:]/g, '').slice(0, 31)
          XLSX.utils.book_append_sheet(wb, ws, tabName || 'Class')
        }
      }
      XLSX.writeFile(wb, `opening_balances_${(term.session_name || '').replace('/', '-')}_${term.name.replace(/\s/g, '')}.xlsx`)
      toast.success('Template downloaded — one tab per class, all students pre-filled')
    } catch (e) { toast.error(e.message) }
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

      {lockInfo?.locked && (
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
          <Lock size={18} className="flex-shrink-0 mt-0.5 text-slate-500" />
          <div className="flex-1 text-sm text-slate-700">
            <p className="font-semibold">Opening balances are locked for this term.</p>
            <p className="text-slate-500 mt-0.5">
              {lockInfo.count} balance record{lockInfo.count !== 1 ? 's' : ''} imported. The data is hidden and
              re-importing is blocked to prevent tampering. {isAdmin ? 'As an administrator you can unlock to re-import.' : 'Contact an administrator if changes are needed.'}
            </p>
          </div>
          {isAdmin && (
            <button className="btn btn-sm btn-secondary flex-shrink-0" onClick={handleUnlock}>
              <Unlock size={13} /> Unlock
            </button>
          )}
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

      {/* Upload — hidden while balances are locked to prevent misuse */}
      {!lockInfo?.locked && (
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
      )}

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
