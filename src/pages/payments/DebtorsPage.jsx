import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Receipt, Eye } from 'lucide-react'
import { toast } from 'react-toastify'
import { PageHeader, DataTable, SearchInput, Spinner, exportToExcel } from '../../components/ui'

const fmt  = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
const fmtD = d => d ? new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : 'Never'

export default function DebtorsPage() {
  const { fmt } = useAuth()
  const navigate = useNavigate()
  const [debtors, setDebtors]         = useState([])
  const [classes, setClasses]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [currentTerm, setCurrentTerm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, cls, term] = await Promise.all([
      window.api.listDebtors({ class_id: filterClass || undefined }),
      window.api.listClasses(),
      window.api.getCurrentTerm(),
    ])
    setDebtors(data)
    setClasses(cls.filter(c => c.is_active))
    setCurrentTerm(term)
    setLoading(false)
  }, [filterClass])

  useEffect(() => { load() }, [load])

  const filtered = debtors.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${d.first_name} ${d.last_name} ${d.reg_number}`.toLowerCase().includes(q)
  })

  const totalOutstanding = filtered.reduce((s, d) => s + d.balance, 0)
  const totalBilled      = filtered.reduce((s, d) => s + d.total_expected, 0)
  const totalPaid        = filtered.reduce((s, d) => s + d.total_paid, 0)

  const handleExport = async () => {
    const rows = filtered.map(d => ({
      'Student':         `${d.last_name} ${d.first_name}`,
      'Reg No':          d.reg_number,
      'Class':           d.class_name || '',
      'Gender':          d.gender === 'M' ? 'Male' : 'Female',
      'Boarding':        d.boarding_type || 'day',
      'Total Billed (₦)': d.total_expected,
      'Total Paid (₦)':   d.total_paid,
      'Balance (₦)':      d.balance,
      'Last Payment':    d.last_payment_date || 'None',
    }))
    await exportToExcel(rows, 'debtors')
    toast.success(`Exported ${rows.length} debtors to Excel`)
  }

  const getPctColor = (paid, expected) => {
    if (!expected) return 'bg-gray-200'
    const pct = (paid / expected) * 100
    return pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  }

  const columns = [
    {
      key: 'last_name', label: 'Student',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-semibold text-red-700 flex-shrink-0">
            {row.first_name?.[0]}{row.last_name?.[0]}
          </div>
          <div>
            <p className="font-medium text-gray-900">{row.last_name} {row.first_name}</p>
            <p className="text-xs text-gray-400 font-mono">{row.reg_number}</p>
          </div>
        </div>
      )
    },
    {
      key: 'class_name', label: 'Class', width: '80px',
      render: v => <span className="badge-blue badge">{v || '—'}</span>
    },
    {
      key: 'total_expected', label: 'Billed', width: '120px',
      render: v => <span className="text-gray-700">{fmt(v)}</span>
    },
    {
      key: 'total_paid', label: 'Paid', width: '120px',
      render: (v, row) => (
        <div>
          <span className="text-emerald-600 font-medium">{fmt(v)}</span>
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full w-16 overflow-hidden">
            <div className={`h-full rounded-full ${getPctColor(v, row.total_expected)}`}
              style={{ width: `${Math.min(row.total_expected > 0 ? (v/row.total_expected)*100 : 0, 100)}%` }} />
          </div>
        </div>
      )
    },
    {
      key: 'balance', label: 'Balance', width: '130px',
      render: v => <span className="font-bold text-red-600 text-base">{fmt(v)}</span>
    },
    {
      key: 'last_payment_date', label: 'Last Payment', width: '130px',
      render: v => <span className="text-xs text-gray-400">{fmtD(v)}</span>
    },
    {
      key: 'actions', label: '', width: '90px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button title="View bill" className="btn btn-sm text-gray-500 hover:bg-gray-100 border border-gray-200"
            onClick={e => { e.stopPropagation(); navigate(`/billing/student/${row.id}`) }}>
            <Eye size={12} />
          </button>
          <button title="Post payment" className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); navigate(`/payments/new?student=${row.id}`) }}>
            <Receipt size={12} />
          </button>
        </div>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="Debtors"
        subtitle={currentTerm ? `Outstanding balances — ${currentTerm.session_name} · ${currentTerm.name}` : 'Current term'}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={handleExport} disabled={!filtered.length}>
              <Download size={14} /> Export Excel
            </button>
            <button className="btn-primary btn" onClick={() => navigate('/payments/new')}>
              <Receipt size={15} /> Post Payment
            </button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card-sm text-center border-red-200 bg-red-50">
          <p className="text-xs text-red-500 uppercase tracking-wide">Total Debtors</p>
          <p className="text-3xl font-bold text-red-700 mt-1">{filtered.length}</p>
        </div>
        <div className="card-sm text-center border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-500 uppercase tracking-wide">Total Outstanding</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{fmt(totalOutstanding)}</p>
        </div>
        <div className="card-sm text-center border-emerald-200 bg-emerald-50">
          <p className="text-xs text-emerald-500 uppercase tracking-wide">Collection Rate</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch}
          placeholder="Search name or reg number…" className="w-64" />
        <select className="form-select w-44" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <div className="empty-state py-16">
            <AlertTriangle size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="empty-state-title">{debtors.length === 0 ? 'No debtors' : 'No results match your filter'}</p>
            <p className="empty-state-sub">
              {debtors.length === 0 ? 'All students are fully paid up this term!' : 'Try clearing your search or filter'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage="No debtors found"
            onRowClick={row => navigate(`/billing/student/${row.id}`)}
          />
        )}
      </div>

      {/* Totals row */}
      {filtered.length > 0 && (
        <div className="mt-3 flex justify-end gap-8 text-sm px-4">
          <span className="text-gray-500">Total Billed: <strong className="text-gray-900">{fmt(totalBilled)}</strong></span>
          <span className="text-gray-500">Total Paid: <strong className="text-emerald-700">{fmt(totalPaid)}</strong></span>
          <span className="text-gray-500">Total Outstanding: <strong className="text-red-700">{fmt(totalOutstanding)}</strong></span>
        </div>
      )}
    </div>
  )
}
