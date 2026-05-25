import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Scale, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function TrialBalancePage() {
  const { fmt } = useAuth()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getTrialBalance().then(d => { setData(d); setLoading(false) })
  }, [])

  const handleExport = async () => {
    if (!data) return
    const rows = data.accounts.map(a => ({
      Code: a.code, Account: a.name, Type: a.type, Group: a.account_group,
      'Debit (₦)': a.total_debit, 'Credit (₦)': a.total_credit
    }))
    rows.push({}, { Code: 'TOTAL', Account: '', Type: '', Group: '',
      'Debit (₦)': data.totalDebit, 'Credit (₦)': data.totalCredit })
    await exportToExcel(rows, 'trial_balance')
    toast.success('Exported')
  }

  if (loading) return <Spinner />

  const typeGroups = ['asset','liability','equity','income','expense']

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Trial Balance"
        subtitle="Summary of all account debits and credits."
        actions={
          <div className="flex items-center gap-3">
            {data && (
              <div className={`flex items-center gap-2 text-sm font-medium ${data.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {data.balanced ? 'Balanced' : 'Not balanced'}
              </div>
            )}
            <button className="btn-secondary btn btn-sm" onClick={handleExport} disabled={!data}><Download size={14} /> Export</button>
          </div>
        }
      />

      {data && (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th className="text-right">Debit (₦)</th>
                <th className="text-right">Credit (₦)</th>
              </tr>
            </thead>
            <tbody>
              {typeGroups.map(type => {
                const group = data.accounts.filter(a => a.type === type)
                if (!group.length) return null
                return [
                  <tr key={`h-${type}`} className="bg-gray-50">
                    <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">{type}</td>
                  </tr>,
                  ...group.map(a => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs text-gray-500">{a.code}</td>
                      <td className="font-medium">{a.name}</td>
                      <td><span className="text-xs text-gray-400 capitalize">{a.type}</span></td>
                      <td className="text-right">{a.total_debit > 0 ? fmt(a.total_debit) : '—'}</td>
                      <td className="text-right">{a.total_credit > 0 ? fmt(a.total_credit) : '—'}</td>
                    </tr>
                  ))
                ]
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-900 text-white font-bold">
                <td colSpan={3} className="px-4 py-3">TOTAL</td>
                <td className={`text-right px-4 py-3 ${data.balanced ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(data.totalDebit)}</td>
                <td className={`text-right px-4 py-3 ${data.balanced ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(data.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
