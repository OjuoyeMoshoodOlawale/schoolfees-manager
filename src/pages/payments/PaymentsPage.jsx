import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Receipt, Printer, Trash2, ArrowLeft, Download, Search } from 'lucide-react'
import { PageHeader, DataTable, SearchInput, Confirm, Spinner, exportToExcel } from '../../components/ui'

const fmt  = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
const fmtD = d => d ? new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : '—'

// ── Receipt Print View ────────────────────────────────────────────────────────
function ReceiptView({ data, onClose }) {
  if (!data) return null
  const { payment, school, bills, totalBilled, totalPaid } = data
  const balance = totalBilled - totalPaid

  const handlePrint = () => window.print()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Screen-only controls */}
        <div className="flex items-center justify-between px-5 py-4 border-b print:hidden">
          <span className="font-semibold text-gray-800">Receipt Preview</span>
          <div className="flex gap-2">
            <button className="btn-primary btn btn-sm" onClick={handlePrint}>
              <Printer size={13} /> Print
            </button>
            <button className="btn-secondary btn btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Receipt content */}
        <div id="receipt-content" className="p-6 space-y-4">
          {/* School header */}
          <div className="text-center border-b-2 border-gray-800 pb-4">
            {school?.logo_path && (
              <img src={`file://${school.logo_path}`} alt="Logo"
                className="w-16 h-16 object-contain mx-auto mb-2" />
            )}
            <h1 className="text-lg font-bold text-gray-900 uppercase">{school?.school_name || 'School Name'}</h1>
            {school?.address && <p className="text-xs text-gray-500">{school.address}</p>}
            {school?.phone && <p className="text-xs text-gray-500">Tel: {school.phone}</p>}
            <p className="text-sm font-bold text-gray-700 mt-2 uppercase tracking-wider">Official Fee Receipt</p>
          </div>

          {/* Receipt meta */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[
              ['Receipt No.',  payment.receipt_number],
              ['Date',         fmtD(payment.payment_date)],
              ['Student',      `${payment.last_name} ${payment.first_name}`],
              ['Reg. No.',     payment.reg_number],
              ['Class',        payment.class_name || '—'],
              ['Term',         `${payment.session_name} — ${payment.term_name}`],
              ['Method',       payment.payment_method?.toUpperCase()],
              ['Reference',    payment.reference || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-500 text-xs">{k}</span>
                <span className="font-medium text-gray-900 text-xs text-right">{v}</span>
              </div>
            ))}
          </div>

          {/* Bill context */}
          {bills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fee Schedule This Term</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1 text-gray-500 font-medium">Item</th>
                    <th className="text-right py-1 text-gray-500 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 text-gray-700">{b.fee_item_name}</td>
                      <td className="py-1 text-right text-gray-800">{fmt(b.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-300 font-semibold">
                    <td className="py-1.5 text-gray-800">Total Billed</td>
                    <td className="py-1.5 text-right text-gray-900">{fmt(totalBilled)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Payment summary box */}
          <div className="bg-gray-900 text-white rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Amount Paid (This Receipt)</span>
              <span className="font-bold text-white text-lg">{fmt(payment.amount_paid)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
              <span className="text-gray-400">Total Paid (All Receipts)</span>
              <span className="text-emerald-400 font-semibold">{fmt(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Outstanding Balance</span>
              <span className={`font-bold ${balance <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(balance)}</span>
            </div>
          </div>

          {/* Bank info */}
          {school?.account_number && (
            <div className="text-center text-xs text-gray-500 border-t border-gray-200 pt-3">
              <p>Pay to: <strong>{school.bank_name}</strong> · Acct: <strong>{school.account_number}</strong></p>
              {school.account_name && <p>{school.account_name}</p>}
            </div>
          )}

          <p className="text-center text-xs text-gray-400 border-t border-gray-200 pt-3">
            This is a computer-generated receipt.<br />
            Posted by: {payment.posted_by} · {payment.created_at?.slice(0, 16)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Payments Page ────────────────────────────────────────────────────────
export default function PaymentsPage() {
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
