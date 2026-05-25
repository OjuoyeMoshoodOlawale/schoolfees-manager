import { useState, useRef } from 'react'
import { toast } from 'react-toastify'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, X } from 'lucide-react'
import { PageHeader, Spinner, Field } from '../../components/ui'
import { normaliseImportRow, IMPORT_COLUMNS } from '../../lib/utils'
import * as XLSX from 'xlsx'

const fmt = n => `${Number(n||0)}`

export default function ImportStudentsPage() {
  const fileRef = useRef()
  const [rows, setRows]               = useState([])
  const [classes, setClasses]         = useState([])
  const [terms, setTerms]             = useState([])
  const [sessions, setSessions]       = useState([])
  const [selClass, setSelClass]       = useState('')
  const [selSession, setSelSession]   = useState('')
  const [selTerm, setSelTerm]         = useState('')
  const [entryOverride, setEntryOverride] = useState('')
  const [importing, setImporting]     = useState(false)
  const [result, setResult]           = useState(null)
  const [currentTerm, setCurrentTerm] = useState(null)

  useState(() => {
    async function init() {
      const [cls, sess, ct] = await Promise.all([
        window.api.listClasses(),
        window.api.listSessions(),
        window.api.getCurrentTerm(),
      ])
      setClasses(cls.filter(c => c.is_active))
      setSessions(sess)
      setCurrentTerm(ct)
      if (ct) {
        setSelSession(String(ct.session_id))
        const tlist = await window.api.listTerms(ct.session_id)
        setTerms(tlist)
        setSelTerm(String(ct.id))
      }
    }
    init()
  })

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) { toast.error('No data found in the file'); return }
        const normalised = raw.map((row, i) => normaliseImportRow(row, i))
        setRows(normalised)
        setResult(null)
        toast.success(`${raw.length} rows loaded from Excel`)
      } catch (e) {
        toast.error('Failed to read Excel file. Make sure it is a valid .xlsx or .xls file.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(c => c.label)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    XLSX.writeFile(wb, 'student_import_template.xlsx')
    toast.success('Template downloaded')
  }

  const doImport = async () => {
    if (!rows.length) { toast.error('No data to import'); return }
    const validRows = rows.filter(r => r._valid)
    if (!validRows.length) { toast.error('No valid rows to import'); return }

    setImporting(true)
    try {
      const res = await window.api.importStudents({
        rows: validRows,
        class_id:   selClass   ? Number(selClass)   : null,
        session_id: selSession ? Number(selSession) : null,
        term_id:    selTerm    ? Number(selTerm)    : null,
        entry_type_override: entryOverride || null,
      })
      setResult(res)
      if (res.ok) {
        toast.success(`${res.inserted} student${res.inserted !== 1 ? 's' : ''} imported successfully`)
        if (res.skippedDueToLimit > 0) {
          toast.warning(`${res.skippedDueToLimit} students skipped — student limit reached. Upgrade license.`)
        }
        setRows([])
      }
    } catch (e) {
      toast.error(e.message || 'Import failed')
    } finally { setImporting(false) }
  }

  const validCount   = rows.filter(r => r._valid).length
  const invalidCount = rows.filter(r => !r._valid).length

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Import Students from Excel"
        subtitle="Bulk-upload student records from an Excel spreadsheet."
        actions={
          <button className="btn-secondary btn btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> Download Template
          </button>
        }
      />

      {/* Step 1 — Upload */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">1. Upload Excel File</h2>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [f], value: '' } }) } }}
        >
          <FileSpreadsheet size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Click to upload or drag & drop</p>
          <p className="text-gray-400 text-sm mt-1">Excel files only (.xlsx, .xls)</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>

        {/* Column reference */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Required Columns in Your File</p>
          <div className="flex flex-wrap gap-2">
            {IMPORT_COLUMNS.map(c => (
              <span key={c.key} className={`badge ${c.required ? 'badge-blue' : 'badge-gray'}`}>
                {c.label} {c.required ? '*' : ''}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">* Required fields. Column names are case-insensitive.</p>
        </div>
      </div>

      {/* Step 2 — Configure */}
      {rows.length > 0 && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">2. Configure Import</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Assign to Session</label>
              <select className="form-select" value={selSession} onChange={async e => {
                setSelSession(e.target.value)
                if (e.target.value) {
                  const tlist = await window.api.listTerms(Number(e.target.value))
                  setTerms(tlist)
                }
              }}>
                <option value="">— No session assignment —</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Assign to Term</label>
              <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
                <option value="">— Select term —</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Assign to Class</label>
              <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
                <option value="">— No class assignment —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Override Entry Type</label>
              <select className="form-select" value={entryOverride} onChange={e => setEntryOverride(e.target.value)}>
                <option value="">Use value from file</option>
                <option value="new">Force all as New</option>
                <option value="returning">Force all as Returning</option>
              </select>
            </div>
          </div>

          {/* Preview stats */}
          <div className="flex gap-4 p-3 bg-gray-50 rounded-lg text-sm">
            <span className="text-gray-600">Total rows: <strong>{rows.length}</strong></span>
            <span className="text-emerald-600">Valid: <strong>{validCount}</strong></span>
            {invalidCount > 0 && <span className="text-red-600">Errors: <strong>{invalidCount}</strong></span>}
          </div>
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="card overflow-hidden p-0 mb-5">
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Preview — first {Math.min(rows.length, 50)} rows</span>
            <button className="text-xs text-red-500 hover:underline" onClick={() => setRows([])}>
              <X size={12} className="inline mr-1" />Clear
            </button>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Last Name</th>
                  <th>First Name</th>
                  <th>Gender</th>
                  <th>Parent Phone</th>
                  <th>Boarding</th>
                  <th>Entry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={!row._valid ? 'bg-red-50' : ''}>
                    <td className="text-gray-400 text-xs">{row._row}</td>
                    <td>{row.last_name || <span className="text-red-400 text-xs">missing</span>}</td>
                    <td>{row.first_name || <span className="text-red-400 text-xs">missing</span>}</td>
                    <td>{row.gender}</td>
                    <td>{row.parent_phone}</td>
                    <td>{row.boarding_type}</td>
                    <td>{row.entry_type}</td>
                    <td>
                      {row._valid
                        ? <span className="badge-green badge">OK</span>
                        : <span className="badge-red badge" title={row._errors.join(', ')}>Error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {validCount} valid rows will be imported.
            {invalidCount > 0 && ` ${invalidCount} rows with errors will be skipped.`}
          </p>
          <button
            className="btn-primary btn"
            onClick={doImport}
            disabled={importing || validCount === 0}
          >
            {importing
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing…</>
              : <><Upload size={15} /> Import {validCount} Students</>}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`mt-5 p-4 rounded-xl border flex gap-3 ${result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {result.ok
            ? <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
            : <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />}
          <div className="text-sm">
            <p className={`font-semibold ${result.ok ? 'text-emerald-800' : 'text-red-800'}`}>
              {result.ok ? 'Import complete' : 'Import failed'}
            </p>
            {result.ok && (
              <p className="mt-0.5 text-emerald-700">
                {result.inserted} inserted · {result.skipped} skipped (duplicates)
                {result.skippedDueToLimit > 0 && ` · ${result.skippedDueToLimit} skipped (limit)`}
              </p>
            )}
            {result.errors?.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-red-700">
                {result.errors.map((e, i) => <li key={i} className="text-xs">• {e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
