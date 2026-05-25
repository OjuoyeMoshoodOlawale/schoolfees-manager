import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Printer, Download, Users, ChevronDown, ChevronRight, Loader } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const fmt2 = n => Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })

export default function ClassBillPrintPage() {
  const { fmt } = useAuth()
  const [sessions, setSessions]   = useState([])
  const [classes, setClasses]     = useState([])
  const [terms, setTerms]         = useState([])
  const [school, setSchool]       = useState(null)
  const [selSession, setSelSession] = useState('')
  const [selTerm, setSelTerm]     = useState('')
  const [selClass, setSelClass]   = useState('')
  const [classData, setClassData] = useState([])
  const [loading, setLoading]     = useState(false)
  const [expanded, setExpanded]   = useState({})

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
    if (selSession) window.api.listTerms(Number(selSession)).then(t => { setTerms(t) })
  }, [selSession])

  const loadBills = async () => {
    if (!selTerm || !selClass) { toast.error('Select a term and class'); return }
    setLoading(true)
    try {
      const data = await window.api.listClassBills({ class_id: Number(selClass), term_id: Number(selTerm) })
      setClassData(data)
      // Expand all by default
      const exp = {}
      data.forEach(s => { exp[s.id] = true })
      setExpanded(exp)
    } catch (e) { toast.error(e.message || 'Failed to load bills') }
    finally { setLoading(false) }
  }

  const handlePrint = () => window.print()

  const handleExport = async () => {
    const rows = classData.flatMap(s => [
      ...s.bills.map(b => ({
        'Reg No':      s.reg_number,
        'Student':     `${s.last_name} ${s.first_name}`,
        'Gender':      s.gender === 'M' ? 'Male' : 'Female',
        'Boarding':    s.boarding_type || 'day',
        'Entry':       s.entry_type,
        'Fee Item':    b.fee_item_name,
        'Amount (₦)':  b.amount,
        'Status':      b.status,
        'Total Bill':  '',
        'Total Paid':  '',
        'Balance':     '',
      })),
      {
        'Reg No': s.reg_number,
        'Student': `${s.last_name} ${s.first_name}`,
        'Gender': '', 'Boarding': '', 'Entry': '',
        'Fee Item': 'TOTAL',
        'Amount (₦)': '',
        'Status': '',
        'Total Bill':  s.total_expected,
        'Total Paid':  s.total_paid,
        'Balance':     s.balance,
      },
      { 'Reg No': '' }
    ])
    await exportToExcel(rows, `class_bills_${classes.find(c=>c.id===Number(selClass))?.name}`)
    toast.success('Exported to Excel')
  }

  const className   = classes.find(c => c.id === Number(selClass))?.name || ''
  const termName    = terms.find(t => t.id === Number(selTerm))?.name    || ''
  const sessionName = sessions.find(s => s.id === Number(selSession))?.name || ''

  const totalBilled  = classData.reduce((s, r) => s + r.total_expected, 0)
  const totalPaid    = classData.reduce((s, r) => s + r.total_paid,    0)
  const totalBalance = classData.reduce((s, r) => s + r.balance,       0)

  return (
    <div>
      {/* Screen controls — hidden on print */}
      <div className="print:hidden">
        <PageHeader
          title="Print Class Bills"
          subtitle="Generate and print fee bills for all students in a class."
          actions={classData.length > 0 && (
            <div className="flex gap-2">
              <button className="btn-secondary btn btn-sm" onClick={handleExport}>
                <Download size={14} /> Export Excel
              </button>
              <button className="btn-primary btn" onClick={handlePrint}>
                <Printer size={15} /> Print All Bills
              </button>
            </div>
          )}
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
            {loading ? <><Loader size={15} className="animate-spin" /> Loading…</> : <><Users size={15} /> Load Bills</>}
          </button>
        </div>

        {/* Summary */}
        {classData.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Students', value: classData.length, color: 'text-blue-700 bg-blue-50 border-blue-200' },
              { label: 'Total Billed', value: fmt(totalBilled), color: 'text-gray-900 bg-white border-gray-200' },
              { label: 'Total Paid', value: fmt(totalPaid), color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'Outstanding', value: fmt(totalBalance), color: 'text-red-700 bg-red-50 border-red-200' },
            ].map(c => (
              <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
                <p className="text-xs font-medium uppercase tracking-wide opacity-60">{c.label}</p>
                <p className="text-xl font-bold mt-1">{c.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student list (screen view) */}
      {loading && <Spinner />}

      {!loading && classData.length === 0 && selClass && (
        <div className="card text-center py-12 print:hidden">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No active students with bills in this class and term.</p>
          <p className="text-gray-400 text-sm mt-1">Generate bills first from the Generate Bills page.</p>
        </div>
      )}

      {!loading && classData.length > 0 && (
        <div className="space-y-2 print:hidden">
          {classData.map(s => (
            <div key={s.id} className="card overflow-hidden p-0">
              <button
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 text-left"
                onClick={() => setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}
              >
                {expanded[s.id] ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.reg_number} · {s.gender === 'M' ? 'Male' : 'Female'} · {s.boarding_type} · {s.entry_type}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{fmt(s.total_expected)}</p>
                  <p className={`text-xs font-medium ${s.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {s.balance > 0 ? `Owes ${fmt(s.balance)}` : 'Fully paid'}
                  </p>
                </div>
              </button>
              {expanded[s.id] && (
                <table className="data-table border-t border-gray-200">
                  <tbody>
                    {s.bills.map(b => (
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
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── PRINT LAYOUT ── */}
      {/* Each student gets their own printable slip */}
      {classData.length > 0 && (
        <div className="hidden print:block">
          {classData.map((s, idx) => (
            <div key={s.id} className="receipt-page p-8 border border-gray-300 mb-4"
              style={{ pageBreakAfter: 'always', fontFamily: 'Arial, sans-serif', fontSize: '12pt' }}>
              {/* School header */}
              <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
                {school?.logo_path && (
                  <img src={`file://${school.logo_path}`} alt="Logo"
                    style={{ width: 60, height: 60, objectFit: 'contain', margin: '0 auto 8px' }} />
                )}
                <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {school?.school_name || 'School Name'}
                </h1>
                {school?.address && <p style={{ fontSize: '10pt', color: '#666' }}>{school.address}</p>}
                {school?.phone && <p style={{ fontSize: '10pt', color: '#666' }}>Tel: {school.phone}</p>}
                <h2 style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: 8, textDecoration: 'underline' }}>
                  FEE STATEMENT
                </h2>
                <p style={{ fontSize: '11pt', marginTop: 4 }}>
                  {sessionName} — {termName} — {className}
                </p>
              </div>

              {/* Student info */}
              <table style={{ width: '100%', marginBottom: 16, fontSize: '11pt' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '50%', paddingBottom: 4 }}><strong>Name:</strong> {s.last_name} {s.first_name}</td>
                    <td><strong>Reg No:</strong> {s.reg_number}</td>
                  </tr>
                  <tr>
                    <td><strong>Class:</strong> {className}</td>
                    <td><strong>Gender:</strong> {s.gender === 'M' ? 'Male' : 'Female'} | <strong>Type:</strong> {s.boarding_type}</td>
                  </tr>
                </tbody>
              </table>

              {/* Fee table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: 'white' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', border: '1px solid #333' }}>Fee Item</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', border: '1px solid #333' }}>Type</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', border: '1px solid #333' }}>Amount (₦)</th>
                  </tr>
                </thead>
                <tbody>
                  {s.bills.filter(b => b.status !== 'waived').map((b, i) => (
                    <tr key={b.id} style={{ background: i % 2 === 0 ? '#f9f9f9' : 'white' }}>
                      <td style={{ padding: '5px 10px', border: '1px solid #ddd' }}>{b.fee_item_name}</td>
                      <td style={{ textAlign: 'center', padding: '5px 10px', border: '1px solid #ddd' }}>
                        {b.is_compulsory ? 'Compulsory' : 'Elective'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '5px 10px', border: '1px solid #ddd' }}>
                        {fmt2(b.amount)}
                      </td>
                    </tr>
                  ))}
                  {s.prev_balance > 0 && (
                    <tr style={{ background: '#fef3c7' }}>
                      <td style={{ padding: '5px 10px', border: '1px solid #ddd', fontStyle: 'italic' }}>Previous Term Balance</td>
                      <td style={{ border: '1px solid #ddd' }}></td>
                      <td style={{ textAlign: 'right', padding: '5px 10px', border: '1px solid #ddd' }}>{fmt2(s.prev_balance)}</td>
                    </tr>
                  )}
                  {s.adjustments?.map(a => {
                    const effect = a.calc_mode === 'percent' ? (a.amount / 100) * s.bill_total : a.amount
                    return (
                      <tr key={a.id} style={{ background: a.type === 'addition' ? '#fef2f2' : '#f0fdf4' }}>
                        <td style={{ padding: '5px 10px', border: '1px solid #ddd', fontStyle: 'italic' }}>
                          {a.type === 'addition' ? '+ Addition' : '− Discount'}: {a.reason}
                        </td>
                        <td style={{ border: '1px solid #ddd' }}></td>
                        <td style={{ textAlign: 'right', padding: '5px 10px', border: '1px solid #ddd' }}>
                          {a.type === 'addition' ? '+' : '−'}{fmt2(effect)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1e293b', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={2} style={{ padding: '8px 10px', border: '1px solid #333' }}>TOTAL EXPECTED</td>
                    <td style={{ textAlign: 'right', padding: '8px 10px', border: '1px solid #333', fontSize: '13pt' }}>
                      {fmt2(s.total_expected)}
                    </td>
                  </tr>
                  <tr style={{ background: '#d1fae5', fontWeight: 'bold' }}>
                    <td colSpan={2} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>Total Paid</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', border: '1px solid #ddd', color: '#065f46' }}>
                      {fmt2(s.total_paid)}
                    </td>
                  </tr>
                  <tr style={{ background: s.balance > 0 ? '#fee2e2' : '#d1fae5', fontWeight: 'bold' }}>
                    <td colSpan={2} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>
                      {s.balance > 0 ? 'BALANCE DUE' : 'FULLY PAID'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', border: '1px solid #ddd',
                      color: s.balance > 0 ? '#991b1b' : '#065f46', fontSize: '13pt' }}>
                      {fmt2(s.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Bank details */}
              {school?.account_number && (
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: '10pt', color: '#555' }}>
                  <p>Pay to: <strong>{school.bank_name}</strong> | Account: <strong>{school.account_number}</strong></p>
                  {school.account_name && <p>{school.account_name}</p>}
                </div>
              )}
              <p style={{ textAlign: 'center', marginTop: 10, fontSize: '9pt', color: '#999' }}>
                {school?.receipt_footer || 'Please ensure payment is made promptly.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
