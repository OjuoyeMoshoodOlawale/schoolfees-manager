import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { TrendingUp, Download, Printer, Loader } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { printCleanHtml } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'

const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
const METHOD_COLORS = { cash: 'bg-emerald-100 text-emerald-700', transfer: 'bg-blue-100 text-blue-700', pos: 'bg-purple-100 text-purple-700', cheque: 'bg-gray-100 text-gray-600' }

export default function CollectionSummaryPage() {
  const { fmt } = useAuth()
  const [data,    setData]    = useState(null)
  const [days,    setDays]    = useState(30)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await window.api.getCollectionSummary({ days })
      setData(r)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const exportData = async () => {
    const rows = (data?.daily || []).flatMap(d =>
      Object.entries(d.methods).map(([method, total]) => ({
        Date: d.day, Method: method, Transactions: d.transactions, 'Total (₦)': total
      }))
    )
    await exportToExcel(rows, 'collection_summary')
    toast.success('Exported')
  }


  const handlePrint = async () => {
    if (!data) return
    setPrinting(true)
    try {
      const sym = '₦'
      const fmtN = n => sym + Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:2})
      const dayRows = (data.dailyTrend||[]).map(d => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:5px 10px">${d.date}</td>
        <td style="text-align:center;padding:5px 10px">${d.count}</td>
        <td style="text-align:right;padding:5px 10px;font-weight:bold">${fmtN(d.total)}</td>
      </tr>`).join('')
      const methodRows = (data.methodBreakdown||[]).map(m => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:5px 10px;text-transform:uppercase;font-weight:600">${m.payment_method}</td>
        <td style="text-align:center;padding:5px 10px">${m.n}</td>
        <td style="text-align:right;padding:5px 10px;font-weight:bold">${fmtN(m.total)}</td>
      </tr>`).join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">Collection Summary</h1>
          <p style="margin:4px 0 0;font-size:11pt">Last ${days} days</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          ${[['Total Collected',fmtN(data.totalCollected||0)],['Transactions',data.transactionCount||0],['Daily Average',fmtN(data.dailyAverage||0)]]
            .map(([l,v])=>`<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center">
              <p style="font-size:9pt;color:#6b7280;margin:0">${l}</p>
              <p style="font-size:13pt;font-weight:bold;margin:3px 0 0">${v}</p></div>`).join('')}
        </div>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">By Payment Method</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Method</th>
            <th style="text-align:center;padding:7px 10px">Transactions</th>
            <th style="text-align:right;padding:7px 10px">Total</th>
          </tr></thead><tbody>${methodRows}</tbody>
        </table>
        <h2 style="font-size:11pt;font-weight:bold;margin:0 0 8px">Daily Trend</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Date</th>
            <th style="text-align:center;padding:7px 10px">Transactions</th>
            <th style="text-align:right;padding:7px 10px">Total</th>
          </tr></thead><tbody>${dayRows}</tbody>
        </table>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error('Print failed: ' + e.message) }
    finally { setPrinting(false) }
  }

  return (
    <div>
      <PageHeader
        title="Collection Summary"
        subtitle="Daily cash collected by payment method"
        actions={
          <div className="flex gap-2">
            <select className="form-select text-sm w-36" value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            {data && <button className="btn-secondary btn btn-sm" onClick={exportData}><Download size={14}/> Export</button>}
          </div>
        }
      />

      {loading ? <Spinner /> : !data ? (
        <div className="card text-center py-12 text-gray-400">No active term set.</div>
      ) : (
        <div className="space-y-5">
          {/* Grand total */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Collected This Term</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{fmt(data.grandTotal)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Days Shown</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{days}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Active Days</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{data.daily.length}</p>
            </div>
          </div>

          {/* Daily breakdown */}
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Daily Breakdown</h3>
            </div>
            {data.daily.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No payments in this period</div>
            ) : (
              <table className="data-table">
                <thead><tr>
                  <th>Date</th><th className="text-right">Transactions</th>
                  <th>Methods</th><th className="text-right">Total</th>
                </tr></thead>
                <tbody>
                  {data.daily.map(d => (
                    <tr key={d.day}>
                      <td className="font-medium">{fmtDay(d.day)}</td>
                      <td className="text-right">{d.transactions}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(d.methods).map(([m, t]) => (
                            <span key={m} className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[m] || 'bg-gray-100 text-gray-600'}`}>
                              {m}: {fmt(t)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right font-bold text-emerald-700">{fmt(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top payers */}
          {data.topStudents.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Top Payers This Term</h3>
              </div>
              <table className="data-table">
                <thead><tr><th>Student</th><th>Reg No</th><th>Class</th><th className="text-right">Total Paid</th></tr></thead>
                <tbody>
                  {data.topStudents.map((s, i) => (
                    <tr key={i}>
                      <td className="font-medium">{s.last_name} {s.first_name}</td>
                      <td className="font-mono text-xs">{s.reg_number}</td>
                      <td>{s.class_name || '—'}</td>
                      <td className="text-right font-bold text-emerald-700">{fmt(s.total_paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
