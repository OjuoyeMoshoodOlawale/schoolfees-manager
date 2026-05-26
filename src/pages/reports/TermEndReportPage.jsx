import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { FileText, Download, Loader } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { printCleanHtml } from '../../lib/utils'

export default function TermEndReportPage() {
  const { fmt } = useAuth()
  const [sessions, setSessions] = useState([])
  const [terms,    setTerms]    = useState([])
  const [selSess,  setSelSess]  = useState('')
  const [selTerm,  setSelTerm]  = useState('')
  const [report,   setReport]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [printing, setPrinting] = useState(false)

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
    if (selSess) window.api.listTerms(Number(selSess)).then(t => { setTerms(t); })
  }, [selSess])

  const load = async () => {
    if (!selTerm) return
    setLoading(true)
    try { setReport(await window.api.getTermEndReport({ term_id: Number(selTerm) })) }
    catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const exportData = async () => {
    const rows = report.classSummaries.map(c => ({
      Class: c.class_name, Enrolled: c.enrolled,
      'Total Billed': c.billed, 'Total Paid': c.paid,
      'Balance': c.balance, 'Rate %': c.pct,
      'Fully Paid': c.fully_paid, 'Defaulters': c.defaulters
    }))
    await exportToExcel(rows, `term_end_${report.term?.name}`)
    toast.success('Exported')
  }

  const handlePrint = async () => {
    if (!report) return
    setPrinting(true)
    try {
      const classRows = report.classSummaries.map(c => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:6px 12px">${c.class_name}</td>
          <td style="text-align:center;padding:6px 12px">${c.enrolled}</td>
          <td style="text-align:right;padding:6px 12px">₦${c.billed.toLocaleString()}</td>
          <td style="text-align:right;padding:6px 12px;color:#059669">₦${c.paid.toLocaleString()}</td>
          <td style="text-align:right;padding:6px 12px;color:${c.balance>0?'#dc2626':'#059669'}">₦${c.balance.toLocaleString()}</td>
          <td style="text-align:center;padding:6px 12px;font-weight:bold">${c.pct}%</td>
          <td style="text-align:center;padding:6px 12px">${c.defaulters}</td>
        </tr>`).join('')

      const methodRows = report.methodBreakdown.map(m => {
        const pct = report.totalPaid > 0 ? Math.round((Number(m.total) / report.totalPaid) * 100) : 0
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:6px 12px;font-weight:600;text-transform:uppercase">${m.payment_method}</td>
          <td style="text-align:center;padding:6px 12px">${m.n}</td>
          <td style="text-align:right;padding:6px 12px;color:#059669;font-weight:bold">₦${Number(m.total).toLocaleString()}</td>
          <td style="text-align:right;padding:6px 12px">${pct}%</td>
        </tr>`
      }).join('')

      const methodGrandTotal = report.methodBreakdown.reduce((s,m)=>s+Number(m.total),0)
      const recon = report.reconciliation
      const reconHtml = recon && !recon.ok
        ? `<div style="margin-top:16px;padding:10px 14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;color:#b91c1c;font-size:10pt">
            ⚠ <strong>Reconciliation Mismatch:</strong> Class totals show ₦${recon.classTotalPaid.toLocaleString()} but method totals show ₦${recon.methodTotalPaid.toLocaleString()} (diff: ₦${recon.diff.toLocaleString()}). Check Payment Audit report.
           </div>`
        : `<div style="margin-top:8px;font-size:9pt;color:#059669">✓ Reconciled — class totals and method totals match</div>`

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px">
          <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
            <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">Term End Report</h1>
            <p style="margin-top:6px;font-size:11pt">${report.term?.session_name} — ${report.term?.name}</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
            ${[
              ['Total Billed', '₦'+report.totalBilled.toLocaleString()],
              ['Total Collected', '₦'+report.totalPaid.toLocaleString()],
              ['Outstanding', '₦'+report.balance.toLocaleString()],
              ['Collection Rate', report.collectionPct+'%'],
            ].map(([l,v]) => `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
              <p style="font-size:9pt;color:#6b7280;margin:0">${l}</p>
              <p style="font-size:14pt;font-weight:bold;margin:4px 0 0">${v}</p>
            </div>`).join('')}
          </div>
          <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px;color:#374151">By Class</h2>
          <table style="width:100%;border-collapse:collapse;font-size:11pt">
            <thead><tr style="background:#1e293b;color:white">
              <th style="text-align:left;padding:8px 12px">Class</th>
              <th style="text-align:center;padding:8px 12px">Students</th>
              <th style="text-align:right;padding:8px 12px">Billed</th>
              <th style="text-align:right;padding:8px 12px">Paid</th>
              <th style="text-align:right;padding:8px 12px">Balance</th>
              <th style="text-align:center;padding:8px 12px">Rate</th>
              <th style="text-align:center;padding:8px 12px">Defaulters</th>
            </tr></thead>
            <tbody>${classRows}</tbody>
            <tfoot><tr style="background:#f9fafb;font-weight:bold;border-top:2px solid #d1d5db">
              <td style="padding:6px 12px">TOTAL</td>
              <td style="text-align:center;padding:6px 12px">${report.totalStudents}</td>
              <td style="text-align:right;padding:6px 12px">₦${report.totalBilled.toLocaleString()}</td>
              <td style="text-align:right;padding:6px 12px;color:#059669">₦${report.totalPaid.toLocaleString()}</td>
              <td style="text-align:right;padding:6px 12px;color:#dc2626">₦${report.balance.toLocaleString()}</td>
              <td style="text-align:center;padding:6px 12px">${report.collectionPct}%</td>
              <td style="text-align:center;padding:6px 12px;color:#dc2626">${report.totalDefaulters}</td>
            </tr></tfoot>
          </table>
          <h2 style="font-size:11pt;font-weight:bold;margin:20px 0 8px;color:#374151">By Payment Method</h2>
          <table style="width:100%;border-collapse:collapse;font-size:11pt">
            <thead><tr style="background:#1e293b;color:white">
              <th style="text-align:left;padding:8px 12px">Method</th>
              <th style="text-align:center;padding:8px 12px">Transactions</th>
              <th style="text-align:right;padding:8px 12px">Total Collected</th>
              <th style="text-align:right;padding:8px 12px">% of Collections</th>
            </tr></thead>
            <tbody>${methodRows}</tbody>
            <tfoot><tr style="background:#f9fafb;font-weight:bold;border-top:2px solid #d1d5db">
              <td style="padding:6px 12px">TOTAL</td>
              <td style="text-align:center;padding:6px 12px">${report.methodBreakdown.reduce((s,m)=>s+m.n,0)}</td>
              <td style="text-align:right;padding:6px 12px;color:#059669">₦${methodGrandTotal.toLocaleString()}</td>
              <td></td>
            </tr></tfoot>
          </table>
          ${reconHtml}
        </div>`
      await printCleanHtml(html)
    } finally { setPrinting(false) }
  }

  return (
    <div>
      <PageHeader title="Term End Report" subtitle="Complete fee collection summary for a term"
        actions={report && (
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={exportData}><Download size={14}/> Export</button>
            <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
              {printing ? 'Printing…' : '🖨 Print'}
            </button>
          </div>
        )}
      />

      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-40">
          <label className="form-label">Session</label>
          <select className="form-select" value={selSess} onChange={e => setSelSess(e.target.value)}>
            <option value="">— Session —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="form-label">Term</label>
          <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)}>
            <option value="">— Term —</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button className="btn-primary btn" onClick={load} disabled={loading || !selTerm}>
          {loading ? <><Loader size={15} className="animate-spin"/> Loading…</> : <><FileText size={15}/> Generate</>}
        </button>
      </div>

      {loading ? <Spinner/> : report && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Billed',    value: fmt(report.totalBilled),    color: 'text-gray-900' },
              { label: 'Total Collected', value: fmt(report.totalPaid),      color: 'text-emerald-700' },
              { label: 'Outstanding',     value: fmt(report.balance),        color: 'text-red-700' },
              { label: 'Collection Rate', value: `${report.collectionPct}%`, color: report.collectionPct>=70?'text-emerald-700':report.collectionPct>=40?'text-amber-700':'text-red-700' },
            ].map(m => (
              <div key={m.label} className="card py-3 px-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{m.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-700">By Class — {report.term?.session_name} {report.term?.name}</h3>
            </div>
            <table className="data-table">
              <thead><tr>
                <th>Class</th><th className="text-center">Students</th>
                <th className="text-right">Billed</th><th className="text-right">Paid</th>
                <th className="text-right">Balance</th><th className="text-center">Rate</th>
                <th className="text-center">Fully Paid</th><th className="text-center">Defaulters</th>
              </tr></thead>
              <tbody>
                {report.classSummaries.map(c => (
                  <tr key={c.class_name}>
                    <td className="font-semibold">{c.class_name}</td>
                    <td className="text-center">{c.enrolled}</td>
                    <td className="text-right">{fmt(c.billed)}</td>
                    <td className="text-right text-emerald-700 font-semibold">{fmt(c.paid)}</td>
                    <td className={`text-right font-bold ${c.balance>0?'text-red-600':'text-emerald-600'}`}>{fmt(c.balance)}</td>
                    <td className="text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.pct>=80?'bg-emerald-500':c.pct>=50?'bg-amber-400':'bg-red-500'}`} style={{width:`${Math.min(c.pct,100)}%`}}/>
                        </div>
                        <span className="text-xs font-bold">{c.pct}%</span>
                      </div>
                    </td>
                    <td className="text-center text-emerald-700 font-semibold">{c.fully_paid}</td>
                    <td className={`text-center font-semibold ${c.defaulters>0?'text-red-600':'text-gray-400'}`}>{c.defaulters}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td className="px-4 py-2">TOTAL</td>
                  <td className="text-center px-4 py-2">{report.totalStudents}</td>
                  <td className="text-right px-4 py-2">{fmt(report.totalBilled)}</td>
                  <td className="text-right px-4 py-2 text-emerald-700">{fmt(report.totalPaid)}</td>
                  <td className="text-right px-4 py-2 text-red-700">{fmt(report.balance)}</td>
                  <td className="text-center px-4 py-2">{report.collectionPct}%</td>
                  <td></td>
                  <td className="text-center px-4 py-2 text-red-700">{report.totalDefaulters}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Reconciliation alert ── */}
          {report.reconciliation && !report.reconciliation.ok && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-5 py-4 flex gap-3 items-start">
              <span className="text-red-500 text-xl mt-0.5">⚠</span>
              <div>
                <p className="font-bold text-red-700 text-sm">Reconciliation Mismatch Detected</p>
                <p className="text-red-600 text-sm mt-0.5">
                  Class totals show <strong>{fmt(report.reconciliation.classTotalPaid)}</strong> collected,
                  but payment method totals show <strong>{fmt(report.reconciliation.methodTotalPaid)}</strong>.
                  Difference: <strong>{fmt(report.reconciliation.diff)}</strong>.
                  This usually means a student has payments in this term but no class record — check the Payment Audit report.
                </p>
              </div>
            </div>
          )}

          {/* ── By Payment Method (summary) ── */}
          {report.methodBreakdown.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">By Payment Method</h3>
                {report.reconciliation?.ok && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <span>✓</span> Reconciled — totals match
                  </span>
                )}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th className="text-right">Transactions</th>
                    <th className="text-right">Total Collected</th>
                    <th className="text-right">% of Collections</th>
                  </tr>
                </thead>
                <tbody>
                  {report.methodBreakdown.map(m => {
                    const pct = report.totalPaid > 0 ? Math.round((Number(m.total) / report.totalPaid) * 100) : 0
                    return (
                      <tr key={m.payment_method}>
                        <td><span className="badge-blue badge uppercase">{m.payment_method}</span></td>
                        <td className="text-right">{m.n}</td>
                        <td className="text-right font-bold text-emerald-700">{fmt(m.total)}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{width:`${pct}%`}}/>
                            </div>
                            <span className="text-xs font-semibold w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="text-right px-4 py-2">{report.methodBreakdown.reduce((s,m)=>s+m.n,0)}</td>
                    <td className="text-right px-4 py-2 text-emerald-700">{fmt(report.methodBreakdown.reduce((s,m)=>s+Number(m.total),0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── Method × Class cross-tab ── */}
          {report.methodByClass?.length > 0 && (() => {
            // build unique methods and classes from the data
            const methods  = [...new Set(report.methodByClass.map(r => r.payment_method))]
            const classes  = [...new Map(report.classSummaries.map(c => [c.class_name, c])).values()]
            // lookup: method+class_name → total
            const lookup = {}
            report.methodByClass.forEach(r => { lookup[`${r.payment_method}||${r.class_name}`] = r })

            return (
              <div className="card overflow-hidden p-0">
                <div className="px-5 py-3 bg-gray-50 border-b">
                  <h3 className="text-sm font-semibold text-gray-700">Payment Method × Class Breakdown</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Each cell = amount collected via that method from that class. Row totals must match "By Payment Method" above.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th className="text-left">Method</th>
                        {classes.map(c => <th key={c.class_name} className="text-right whitespace-nowrap">{c.class_name}</th>)}
                        <th className="text-right bg-gray-100">Row Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {methods.map(method => {
                        const rowTotal = classes.reduce((s,c) => s + Number(lookup[`${method}||${c.class_name}`]?.total || 0), 0)
                        return (
                          <tr key={method}>
                            <td><span className="badge-blue badge uppercase">{method}</span></td>
                            {classes.map(c => {
                              const cell = lookup[`${method}||${c.class_name}`]
                              return (
                                <td key={c.class_name} className="text-right">
                                  {cell ? (
                                    <span className="font-medium text-emerald-700">{fmt(cell.total)}</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="text-right font-bold bg-gray-50 text-emerald-700">{fmt(rowTotal)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold border-t-2 border-gray-300 text-xs">
                        <td className="px-4 py-2">Col Total</td>
                        {classes.map(c => (
                          <td key={c.class_name} className="text-right px-4 py-2">
                            {fmt(c.paid)}
                          </td>
                        ))}
                        <td className="text-right px-4 py-2 bg-gray-100 text-emerald-700">{fmt(report.totalPaid)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-5 py-2 bg-gray-50 border-t text-xs text-gray-400">
                  💡 Column totals = "By Class" paid amounts. Row totals = "By Payment Method" amounts. Grand total (bottom-right) must match Total Collected above.
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
