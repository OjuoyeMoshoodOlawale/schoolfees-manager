import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { BarChart2, Download, Filter, Printer, Loader } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { printCleanHtml } from '../../lib/utils'


function ReportTable({ title, columns, rows, totals }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <table className="data-table">
        <thead>
          <tr>{columns.map(c => <th key={c.key} className={c.right ? 'text-right' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key} className={c.right ? 'text-right font-semibold' : ''}>
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
              {totals.map((t, i) => (
                <td key={i} className={t.right ? 'text-right px-4 py-3' : 'px-4 py-3'}>{t.value}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export default function AccountReportPage() {
  const { fmt } = useAuth()
  const [sessions, setSessions] = useState([])
  const [terms, setTerms]       = useState([])
  const [selSession, setSelSession] = useState('')
  const [selTerm, setSelTerm]   = useState('')
  const [report, setReport]     = useState(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    async function init() {
      const [sess, term] = await Promise.all([window.api.listSessions(), window.api.getCurrentTerm()])
      setSessions(sess)
      if (term) {
        setSelSession(String(term.session_id))
        const tlist = await window.api.listTerms(term.session_id)
        setTerms(tlist)
        setSelTerm(String(term.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSession) window.api.listTerms(Number(selSession)).then(t => { setTerms(t) })
  }, [selSession])

  useEffect(() => {
    if (selTerm) loadReport()
  }, [selTerm])

  const loadReport = async () => {
    setLoading(true)
    const data = await window.api.getAccountReport({ term_id: selTerm ? Number(selTerm) : undefined })
    setReport(data)
    setLoading(false)
  }

  const exportReport = async () => {
    if (!report) return
    // Export fee item breakdown
    const rows = [
      ...report.byFeeItem.map(r => ({
        Section: 'By Fee Item', Name: r.fee_item,
        Students: r.student_count, 'Total Billed (₦)': r.total_billed, 'Total Paid (₦)': '', 'Balance (₦)': ''
      })),
      {},
      ...report.byClass.map(r => ({
        Section: 'By Class', Name: r.class_name,
        Students: '', 'Total Billed (₦)': r.total_billed, 'Total Paid (₦)': r.total_paid,
        'Balance (₦)': Number(r.total_billed) - Number(r.total_paid)
      })),
      {},
      ...report.byMethod.map(r => ({
        Section: 'By Payment Method', Name: r.payment_method?.toUpperCase(),
        Students: '', 'Total Billed (₦)': '', 'Total Paid (₦)': r.total, 'Balance (₦)': ''
      })),
    ]
    await exportToExcel(rows, 'account_report')
    toast.success('Report exported to Excel')
  }

  const grandTotalBilled  = report?.byClass?.reduce((s, r) => s + Number(r.total_billed), 0) || 0
  const grandTotalPaid    = report?.byClass?.reduce((s, r) => s + Number(r.total_paid), 0)   || 0
  const grandTotalBalance = grandTotalBilled - grandTotalPaid


  const handlePrint = async () => {
    if (!report) return
    setPrinting(true)
    try {
      const { byClass = [], byMethod = [], byFeeItem = [] } = report
      const sym = fmt(0).replace('0.00','').trim() || '₦'
      const fmtN = n => sym + Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:2})
      const classRows = byClass.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 10px">${r.class_name}</td>
        <td style="text-align:right;padding:6px 10px">${fmtN(r.total_billed)}</td>
        <td style="text-align:right;padding:6px 10px;color:#059669">${fmtN(r.total_paid)}</td>
        <td style="text-align:right;padding:6px 10px;color:${Number(r.balance)>0?'#dc2626':'#059669'}">${fmtN(r.balance)}</td>
      </tr>`).join('')
      const methodRows = byMethod.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 10px;text-transform:uppercase;font-weight:600">${r.payment_method}</td>
        <td style="text-align:center;padding:6px 10px">${r.n}</td>
        <td style="text-align:right;padding:6px 10px;color:#059669;font-weight:bold">${fmtN(r.total)}</td>
      </tr>`).join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">Account Report</h1>
          <p style="margin:4px 0 0;font-size:11pt">${report.term?.session_name||''} — ${report.term?.name||''}</p>
        </div>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">By Class</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Class</th>
            <th style="text-align:right;padding:7px 10px">Billed</th>
            <th style="text-align:right;padding:7px 10px">Paid</th>
            <th style="text-align:right;padding:7px 10px">Balance</th>
          </tr></thead>
          <tbody>${classRows}</tbody>
          <tfoot><tr style="background:#f9fafb;font-weight:bold;border-top:2px solid #d1d5db">
            <td style="padding:6px 10px">TOTAL</td>
            <td style="text-align:right;padding:6px 10px">${fmtN(grandTotalBilled)}</td>
            <td style="text-align:right;padding:6px 10px;color:#059669">${fmtN(grandTotalPaid)}</td>
            <td style="text-align:right;padding:6px 10px;color:${grandTotalBalance>0?'#dc2626':'#059669'}">${fmtN(grandTotalBalance)}</td>
          </tr></tfoot>
        </table>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">By Payment Method</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Method</th>
            <th style="text-align:center;padding:7px 10px">Transactions</th>
            <th style="text-align:right;padding:7px 10px">Total</th>
          </tr></thead>
          <tbody>${methodRows}</tbody>
        </table>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error('Print failed: ' + e.message) }
    finally { setPrinting(false) }
  }

  return (
    <div>
      <PageHeader
        title="Account Report"
        subtitle="Financial summary by fee item, class, and payment method."
        actions={
          report && (
            <div className="flex gap-2">
              <button className="btn-secondary btn btn-sm" onClick={exportReport}><Download size={14} /> Export</button>
              <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
                {printing ? <Loader size={14} className="animate-spin"/> : <Printer size={14}/>} Print
              </button>
            </div>
          )
        }
      />

      {/* Filters */}
      <div className="card mb-5 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-36">
          <label className="form-label flex items-center gap-1">
            <Filter size={12} className="text-gray-400" /> Session
          </label>
          <select className="form-select" value={selSession} onChange={e => setSelSession(e.target.value)}>
            <option value="">All Sessions</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-36">
          <label className="form-label">Term</label>
          <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
            <option value="">All Terms</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button className="btn-primary btn" onClick={loadReport} disabled={loading}>
          <BarChart2 size={15} /> {loading ? 'Loading…' : 'Generate Report'}
        </button>
      </div>

      {loading && <Spinner />}

      {report && !loading && (
        <div className="space-y-5">
          {/* Grand summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card-sm text-center bg-blue-50 border-blue-200">
              <p className="text-xs text-blue-500 uppercase tracking-wide">Total Billed</p>
              <p className="text-2xl font-bold text-blue-800 mt-1">{fmt(grandTotalBilled)}</p>
            </div>
            <div className="card-sm text-center bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-500 uppercase tracking-wide">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{fmt(grandTotalPaid)}</p>
            </div>
            <div className="card-sm text-center bg-red-50 border-red-200">
              <p className="text-xs text-red-500 uppercase tracking-wide">Outstanding</p>
              <p className="text-2xl font-bold text-red-800 mt-1">{fmt(grandTotalBalance)}</p>
            </div>
          </div>

          {/* By fee item */}
          <ReportTable
            title="Breakdown by Fee Item"
            columns={[
              { key: 'fee_item',      label: 'Fee Item' },
              { key: 'student_count', label: 'Students',     right: true, render: v => v },
              { key: 'total_billed',  label: 'Total Billed', right: true, render: v => fmt(v) },
            ]}
            rows={report.byFeeItem}
            totals={[
              { value: 'TOTAL' },
              { value: report.byFeeItem.reduce((s,r) => s + r.student_count, 0), right: true },
              { value: fmt(report.byFeeItem.reduce((s,r) => s + Number(r.total_billed), 0)), right: true },
            ]}
          />

          {/* By class */}
          <ReportTable
            title="Breakdown by Class"
            columns={[
              { key: 'class_name',  label: 'Class' },
              { key: 'total_billed',label: 'Total Billed',    right: true, render: v => fmt(v) },
              { key: 'total_paid',  label: 'Total Collected', right: true, render: v => fmt(v) },
              { key: 'balance',     label: 'Balance',         right: true,
                render: (_, row) => (
                  <span className={Number(row.total_billed) - Number(row.total_paid) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {fmt(Number(row.total_billed) - Number(row.total_paid))}
                  </span>
                )
              },
              { key: 'pct', label: 'Rate', right: true,
                render: (_, row) => {
                  const pct = Number(row.total_billed) > 0
                    ? Math.round((Number(row.total_paid) / Number(row.total_billed)) * 100) : 0
                  return (
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8">{pct}%</span>
                    </div>
                  )
                }
              },
            ]}
            rows={report.byClass}
            totals={[
              { value: 'TOTAL' },
              { value: fmt(grandTotalBilled), right: true },
              { value: fmt(grandTotalPaid), right: true },
              { value: fmt(grandTotalBalance), right: true },
              { value: `${grandTotalBilled > 0 ? Math.round((grandTotalPaid/grandTotalBilled)*100) : 0}%`, right: true },
            ]}
          />

          {/* By payment method */}
          <ReportTable
            title="Breakdown by Payment Method"
            columns={[
              { key: 'payment_method', label: 'Method',
                render: v => <span className="badge-blue badge uppercase">{v}</span> },
              { key: 'count', label: 'Transactions', right: true },
              { key: 'total', label: 'Total (₦)',    right: true, render: v => fmt(v) },
            ]}
            rows={report.byMethod}
            totals={[
              { value: 'TOTAL' },
              { value: report.byMethod.reduce((s,r) => s + r.count, 0), right: true },
              { value: fmt(report.byMethod.reduce((s,r) => s + Number(r.total), 0)), right: true },
            ]}
          />
        </div>
      )}

      {!report && !loading && (
        <div className="card text-center py-14">
          <BarChart2 size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select a term and click Generate Report</p>
        </div>
      )}
    </div>
  )
}
