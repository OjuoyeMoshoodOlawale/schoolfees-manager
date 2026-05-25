import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { BookMarked, Download, Printer } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fmtDate, todayISO } from '../../lib/utils'

export default function AccountStatementPage() {
  const { fmt }   = useAuth()
  const [accounts, setAccounts]     = useState([])
  const [selAccount, setSelAccount] = useState('')
  const [fromDate, setFromDate]     = useState('')
  const [toDate, setToDate]         = useState(todayISO())
  const [statement, setStatement]   = useState(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    window.api.listAccounts().then(a => setAccounts(a.filter(x => x.is_active)))
  }, [])

  const load = async () => {
    if (!selAccount) { toast.error('Select an account'); return }
    setLoading(true)
    try {
      const data = await window.api.getAccountStatement({
        account_id: Number(selAccount),
        from_date: fromDate || undefined,
        to_date:   toDate   || undefined,
      })
      setStatement(data)
    } finally { setLoading(false) }
  }

  const handleExport = async () => {
    if (!statement) return
    const rows = statement.lines.map(l => ({
      Date:        fmtDate(l.entry_date),
      Reference:   l.reference,
      Description: l.description,
      'Debit (₦)':  l.debit  > 0 ? l.debit  : '',
      'Credit (₦)': l.credit > 0 ? l.credit : '',
      'Balance (₦)': l.running_balance,
    }))
    await exportToExcel(rows, `statement_${statement.account.name.replace(/\s+/g,'_')}`)
    toast.success('Exported')
  }

  const handlePrint = () => window.print()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Account Statement"
        subtitle="View running balance for any account."
        actions={
          statement && (
            <div className="flex gap-2">
              <button className="btn-secondary btn btn-sm" onClick={handleExport}>
                <Download size={14} /> Export Excel
              </button>
              <button className="btn-secondary btn btn-sm" onClick={handlePrint}>
                <Printer size={14} /> Print
              </button>
            </div>
          )
        }
      />

      {/* Filters */}
      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-44">
          <label className="form-label">Account</label>
          <select className="form-select" value={selAccount} onChange={e => setSelAccount(e.target.value)}>
            <option value="">— Select account —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">From Date</label>
          <input type="date" className="form-input w-40" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="form-label">To Date</label>
          <input type="date" className="form-input w-40" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <button className="btn-primary btn" onClick={load} disabled={loading || !selAccount}>
          {loading ? 'Loading…' : 'Generate'}
        </button>
      </div>

      {loading && <Spinner />}

      {statement && !loading && (
        <div className="space-y-4" id="print-statement">
          {/* Account header */}
          <div className="card bg-slate-900 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wide">Account Statement</p>
                <h2 className="text-xl font-bold text-white mt-1">
                  {statement.account.code} — {statement.account.name}
                </h2>
                <p className="text-slate-400 text-sm mt-0.5 capitalize">{statement.account.type} · {statement.account.account_group}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">Closing Balance</p>
                <p className={`text-2xl font-bold mt-1 ${statement.closing_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(statement.closing_balance)}
                </p>
                {fromDate && <p className="text-xs text-slate-500 mt-1">{fmtDate(fromDate)} — {fmtDate(toDate)}</p>}
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="card overflow-hidden p-0">
            {statement.lines.length === 0 ? (
              <div className="py-10 text-center text-gray-400">No transactions in this period</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="text-xs text-gray-500">{fmtDate(l.entry_date)}</td>
                      <td className="font-mono text-xs text-blue-600">{l.reference}</td>
                      <td className="text-gray-700">{l.description}</td>
                      <td className="text-right text-red-600">
                        {l.debit > 0 ? fmt(l.debit) : ''}
                      </td>
                      <td className="text-right text-emerald-600">
                        {l.credit > 0 ? fmt(l.credit) : ''}
                      </td>
                      <td className={`text-right font-semibold ${l.running_balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {fmt(l.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-900 text-white font-bold">
                    <td colSpan={3} className="px-4 py-3">Closing Balance</td>
                    <td className="text-right px-4 py-3 text-red-300">
                      {fmt(statement.lines.reduce((s, l) => s + l.debit, 0))}
                    </td>
                    <td className="text-right px-4 py-3 text-emerald-300">
                      {fmt(statement.lines.reduce((s, l) => s + l.credit, 0))}
                    </td>
                    <td className={`text-right px-4 py-3 ${statement.closing_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(statement.closing_balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {!statement && !loading && (
        <div className="card text-center py-14">
          <BookMarked size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select an account and click Generate</p>
        </div>
      )}
    </div>
  )
}
