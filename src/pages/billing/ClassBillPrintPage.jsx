import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Printer, Download, Users, ChevronDown, ChevronRight, Loader, RefreshCw, Mail } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel, Confirm } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { buildBillSlipHtml, printCleanHtml } from '../../lib/utils'

export default function ClassBillPrintPage() {
  const { fmt } = useAuth()
  const [sessions,    setSessions]    = useState([])
  const [classes,     setClasses]     = useState([])
  const [terms,       setTerms]       = useState([])
  const [school,      setSchool]      = useState(null)
  const [selSession,  setSelSession]  = useState('')
  const [selTerm,     setSelTerm]     = useState('')
  const [selClass,    setSelClass]    = useState('')
  const [classData,   setClassData]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [printing,    setPrinting]    = useState(false)
  const [emailing,    setEmailing]    = useState(false)
  const [confirmBulkEmail, setConfirmBulkEmail] = useState(false)
  const [expanded,    setExpanded]    = useState({})

  useEffect(() => {
    async function init() {
      const [sess, cls, ct, s] = await Promise.all([
        window.api.listSessions(),
        window.api.listClasses(),
        window.api.getCurrentTerm(),
        window.api.getSettings(),
      ])
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
      setSchool(s)
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
    if (selSession) window.api.listTerms(Number(selSession)).then(t => setTerms(t))
  }, [selSession])

  const loadBills = async () => {
    if (!selTerm || !selClass) { toast.error('Select a term and class'); return }
    setLoading(true)
    try {
      const data = await window.api.listClassBills({ class_id: Number(selClass), term_id: Number(selTerm) })
      setClassData(data)
      const exp = {}
      data.forEach(s => { exp[s.id] = true })
      setExpanded(exp)
    } catch (e) { toast.error(e.message || 'Failed to load bills') }
    finally { setLoading(false) }
  }

  const className   = classes.find(c => c.id === Number(selClass))?.name    || ''
  const termName    = terms.find(t => t.id === Number(selTerm))?.name       || ''
  const sessionName = sessions.find(s => s.id === Number(selSession))?.name || ''

  // ── Clean print: build pure HTML for all students, send to hidden Electron window ──
  const handlePrint = async () => {
    if (!classData.length) return
    setPrinting(true)
    try {
      // One slip per student, separated by a page-break div
      const slipsHtml = classData.map((s, idx) => {
        const slip = buildBillSlipHtml({
          student:       s,
          bills:         s.bills,
          adjustments:   s.adjustments,
          bill_total:    s.bill_total,
          prev_balance:  s.prev_balance,
          total_expected: s.total_expected,
          total_paid:    s.total_paid,
          balance:       s.balance,
          school,
          sessionName,
          termName,
          className,
        })
        const pageBreak = idx < classData.length - 1
          ? '<div style="page-break-after:always;height:0;margin:0;padding:0"></div>'
          : ''
        return slip + pageBreak
      }).join('\n')

      const r = await printCleanHtml(slipsHtml)
      if (r && !r.ok) toast.error('Print failed: ' + (r.error || 'unknown'))
    } catch(e) {
      toast.error('Print error: ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleExport = async () => {
    const rows = classData.flatMap(s => [
      ...s.bills.map(b => ({
        'Reg No':     s.reg_number,
        'Student':    `${s.last_name} ${s.first_name}`,
        'Gender':     s.gender === 'M' ? 'Male' : 'Female',
        'Boarding':   s.boarding_type || 'day',
        'Entry':      s.entry_type,
        'Fee Item':   b.fee_item_name,
        'Amount (₦)': b.amount,
        'Status':     b.status,
        'Total Bill': '', 'Total Paid': '', 'Balance': '',
      })),
      {
        'Reg No': s.reg_number, 'Student': `${s.last_name} ${s.first_name}`,
        'Gender': '', 'Boarding': '', 'Entry': '',
        'Fee Item': 'TOTAL', 'Amount (₦)': '', 'Status': '',
        'Total Bill': s.total_expected, 'Total Paid': s.total_paid, 'Balance': s.balance,
      },
      { 'Reg No': '' }
    ])
    await exportToExcel(rows, `class_bills_${className}`)
    toast.success('Exported to Excel')
  }

  // Email every parent in the class their child's term bill
  const handleBulkEmail = async () => {
    setEmailing(true)
    try {
      const r = await window.api.sendBillEmailsBulk({
        class_id: Number(selClass),
        term_id: Number(selTerm),
      })
      if (!r.ok) { toast.error(r.error || 'Bulk email failed'); return }
      toast.success(`Bills emailed: ${r.sent} sent, ${r.skipped} skipped (no email/bills), ${r.failed} failed`)
      if (r.failed > 0 && r.failures?.length) {
        toast.warn(`First failure: ${r.failures[0].student} — ${r.failures[0].error}`)
      }
    } catch (e) { toast.error(e.message) }
    finally { setEmailing(false); setConfirmBulkEmail(false) }
  }

  const totalBilled  = classData.reduce((s, r) => s + r.total_expected, 0)
  const totalPaid    = classData.reduce((s, r) => s + r.total_paid,    0)
  const totalBalance = classData.reduce((s, r) => s + r.balance,       0)

  return (
    <div>
      <PageHeader
        title="Print Class Bills"
        subtitle="Generate and print fee bills for all students in a class."
        actions={classData.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={handleExport}>
              <Download size={14} /> Export Excel
            </button>
            <button className="btn-secondary btn btn-sm" onClick={() => setConfirmBulkEmail(true)} disabled={emailing}>
              <Mail size={14} /> {emailing ? 'Sending…' : `Email All (${classData.length})`}
            </button>
            <button className="btn-primary btn" onClick={handlePrint} disabled={printing}>
              <Printer size={15} /> {printing ? 'Sending to printer…' : `Print All (${classData.length})`}
            </button>
          </div>
        )}
      />

      <Confirm
        open={confirmBulkEmail}
        onClose={() => setConfirmBulkEmail(false)}
        onConfirm={handleBulkEmail}
        title="Email bills to all parents?"
        message={`This will email each parent in this class their child's term bill (${classData.length} students). Students without a parent email on file will be skipped. Continue?`}
      />

      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-36">
          <label className="form-label">Session</label>
          <select className="form-select" value={selSession} onChange={e => setSelSession(e.target.value)}>
            <option value="">— Select session —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-36">
          <label className="form-label">Term</label>
          <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
            <option value="">— Select term —</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-36">
          <label className="form-label">Class</label>
          <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
            <option value="">— Select class —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn-primary btn" onClick={loadBills} disabled={loading || !selTerm || !selClass}>
          {loading
            ? <><Loader size={15} className="animate-spin" /> Loading…</>
            : <><Users size={15} /> Load Bills</>}
        </button>
      </div>

      {classData.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Students',    value: classData.length, color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { label: 'Total Billed', value: fmt(totalBilled), color: 'text-gray-900 bg-white border-gray-200' },
            { label: 'Total Paid',   value: fmt(totalPaid),   color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
            { label: 'Outstanding',  value: fmt(totalBalance), color: 'text-red-700 bg-red-50 border-red-200' },
          ].map(c => (
            <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
              <p className="text-xs font-medium uppercase tracking-wide opacity-60">{c.label}</p>
              <p className="text-xl font-bold mt-1">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <Spinner />}

      {!loading && classData.length === 0 && selClass && (
        <div className="card text-center py-12">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No active students with bills in this class and term.</p>
          <p className="text-gray-400 text-sm mt-1">Bills may not have been generated yet. Go to Generate Bills page first.</p>
        </div>
      )}

      {!loading && classData.length > 0 && (
        <div className="space-y-2">
          {classData.map(s => {
            const noBills = s.bills.length === 0
            return (
              <div key={s.id} className={`card overflow-hidden p-0 ${noBills ? 'border-amber-300' : ''}`}>
                <button
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 text-left"
                  onClick={() => setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}
                >
                  {expanded[s.id]
                    ? <ChevronDown size={15} className="text-gray-400" />
                    : <ChevronRight size={15} className="text-gray-400" />}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.reg_number} · {s.gender === 'M' ? 'Male' : 'Female'} · {s.boarding_type || 'day'} · {s.entry_type}</p>
                  </div>
                  {noBills
                    ? <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">⚠ No bills</span>
                    : (
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{fmt(s.total_expected)}</p>
                        <p className={`text-xs font-medium ${s.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {s.balance > 0 ? `Owes ${fmt(s.balance)}` : 'Fully paid'}
                        </p>
                      </div>
                    )}
                </button>
                {expanded[s.id] && (
                  <table className="data-table border-t border-gray-200">
                    <tbody>
                      {s.bills.length === 0
                        ? <tr><td className="pl-12 text-amber-600 italic text-sm py-3">No bills generated for this student. Use Regenerate Bills on their individual bill page.</td></tr>
                        : s.bills.map(b => (
                          <tr key={b.id} className={b.status === 'waived' ? 'opacity-40 line-through' : ''}>
                            <td className="pl-12">{b.fee_item_name}</td>
                            <td>{b.is_compulsory ? <span className="badge-green badge">Compulsory</span> : <span className="badge-yellow badge">Elective</span>}</td>
                            <td className="text-right">{fmt(b.amount)}</td>
                          </tr>
                        ))}
                      {s.prev_balance > 0 && (
                        <tr className="bg-amber-50">
                          <td className="pl-12 italic text-amber-800">Previous term balance</td><td></td>
                          <td className="text-right text-amber-800">{fmt(s.prev_balance)}</td>
                        </tr>
                      )}
                    </tbody>
                    {s.bills.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                          <td className="pl-12 py-2">Total Expected</td><td></td>
                          <td className="text-right py-2">{fmt(s.total_expected)}</td>
                        </tr>
                        <tr className="bg-emerald-50">
                          <td className="pl-12 py-1 text-emerald-800">Total Paid</td><td></td>
                          <td className="text-right py-1 text-emerald-700">{fmt(s.total_paid)}</td>
                        </tr>
                        <tr className={s.balance > 0 ? 'bg-red-50' : 'bg-emerald-50'}>
                          <td className={`pl-12 py-1 font-bold ${s.balance > 0 ? 'text-red-800' : 'text-emerald-800'}`}>Balance</td><td></td>
                          <td className={`text-right py-1 font-bold ${s.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(s.balance)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
