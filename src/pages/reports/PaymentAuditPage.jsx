import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Shield, Download, Printer, Loader } from 'lucide-react'
import { PageHeader, Spinner, SearchInput, exportToExcel } from '../../components/ui'
import { printCleanHtml, fmtDate } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { fmtDate } from '../../lib/utils'

export default function PaymentAuditPage() {
  const { fmt } = useAuth()
  const [sessions,  setSessions]  = useState([])
  const [terms,     setTerms]     = useState([])
  const [selSess,   setSelSess]   = useState('')
  const [selTerm,   setSelTerm]   = useState('')
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [printing,  setPrinting]  = useState(false)
  const [showRev,   setShowRev]   = useState(true)

  useEffect(() => {
    async function init() {
      const [sess, ct] = await Promise.all([window.api.listSessions(), window.api.getCurrentTerm()])
      setSessions(sess)
      if (ct) {
        setSelSess(String(ct.session_id))
        const tlist = await window.api.listTerms(ct.session_id)
        setTerms(tlist)
        setSelTerm(String(ct.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSess) window.api.listTerms(Number(selSess)).then(setTerms)
  }, [selSess])

  const load = async () => {
    if (!selTerm) return
    setLoading(true)
    try {
      const data = await window.api.getPaymentAudit({ term_id: Number(selTerm), include_reversed: showRev })
      setRows(data)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (selTerm) load() }, [selTerm, showRev])

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${r.first_name} ${r.last_name} ${r.reg_number} ${r.receipt_number} ${r.posted_by}`.toLowerCase().includes(q)
  })

  const exportData = async () => {
    const out = filtered.map(r => ({
      'Receipt No':  r.receipt_number, 'Date': r.payment_date,
      'Student':     `${r.last_name} ${r.first_name}`, 'Reg No': r.reg_number,
      'Class':       r.class_name, 'Amount (₦)': r.amount_paid,
      'Method':      r.payment_method, 'Reference': r.reference || '',
      'Posted By':   r.posted_by, 'Reversed': r.is_reversed ? 'Yes' : 'No',
      'Reversal By': r.reversed_by || '', 'Reversal Reason': r.reversal_reason || '',
    }))
    await exportToExcel(out, 'payment_audit')
    toast.success('Exported')
  }

  const totValid   = filtered.filter(r => !r.is_reversed && r.amount_paid > 0).reduce((s,r) => s + r.amount_paid, 0)
  const totReversed = filtered.filter(r => r.is_reversed).length


  const handlePrint = async () => {
    if (!rows.length) return
    setPrinting(true)
    try {
      const fmtN = n => '₦' + Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2})
      const termName = terms.find(t => String(t.id)===String(selTerm))?.name || ''
      const tableRows = filtered.map(r => `<tr style="border-bottom:1px solid #e5e7eb;${r.is_reversed?'text-decoration:line-through;color:#9ca3af':''}">
        <td style="padding:5px 8px;font-size:9pt">${r.receipt_number}</td>
        <td style="padding:5px 8px">${r.last_name}, ${r.first_name}</td>
        <td style="padding:5px 8px;font-size:9pt;color:#6b7280">${r.class_name||'—'}</td>
        <td style="padding:5px 8px;font-size:9pt">${r.payment_date}</td>
        <td style="text-align:right;padding:5px 8px;font-weight:bold">${fmtN(r.amount_paid)}</td>
        <td style="text-align:center;padding:5px 8px;text-transform:uppercase;font-size:9pt">${r.payment_method}</td>
        <td style="text-align:center;padding:5px 8px;font-size:9pt">${r.posted_by}</td>
        <td style="text-align:center;padding:5px 8px;font-size:9pt;color:${r.is_reversed?'#dc2626':'#059669'}">${r.is_reversed?'REVERSED':'OK'}</td>
      </tr>`).join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">Payment Audit Trail</h1>
          <p style="margin:4px 0 0;font-size:11pt">${termName}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 8px">Receipt</th>
            <th style="text-align:left;padding:7px 8px">Student</th>
            <th style="text-align:left;padding:7px 8px">Class</th>
            <th style="text-align:left;padding:7px 8px">Date</th>
            <th style="text-align:right;padding:7px 8px">Amount</th>
            <th style="text-align:center;padding:7px 8px">Method</th>
            <th style="text-align:center;padding:7px 8px">Posted By</th>
            <th style="text-align:center;padding:7px 8px">Status</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="margin-top:10px;font-size:9pt;color:#6b7280">${filtered.length} record(s) · Total: ${fmtN(filtered.filter(r=>!r.is_reversed).reduce((s,r)=>s+Number(r.amount_paid),0))}</p>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error('Print failed: ' + e.message) }
    finally { setPrinting(false) }
  }

  return (
    <div>
      <PageHeader title="Payment Audit Trail" subtitle="Every payment with poster, date, method and reversal details"
        actions={rows.length > 0 && <button className="btn-secondary btn btn-sm" onClick={exportData}><Download size={14}/> Export</button>}
      />

      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-36">
          <label className="form-label">Session</label>
          <select className="form-select" value={selSess} onChange={e => setSelSess(e.target.value)}>
            <option value="">— Session —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-36">
          <label className="form-label">Term</label>
          <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)}>
            <option value="">— Term —</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mb-0.5">
          <input type="checkbox" checked={showRev} onChange={e => setShowRev(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
          Show reversed
        </label>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="card py-2 px-4 flex-1 min-w-36">
            <p className="text-xs text-gray-400 uppercase">Valid Payments</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{fmt(totValid)}</p>
          </div>
          <div className="card py-2 px-4 flex-1 min-w-36">
            <p className="text-xs text-gray-400 uppercase">Transactions</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{filtered.filter(r=>!r.is_reversed).length}</p>
          </div>
          {totReversed > 0 && (
            <div className="card py-2 px-4 flex-1 min-w-36">
              <p className="text-xs text-gray-400 uppercase">Reversals</p>
              <p className="text-xl font-bold text-red-600 mt-0.5">{totReversed}</p>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search receipt, student, posted by…"/>
        </div>
      )}

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          {filtered.length === 0
            ? <div className="py-12 text-center text-gray-400"><Shield size={36} className="mx-auto mb-3 text-gray-200"/><p>Select a term to view the audit trail</p></div>
            : (
              <table className="data-table">
                <thead><tr>
                  <th>Receipt No</th><th>Date</th><th>Student</th><th>Class</th>
                  <th className="text-right">Amount</th><th>Method</th>
                  <th>Posted By</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={r.is_reversed ? 'opacity-50 bg-red-50' : ''}>
                      <td className="font-mono text-xs text-blue-600">{r.receipt_number}</td>
                      <td className="text-sm text-gray-600">{fmtDate(r.payment_date)}</td>
                      <td className="font-medium">{r.last_name} {r.first_name}</td>
                      <td className="text-sm text-gray-500">{r.class_name || '—'}</td>
                      <td className={`text-right font-bold ${r.is_reversed?'text-red-500 line-through':'text-emerald-700'}`}>{fmt(r.amount_paid)}</td>
                      <td><span className="badge-blue badge uppercase text-xs">{r.payment_method}</span></td>
                      <td className="text-sm text-gray-500">{r.posted_by || '—'}</td>
                      <td>
                        {r.is_reversed
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Reversed by {r.reversed_by}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Valid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  )
}
