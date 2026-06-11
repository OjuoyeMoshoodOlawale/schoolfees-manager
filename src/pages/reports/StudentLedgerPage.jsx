import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Search, BookOpen, ChevronDown, ChevronRight, Printer, Loader } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { printCleanHtml } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { fmtDate } from '../../lib/utils'

export default function StudentLedgerPage() {
  const { fmt } = useAuth()
  const navigate = useNavigate()
  const [students,  setStudents]  = useState([])
  const [search,    setSearch]    = useState('')
  const [selId,     setSelId]     = useState(null)
  const [ledger,    setLedger]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [expanded,  setExpanded]  = useState({})
  const [printing,  setPrinting]  = useState(false)

  useEffect(() => {
    window.api.listStudents({}).then(setStudents)
  }, [])

  const loadLedger = async (id) => {
    setSelId(id); setLoading(true)
    try {
      const data = await window.api.getStudentLedger({ student_id: id })
      setLedger(data)
      const exp = {}
      data.history.forEach(t => { exp[t.term_id] = true })
      setExpanded(exp)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return `${s.first_name} ${s.last_name} ${s.reg_number}`.toLowerCase().includes(q)
  })

  // Print the full ledger for the selected student
  const handlePrint = async () => {
    if (!ledger) return
    setPrinting(true)
    try {
      const sym = fmt(0).replace(/[\d.,]/g, '').trim() || '₦'
      const fmtN = n => sym + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))

      const termBlocks = ledger.history.map(term => {
        const billRows = term.bills.filter(b => b.status !== 'waived').map(b => `
          <tr><td style="padding:3px 10px;font-size:9pt">${esc(b.fee_item_name)}</td>
          <td style="padding:3px 10px;font-size:9pt;text-align:right">${fmtN(b.amount)}</td></tr>`).join('')
        const payRows = term.payments.filter(p => !p.is_reversed && p.amount_paid > 0).map(p => `
          <tr><td style="padding:3px 10px;font-size:9pt">${esc(p.payment_date)} · ${esc(p.receipt_number)} · ${esc((p.payment_method||'').toUpperCase())}</td>
          <td style="padding:3px 10px;font-size:9pt;text-align:right;color:#059669">${fmtN(p.amount_paid)}</td></tr>`).join('')
        return `
          <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
            <div style="background:#f1f5f9;padding:6px 12px;font-weight:bold;font-size:10pt;display:flex;justify-content:space-between">
              <span>${esc(term.session_name)} — ${esc(term.term_name)} (${esc(term.class_name||'')})</span>
              <span style="color:${term.balance > 0 ? '#dc2626' : '#059669'}">${term.balance > 0 ? 'Owes ' + fmtN(term.balance) : 'Fully paid'}</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td colspan="2" style="padding:4px 10px;font-size:8pt;font-weight:bold;color:#64748b;text-transform:uppercase">Fee Lines</td></tr>
              ${billRows || '<tr><td style="padding:3px 10px;font-size:9pt;color:#9ca3af">No bills</td><td></td></tr>'}
              <tr style="border-top:1px solid #e5e7eb"><td style="padding:4px 10px;font-size:9pt;font-weight:bold">Subtotal Billed</td><td style="padding:4px 10px;font-size:9pt;font-weight:bold;text-align:right">${fmtN(term.billed)}</td></tr>
              ${payRows ? `<tr><td colspan="2" style="padding:4px 10px;font-size:8pt;font-weight:bold;color:#64748b;text-transform:uppercase">Payments</td></tr>${payRows}` : ''}
              <tr style="border-top:1px solid #e5e7eb;background:#f8fafc"><td style="padding:4px 10px;font-size:9pt;font-weight:bold">Paid This Term</td><td style="padding:4px 10px;font-size:9pt;font-weight:bold;text-align:right;color:#059669">${fmtN(term.paid)}</td></tr>
            </table>
          </div>`
      }).join('')

      const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px">
          <h1 style="font-size:15pt;font-weight:bold;margin:0;text-transform:uppercase">Student Ledger</h1>
          <p style="margin:6px 0 0;font-size:12pt;font-weight:bold">${esc(ledger.student.last_name)} ${esc(ledger.student.first_name)}</p>
          <p style="margin:2px 0 0;font-size:10pt;color:#64748b">${esc(ledger.student.reg_number)}</p>
        </div>
        <div style="display:flex;justify-content:space-around;margin-bottom:18px;padding:10px;background:#f8fafc;border-radius:6px">
          <div style="text-align:center"><div style="font-size:8pt;color:#64748b;text-transform:uppercase">Total Billed</div><div style="font-size:12pt;font-weight:bold">${fmtN(ledger.totalBilled)}</div></div>
          <div style="text-align:center"><div style="font-size:8pt;color:#64748b;text-transform:uppercase">Total Paid</div><div style="font-size:12pt;font-weight:bold;color:#059669">${fmtN(ledger.totalPaid)}</div></div>
          <div style="text-align:center"><div style="font-size:8pt;color:#64748b;text-transform:uppercase">Terms</div><div style="font-size:12pt;font-weight:bold">${ledger.history.length}</div></div>
        </div>
        ${termBlocks}
        <p style="text-align:center;font-size:8pt;color:#9ca3af;margin-top:20px">Generated ${new Date().toLocaleString('en-NG')}</p>
      </div>`
      await printCleanHtml(html)
    } catch (e) {
      toast.error('Print failed: ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Student picker */}
      <div className="lg:col-span-1">
        <PageHeader title="Student Ledger" subtitle="Full payment history across all terms"
        actions={ledger && (
          <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
            {printing ? <Loader size={14} className="animate-spin"/> : <Printer size={14}/>} Print
          </button>
        )}
      />
        <div className="card p-0 overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
              <input className="form-input pl-8 text-sm" placeholder="Search student…" value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {filtered.slice(0, 100).map(s => (
              <button key={s.id} onClick={() => loadLedger(s.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selId === s.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
                <p className="text-sm font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                <p className="text-xs text-gray-400 font-mono">{s.reg_number}</p>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No students found</p>}
          </div>
        </div>
      </div>

      {/* Ledger view */}
      <div className="lg:col-span-2">
        {loading && <div className="card"><Spinner/></div>}
        {!loading && !ledger && (
          <div className="card text-center py-16 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-200"/>
            <p className="font-medium">Select a student to view their ledger</p>
          </div>
        )}
        {!loading && ledger && (
          <div className="space-y-4">
            {/* Student summary */}
            <div className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">{ledger.student.last_name} {ledger.student.first_name}</h2>
                  <p className="text-sm text-gray-500 font-mono">{ledger.student.reg_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total Paid (all terms)</p>
                  <p className="text-2xl font-bold text-emerald-700">{fmt(ledger.totalPaid)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                {[
                  { label: 'Terms on record', value: ledger.history.length },
                  { label: 'Total Billed', value: fmt(ledger.totalBilled), color: 'text-gray-900' },
                  { label: 'Total Paid', value: fmt(ledger.totalPaid), color: 'text-emerald-700' },
                ].map(m => (
                  <div key={m.label} className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{m.label}</p>
                    <p className={`text-base font-bold mt-0.5 ${m.color || 'text-gray-800'}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-term history */}
            {ledger.history.map(term => (
              <div key={term.term_id} className="card overflow-hidden p-0">
                <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  onClick={() => setExpanded(e => ({...e, [term.term_id]: !e[term.term_id]}))}>
                  {expanded[term.term_id] ? <ChevronDown size={15} className="text-gray-400"/> : <ChevronRight size={15} className="text-gray-400"/>}
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{term.session_name} — {term.term_name}</p>
                    <p className="text-xs text-gray-400">{term.class_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-700">{fmt(term.paid)}</p>
                    <p className={`text-xs font-medium ${term.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {term.balance > 0 ? `Owes ${fmt(term.balance)}` : 'Fully paid'}
                    </p>
                  </div>
                </button>

                {expanded[term.term_id] && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {/* Bills */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Fee Lines</p>
                      {term.bills.length === 0
                        ? <p className="text-xs text-gray-400">No bills generated</p>
                        : term.bills.filter(b => b.status !== 'waived').map(b => (
                          <div key={b.id} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-600">{b.fee_item_name}</span>
                            <span className="font-medium">{fmt(b.amount)}</span>
                          </div>
                        ))}
                      <div className="flex justify-between text-xs font-bold border-t border-gray-100 pt-1 mt-1">
                        <span>Subtotal</span><span>{fmt(term.billed)}</span>
                      </div>
                    </div>
                    {/* Payments */}
                    {term.payments.filter(p => !p.is_reversed && p.amount_paid > 0).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Payments</p>
                        {term.payments.filter(p => !p.is_reversed && p.amount_paid > 0).map(p => (
                          <div key={p.id} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-600">{fmtDate(p.payment_date)} · {p.receipt_number} · <span className="uppercase">{p.payment_method}</span></span>
                            <span className="font-medium text-emerald-700">{fmt(p.amount_paid)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
