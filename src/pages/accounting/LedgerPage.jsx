import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { BookMarked, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fmtDate, todayISO } from '../../lib/utils'

export default function LedgerPage() {
  const { fmt } = useAuth()
  const [ledger, setLedger]   = useState([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]   = useState(todayISO())
  const [expanded, setExpanded] = useState({})

  const load = async () => {
    setLoading(true)
    const data = await window.api.getLedger({ from_date: fromDate || undefined, to_date: toDate || undefined })
    setLedger(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const handleExport = async () => {
    const rows = ledger.flatMap(a => [
      { Account: a.code + ' — ' + a.name, Date: '', Reference: '', Description: '', Debit: '', Credit: '' },
      ...a.lines.map(l => ({ Account: '', Date: fmtDate(l.entry_date), Reference: l.reference, Description: l.description, Debit: l.debit || 0, Credit: l.credit || 0 })),
      { Account: 'Total ' + a.name, Date: '', Reference: '', Description: '', Debit: a.totalDebit, Credit: a.totalCredit },
      {}
    ])
    await exportToExcel(rows, 'general_ledger')
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader
        title="General Ledger"
        subtitle="All transactions grouped by account."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={handleExport} disabled={!ledger.length}><Download size={14} /> Export</button>
          </div>
        }
      />

      {/* Date filter */}
      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="form-label">From Date</label>
          <input type="date" className="form-input w-44" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="form-label">To Date</label>
          <input type="date" className="form-input w-44" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <button className="btn-primary btn" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Generate Ledger'}
        </button>
      </div>

      {loading && <Spinner />}

      {!loading && (
        <div className="space-y-3">
          {ledger.length === 0
            ? <div className="card text-center py-10 text-gray-400">No transactions found for this period</div>
            : ledger.map(account => (
              <div key={account.id} className="card overflow-hidden p-0">
                <button
                  className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition text-left"
                  onClick={() => toggle(account.id)}
                >
                  {expanded[account.id] ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  <span className="font-mono text-xs text-gray-500 w-14 flex-shrink-0">{account.code}</span>
                  <span className="font-semibold text-gray-900 flex-1">{account.name}</span>
                  <span className="text-xs text-gray-400">{account.lines.length} entries</span>
                  <span className="text-sm font-semibold text-gray-700 ml-4">Dr: {fmt(account.totalDebit)}</span>
                  <span className="text-sm font-semibold text-gray-700 ml-3">Cr: {fmt(account.totalCredit)}</span>
                </button>

                {expanded[account.id] && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Reference</th>
                        <th className="text-left px-4 py-2">Description</th>
                        <th className="text-right px-4 py-2">Debit</th>
                        <th className="text-right px-4 py-2">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.lines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500 text-xs">{fmtDate(l.entry_date)}</td>
                          <td className="px-4 py-2 font-mono text-xs text-blue-600">{l.reference}</td>
                          <td className="px-4 py-2 text-gray-700">{l.description}</td>
                          <td className="px-4 py-2 text-right font-medium">{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                          <td className="px-4 py-2 text-right font-medium">{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-sm">
                        <td colSpan={3} className="px-4 py-2">Total</td>
                        <td className="px-4 py-2 text-right text-emerald-700">{fmt(account.totalDebit)}</td>
                        <td className="px-4 py-2 text-right text-blue-700">{fmt(account.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
