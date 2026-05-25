import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Receipt, Printer, Trash2, ArrowLeft, Download, Search } from 'lucide-react'
import { PageHeader, DataTable, SearchInput, Confirm, Spinner, exportToExcel } from '../../components/ui'

const fmt  = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
const fmtD = d => d ? new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : '—'

// ── Receipt Print View ────────────────────────────────────────────────────────
function ReceiptView({ data, onClose }) {
  const { fmt } = useAuth()
  const [printMode, setPrintMode] = useState('a4') // a4 | thermal80 | thermal58
  if (!data) return null
  const { payment, school, bills, totalBilled, totalPaid } = data
  const balance = totalBilled - totalPaid

  // Detect thermal width from school settings
  const thermalWidth = school?.thermal_width || '80mm'

  const handlePrint = () => {
    // Add print class based on mode
    document.body.classList.add(`print-${printMode}`)
    window.print()
    setTimeout(() => document.body.classList.remove(`print-${printMode}`), 1000)
  }

  const widthClass = {
    'a4':        'w-full max-w-lg',
    'thermal80': 'w-80',
    'thermal58': 'w-60',
  }[printMode] || 'w-full max-w-lg'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl ${widthClass} max-h-[90vh] overflow-y-auto`}>
        {/* Screen-only controls */}
        <div className="flex items-center justify-between px-4 py-3 border-b no-print bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 text-sm">Receipt Preview</span>
            <select className="form-select text-xs py-1" value={printMode}
              onChange={e => setPrintMode(e.target.value)}>
              <option value="a4">A4 / Full page</option>
              <option value="thermal80">Thermal 80mm</option>
              <option value="thermal58">Thermal 58mm</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary btn btn-sm" onClick={handlePrint}>
              <Printer size={13} /> Print
            </button>
            <button className="btn-secondary btn btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Receipt content — print-ready */}
        <div className={`receipt-content p-5 space-y-3 ${printMode !== 'a4' ? 'text-xs' : 'text-sm'}`}
          style={printMode !== 'a4' ? { fontFamily: 'monospace' } : {}}>

          {/* School header */}
          <div className="text-center pb-3 border-b-2 border-gray-800">
            {school?.logo_path && (
              <img src={`file://${school.logo_path}`} alt="Logo"
                className={`object-contain mx-auto mb-2 ${printMode === 'a4' ? 'w-16 h-16' : 'w-12 h-12'}`}
                onError={e => e.target.style.display='none'} />
            )}
            <h1 className={`font-bold text-gray-900 uppercase ${printMode === 'a4' ? 'text-lg' : 'text-sm'}`}>
              {school?.school_name || 'School Name'}
            </h1>
            {school?.address && <p className="text-gray-500 text-xs mt-0.5">{school.address}</p>}
            {school?.phone && <p className="text-gray-500 text-xs">Tel: {school.phone}</p>}
            <div className="mt-2 border border-gray-800 inline-block px-4 py-0.5">
              <p className="font-bold text-gray-900 uppercase tracking-wider text-xs">Official Fee Receipt</p>
            </div>
          </div>

          {/* Meta rows */}
          <div className="space-y-1">
            {[
              ['Receipt No.',  payment.receipt_number],
              ['Date',         fmtD(payment.payment_date)],
              ['Student',      `${payment.last_name} ${payment.first_name}`],
              ['Reg. No.',     payment.reg_number],
              ['Class',        payment.class_name || '—'],
              ['Term',         `${payment.session_name} — ${payment.term_name}`],
              ['Method',       payment.payment_method?.toUpperCase()],
              ...(payment.reference ? [['Reference', payment.reference]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-gray-100 pb-0.5">
                <span className="text-gray-500 flex-shrink-0">{k}:</span>
                <span className="font-semibold text-gray-900 text-right">{v}</span>
              </div>
            ))}
          </div>

          {/* Fee items */}
          {bills.length > 0 && (
            <div>
              <p className="font-semibold text-gray-600 uppercase tracking-wide text-xs mb-1 border-t border-gray-300 pt-2">
                Fee Schedule This Term
              </p>
              <table className="w-full">
                <tbody>
                  {bills.map((b, i) => (
                    <tr key={i}>
                      <td className="py-0.5 text-gray-700">{b.fee_item_name}</td>
                      <td className="py-0.5 text-right font-medium">{fmt(b.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-400 font-bold">
                    <td className="py-1">Total Billed</td>
                    <td className="py-1 text-right">{fmt(totalBilled)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Payment summary */}
          <div className="border-2 border-gray-800 p-3 space-y-1">
            <div className="flex justify-between font-bold">
              <span>AMOUNT PAID</span>
              <span className={printMode === 'a4' ? 'text-xl' : 'text-base'}>{fmt(payment.amount_paid)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-gray-400 pt-1">
              <span className="text-gray-500">Total Paid (All)</span>
              <span>{fmt(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Balance Outstanding</span>
              <span className={`font-bold ${balance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmt(balance)}
              </span>
            </div>
          </div>

          {/* Bank details */}
          {school?.account_number && (
            <div className="text-center text-xs text-gray-600 border-t border-gray-200 pt-2">
              <p>Bank: <strong>{school.bank_name}</strong></p>
              <p>Account: <strong>{school.account_number}</strong></p>
              {school.account_name && <p>{school.account_name}</p>}
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 border-t border-dashed border-gray-300 pt-2">
            <p>{school?.receipt_footer || 'Thank you for your payment.'}</p>
            <p className="mt-1">Computer-generated · {payment.posted_by} · {payment.created_at?.slice(0,16)}</p>
            {printMode !== 'a4' && <p className="mt-1 border-t border-dashed border-gray-300 pt-1">{'- - - - - - - - - - - - - - -'}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Payments Page ────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const { fmt } = useAuth()
  const { receiptId } = useParams()
  const navigate = useNavigate()
  const [payments, setPayments]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [receiptData, setReceiptData]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    const data = await window.api.listPayments({})
    setPayments(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-open receipt if navigated with receiptId
  useEffect(() => {
    if (receiptId) {
      window.api.getReceiptData(Number(receiptId)).then(d => { if (d) setReceiptData(d) })
    }
  }, [receiptId])

  const openReceipt = async (payment) => {
    const data = await window.api.getReceiptData(payment.id)
    setReceiptData(data)
  }

  const handleDelete = async () => {
    await window.api.deletePayment(deleteTarget.id)
    toast.success('Payment deleted')
    load()
  }

  const handleExport = async () => {
    const rows = filtered.map(p => ({
      'Receipt No':    p.receipt_number,
      'Date':          p.payment_date,
      'Student':       `${p.last_name} ${p.first_name}`,
      'Reg No':        p.reg_number,
      'Class':         p.class_name || '',
      'Term':          p.term_name,
      'Session':       p.session_name,
      'Amount (₦)':    p.amount_paid,
      'Method':        p.payment_method,
      'Reference':     p.reference || '',
      'Posted By':     p.posted_by,
    }))
    await exportToExcel(rows, 'payments')
    toast.success('Exported to Excel')
  }

  const filtered = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${p.first_name} ${p.last_name} ${p.reg_number} ${p.receipt_number}`.toLowerCase().includes(q)
  })

  const totalAmount = filtered.reduce((s, p) => s + Number(p.amount_paid), 0)

  const columns = [
    {
      key: 'receipt_number', label: 'Receipt No.', width: '140px',
      render: v => <span className="font-mono text-xs text-gray-600 font-semibold">{v}</span>
    },
    {
      key: 'payment_date', label: 'Date', width: '110px',
      render: v => <span className="text-sm text-gray-600">{fmtD(v)}</span>
    },
    {
      key: 'last_name', label: 'Student',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.last_name} {row.first_name}</p>
          <p className="text-xs text-gray-400">{row.reg_number} · {row.class_name || '—'}</p>
        </div>
      )
    },
    {
      key: 'amount_paid', label: 'Amount', width: '120px',
      render: v => <span className="font-bold text-emerald-700">{fmt(v)}</span>
    },
    {
      key: 'payment_method', label: 'Method', width: '90px',
      render: v => <span className="badge-blue badge uppercase">{v}</span>
    },
    {
      key: 'term_name', label: 'Term', width: '120px',
      render: (v, row) => <span className="text-xs text-gray-500">{row.session_name} · {v}</span>
    },
    {
      key: 'actions', label: '', width: '80px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button title="View Receipt" className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); openReceipt(row) }}>
            <Receipt size={12} />
          </button>
          <button title="Delete" className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}>
            <Trash2 size={12} />
          </button>
        </div>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="Payment History"
        subtitle={`${payments.length} payments recorded`}
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

      {/* Stats bar */}
      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Receipts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.length}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Collected</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalAmount)}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Avg per Receipt</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {filtered.length > 0 ? fmt(totalAmount / filtered.length) : '₦0'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search student name, reg number, or receipt no…"
          className="w-80"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? <Spinner /> : (
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage="No payments found"
            onRowClick={openReceipt}
          />
        )}
      </div>

      {/* Receipt modal */}
      {receiptData && (
        <ReceiptView
          data={receiptData}
          onClose={() => { setReceiptData(null); if (receiptId) navigate('/payments') }}
        />
      )}

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Delete Payment"
        message={`Delete receipt ${deleteTarget?.receipt_number} (${fmt(deleteTarget?.amount_paid)}) for ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
      />
    </div>
  )
}
