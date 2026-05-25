import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Zap, AlertCircle, CheckCircle2, Users, ChevronRight, Download } from 'lucide-react'
import { PageHeader, Spinner, Confirm, exportToExcel } from '../../components/ui'

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

export default function GenerateBillsPage() {
  const [sessions, setSessions]     = useState([])
  const [classes, setClasses]       = useState([])
  const [terms, setTerms]           = useState([])
  const [selSession, setSelSession] = useState('')
  const [selTerm, setSelTerm]       = useState('')
  const [selClass, setSelClass]     = useState('')
  const [currentTerm, setCurrentTerm] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [result, setResult]         = useState(null)
  const [classData, setClassData]   = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [confirm, setConfirm]       = useState(false)

  useEffect(() => {
    async function init() {
      const [sess, cls, ct] = await Promise.all([
        window.api.listSessions(), window.api.listClasses(), window.api.getCurrentTerm()
      ])
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
      setCurrentTerm(ct)
      if (ct) {
        setSelSession(String(ct.session_id))
        const tlist = await window.api.listTerms(ct.session_id)
        setTerms(tlist)
        setSelTerm(String(ct.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSession) window.api.listTerms(Number(selSession)).then(t => { setTerms(t); if (!currentTerm || String(currentTerm.session_id) !== selSession) setSelTerm('') })
  }, [selSession])

  // Load class bill data when class+term selected
  useEffect(() => {
    if (selTerm && selClass) {
      setLoadingData(true)
      window.api.listClassBills({ class_id: Number(selClass), term_id: Number(selTerm) })
        .then(d => { setClassData(d); setLoadingData(false) })
    } else { setClassData([]) }
  }, [selTerm, selClass])

  const doGenerate = async () => {
    setGenerating(true)
    try {
      const res = await window.api.generateClassBills({ class_id: Number(selClass), term_id: Number(selTerm) })
      setResult(res)
      toast.success(`Bills generated: ${res.generated} new, ${res.skipped} already existed`)
      // Reload class data
      const d = await window.api.listClassBills({ class_id: Number(selClass), term_id: Number(selTerm) })
      setClassData(d)
    } catch (e) {
      toast.error(e.message || 'Generation failed')
    } finally { setGenerating(false); setConfirm(false) }
  }

  const handleExport = async () => {
    const rows = classData.flatMap(s =>
      s.bills.map(b => ({
        'Reg No':      s.reg_number,
        'Last Name':   s.last_name,
        'First Name':  s.first_name,
        'Gender':      s.gender === 'M' ? 'Male' : 'Female',
        'Boarding':    s.boarding_type || 'day',
        'Type':        s.entry_type,
        'Fee Item':    b.fee_item_name,
        'Amount (₦)':  b.amount,
        'Compulsory':  b.is_compulsory ? 'Yes' : 'No',
        'Status':      b.status,
      }))
    )
    if (!rows.length) { toast.error('No bill data to export'); return }
    await exportToExcel(rows, `bills_${classes.find(c => c.id === Number(selClass))?.name || 'class'}`)
    toast.success('Exported to Excel')
  }

  const totalExpected = classData.reduce((s, r) => s + r.total_expected, 0)
  const totalPaid     = classData.reduce((s, r) => s + r.total_paid, 0)
  const totalBalance  = classData.reduce((s, r) => s + r.balance, 0)
  const hasBills      = classData.some(r => r.bills.length > 0)

  return (
    <div>
      <PageHeader
        title="Generate Bills"
        subtitle="Auto-generate term bills for all active students in a class based on bill configuration."
        actions={hasBills && (
          <button className="btn-secondary btn btn-sm" onClick={handleExport}>
            <Download size={14} /> Export Excel
          </button>
        )}
      />

      {/* Selector */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-36">
            <label className="form-label">Session</label>
            <select className="form-select" value={selSession} onChange={e => setSelSession(e.target.value)}>
              <option value="">— Session —</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-36">
            <label className="form-label">Term</label>
            <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
              <option value="">— Term —</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-36">
            <label className="form-label">Class</label>
            <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
              <option value="">— Class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            className="btn-primary btn"
            disabled={!selTerm || !selClass || generating}
            onClick={() => setConfirm(true)}
          >
            <Zap size={15} /> {generating ? 'Generating…' : 'Generate Bills'}
          </button>
        </div>

        {/* Info tip */}
        <div className="mt-4 flex gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5 text-blue-500" />
          Bill generation is <strong>idempotent</strong> — running it again will not create duplicates.
          Only students matching each fee item's gender, boarding, and entry-type rules will be billed.
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-emerald-800">
            <p className="font-semibold">Generation complete</p>
            <p className="mt-0.5">
              {result.students} students processed · {result.generated} new bill lines created · {result.skipped} already existed (no duplicates)
            </p>
          </div>
        </div>
      )}

      {/* Summary metrics */}
      {hasBills && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Expected</p>
            <p className="text-xl font-bold text-gray-900">{fmt(totalExpected)}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
            <p className="text-xl font-bold text-emerald-600">{fmt(totalPaid)}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding</p>
            <p className={`text-xl font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(totalBalance)}</p>
          </div>
        </div>
      )}

      {/* Class bill table */}
      {selTerm && selClass && (
        loadingData ? <Spinner /> : (
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {classData.length} student{classData.length !== 1 ? 's' : ''} · {classes.find(c => c.id === Number(selClass))?.name}
              </span>
              <span className="text-xs text-gray-400">{terms.find(t => t.id === Number(selTerm))?.name}</span>
            </div>
            {classData.length === 0 ? (
              <div className="empty-state py-12">
                <Users size={30} className="empty-state-icon" />
                <p className="empty-state-title">No active students in this class this term</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {classData.map(student => (
                  <StudentBillRow key={student.id} student={student} />
                ))}
              </div>
            )}
          </div>
        )
      )}

      {!selClass && (
        <div className="card text-center py-14">
          <Zap size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select a session, term and class above</p>
          <p className="text-gray-400 text-sm mt-1">to view existing bills or generate new ones</p>
        </div>
      )}

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={doGenerate}
        title="Generate Bills"
        message={`Generate bills for all active students in ${classes.find(c=>c.id===Number(selClass))?.name} for ${terms.find(t=>t.id===Number(selTerm))?.name}? Already-generated bills will not be duplicated.`}
      />
    </div>
  )
}

function StudentBillRow({ student }) {
  const [open, setOpen] = useState(false)
  const fmt = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
  const pct  = student.total_expected > 0
    ? Math.round((student.total_paid / student.total_expected) * 100) : 0
  const statusColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div>
      <button
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
          {student.first_name?.[0]}{student.last_name?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{student.last_name} {student.first_name}</p>
          <p className="text-xs text-gray-400 font-mono">{student.reg_number} · {student.gender === 'M' ? 'Male' : 'Female'} · {student.boarding_type || 'day'} · {student.entry_type}</p>
        </div>
        <div className="text-right flex-shrink-0 mr-2">
          <p className="text-sm font-semibold text-gray-900">{fmt(student.total_expected)}</p>
          <p className="text-xs text-gray-400">{student.bills.length} item{student.bills.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="w-24 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{fmt(student.total_paid)} paid</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${statusColor}`} style={{ width: `${Math.min(pct,100)}%` }} />
          </div>
        </div>
        <ChevronRight size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-3 bg-gray-50 border-t border-gray-100">
          {student.bills.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No bills generated yet for this student.</p>
          ) : (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1 font-medium">Fee Item</th>
                  <th className="text-center py-1 font-medium">Type</th>
                  <th className="text-center py-1 font-medium">Status</th>
                  <th className="text-right py-1 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {student.bills.map(b => (
                  <tr key={b.id} className={b.status === 'waived' ? 'opacity-40 line-through' : ''}>
                    <td className="py-1 text-gray-700">{b.fee_item_name}</td>
                    <td className="py-1 text-center">
                      {b.is_compulsory
                        ? <span className="badge-green badge">Compulsory</span>
                        : <span className="badge-yellow badge">Elective</span>}
                    </td>
                    <td className="py-1 text-center">
                      <span className={`badge ${b.status === 'waived' ? 'badge-gray' : 'badge-blue'}`}>{b.status}</span>
                    </td>
                    <td className="py-1 text-right font-semibold text-gray-800">{fmt(b.amount)}</td>
                  </tr>
                ))}
                {student.prev_balance > 0 && (
                  <tr className="text-amber-700">
                    <td className="py-1 italic">Previous term balance</td>
                    <td /><td />
                    <td className="py-1 text-right font-semibold">{fmt(student.prev_balance)}</td>
                  </tr>
                )}
                {student.adjustments.map(a => (
                  <tr key={a.id} className={a.type === 'addition' ? 'text-blue-700' : 'text-emerald-700'}>
                    <td className="py-1 italic">
                      {a.type === 'addition' ? '+ Addition' : '− Discount'} ({a.calc_mode})
                      {a.reason && ` — ${a.reason}`}
                    </td>
                    <td /><td />
                    <td className="py-1 text-right font-semibold">
                      {a.type === 'addition' ? '+' : '−'}{fmt(a.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-300 font-bold">
                  <td className="py-1.5 text-gray-800">Total Expected</td>
                  <td /><td />
                  <td className="py-1.5 text-right text-gray-900">{fmt(student.total_expected)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
