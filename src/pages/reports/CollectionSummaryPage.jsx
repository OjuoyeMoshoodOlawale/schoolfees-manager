import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { TrendingUp, Download } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
const METHOD_COLORS = { cash: 'bg-emerald-100 text-emerald-700', transfer: 'bg-blue-100 text-blue-700', pos: 'bg-purple-100 text-purple-700', cheque: 'bg-gray-100 text-gray-600' }

export default function CollectionSummaryPage() {
  const { fmt } = useAuth()
  const [data,    setData]    = useState(null)
  const [days,    setDays]    = useState(30)
  const [loading, setLoading] = useState(true)

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
