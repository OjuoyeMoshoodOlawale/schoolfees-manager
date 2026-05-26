import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { BarChart2, Printer, Loader, RefreshCw } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { printCleanHtml, todayISO } from '../../lib/utils'

function firstDayOfMonth() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0,10)
}

export default function ExpenseReportPage() {
  const { fmt } = useAuth()
  const [report,    setReport]   = useState(null)
  const [loading,   setLoading]  = useState(false)
  const [printing,  setPrinting] = useState(false)
  const [fromDate,  setFromDate] = useState(firstDayOfMonth())
  const [toDate,    setToDate]   = useState(todayISO())

  const load = async () => {
    setLoading(true)
    try { setReport(await window.api.expensesReport({ from_date: fromDate, to_date: toDate })) }
    catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handlePrint = async () => {
    if (!report) return
    setPrinting(true)
    try {
      const school = await window.api.getSettings()
      const sym    = school.currency_symbol || '₦'
      const fmtN   = n => sym + Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2})

      const catRows = report.byCategory.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 10px">${r.category}</td>
        <td style="text-align:center;padding:6px 10px">${r.n}</td>
        <td style="text-align:right;padding:6px 10px;font-weight:bold;color:#dc2626">${fmtN(r.total)}</td>
      </tr>`).join('')

      const supRows = report.bySupplier.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 10px">${r.supplier}</td>
        <td style="text-align:center;padding:6px 10px">${r.n}</td>
        <td style="text-align:right;padding:6px 10px;font-weight:bold">${fmtN(r.total)}</td>
      </tr>`).join('')

      const html = `<div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">${school.school_name||'School'}</h1>
          <p style="margin:4px 0 0;font-size:12pt;font-weight:bold">Expense Report</p>
          <p style="margin:2px 0 0;font-size:10pt;color:#6b7280">${fromDate} to ${toDate}</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          ${[
            ['Total Paid',     fmtN(report.totalPaid),     '#15803d'],
            ['Total Approved', fmtN(report.totalApproved), '#1d4ed8'],
            ['Pending (Draft)',fmtN(report.totalDraft),    '#92400e'],
          ].map(([l,v,c])=>`<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center">
            <p style="font-size:9pt;color:#6b7280;margin:0">${l}</p>
            <p style="font-size:14pt;font-weight:bold;margin:3px 0 0;color:${c}">${v}</p>
          </div>`).join('')}
        </div>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">By Category</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Category</th>
            <th style="text-align:center;padding:7px 10px">Count</th>
            <th style="text-align:right;padding:7px 10px">Total</th>
          </tr></thead>
          <tbody>${catRows}</tbody>
          <tfoot><tr style="background:#f9fafb;font-weight:bold;border-top:2px solid #d1d5db">
            <td style="padding:6px 10px">TOTAL</td>
            <td style="text-align:center;padding:6px 10px">${report.totalCount}</td>
            <td style="text-align:right;padding:6px 10px;color:#dc2626">${fmtN(report.totalApproved)}</td>
          </tr></tfoot>
        </table>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">Top Suppliers</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Supplier</th>
            <th style="text-align:center;padding:7px 10px">Count</th>
            <th style="text-align:right;padding:7px 10px">Total</th>
          </tr></thead>
          <tbody>${supRows}</tbody>
        </table>
        <p style="margin-top:12px;font-size:9pt;color:#9ca3af">Generated ${new Date().toLocaleDateString('en-NG')}</p>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error(e.message) }
    finally { setPrinting(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Expense Report" subtitle="Spending summary by category, status, and supplier"
        actions={report && (
          <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
            {printing?<Loader size={14} className="animate-spin"/>:<Printer size={14}/>} Print
          </button>
        )}
      />

      {/* Filters */}
      <div className="card flex flex-wrap gap-4 items-end py-3">
        <div>
          <label className="form-label">From</label>
          <input className="form-input w-36" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/>
        </div>
        <div>
          <label className="form-label">To</label>
          <input className="form-input w-36" type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading?<Loader size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Run Report
        </button>
      </div>

      {loading && <div className="py-10"><Spinner/></div>}

      {report && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Total Paid',      fmt(report.totalPaid),     'text-emerald-700'],
              ['Total Approved',  fmt(report.totalApproved), 'text-blue-700'],
              ['Draft (Pending)', fmt(report.totalDraft),    'text-orange-700'],
              ['Expense Count',   report.totalCount,          'text-gray-800'],
            ].map(([l,v,c]) => (
              <div key={l} className="card py-4 px-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{l}</p>
                <p className={`text-2xl font-bold mt-1 ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* By Category */}
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">By Category</h3>
              </div>
              <table className="data-table">
                <thead><tr>
                  <th>Category</th><th className="text-center">Count</th><th className="text-right">Total</th>
                  <th className="text-right">% of Spend</th>
                </tr></thead>
                <tbody>
                  {report.byCategory.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-gray-400 py-6">No data</td></tr>
                  )}
                  {report.byCategory.map(r => {
                    const pct = report.totalApproved > 0 ? Math.round((r.total/report.totalApproved)*100) : 0
                    return (
                      <tr key={r.category}>
                        <td className="font-medium">{r.category}</td>
                        <td className="text-center text-gray-500">{r.n}</td>
                        <td className="text-right font-bold text-red-600">{fmt(r.total)}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{width:`${pct}%`}}/>
                            </div>
                            <span className="text-xs w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold border-t-2">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="text-center px-4 py-2">{report.totalCount}</td>
                    <td className="text-right px-4 py-2 text-red-700">{fmt(report.totalApproved)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* By Supplier */}
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">Top Suppliers</h3>
              </div>
              <table className="data-table">
                <thead><tr>
                  <th>Supplier</th><th className="text-center">Count</th><th className="text-right">Total</th>
                </tr></thead>
                <tbody>
                  {report.bySupplier.length === 0 && (
                    <tr><td colSpan={3} className="text-center text-gray-400 py-6">No data</td></tr>
                  )}
                  {report.bySupplier.map(r => (
                    <tr key={r.supplier}>
                      <td className="font-medium">{r.supplier}</td>
                      <td className="text-center text-gray-500">{r.n}</td>
                      <td className="text-right font-bold">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Status breakdown */}
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">By Status</h3>
              </div>
              <table className="data-table">
                <thead><tr><th>Status</th><th className="text-center">Count</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {report.byStatus.map(r => (
                    <tr key={r.status}>
                      <td><span className={`badge ${r.status==='paid'?'badge-green':r.status==='approved'?'badge-blue':r.status==='rejected'?'badge-red':'badge-gray'}`}>{r.status}</span></td>
                      <td className="text-center">{r.n}</td>
                      <td className="text-right font-bold">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
