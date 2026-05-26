import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import {
  Receipt, Printer, Trash2, Download,
  RotateCcw, AlertTriangle, X, CheckCircle2, Mail
} from 'lucide-react'
import {
  PageHeader, DataTable, SearchInput,
  Confirm, Spinner, exportToExcel
} from '../../components/ui'
import { printCleanHtml } from '../../lib/utils'

const fmtD = d =>
  d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// ─── Receipt Modal ─────────────────────────────────────────────────────────────
function ReceiptModal({ data, onClose, fmt, school }) {
  const [mode, setMode]         = useState('a4')
  const [emailing, setEmailing] = useState(false)
  if (!data) return null

  const { payment, bills = [], totalBilled, totalPaid } = data
  const balance = totalBilled - totalPaid

  const handlePrint = async () => {
    const currency = school?.currency_symbol || '₦'
    const fmtN = n => currency + Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2})
    const billRows = bills.map(b => `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:5px 10px">${b.fee_item_name||b.name||'—'}</td>
      <td style="text-align:right;padding:5px 10px">${fmtN(b.amount)}</td>
    </tr>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:18px">
        <h1 style="font-size:14pt;font-weight:bold;text-transform:uppercase;margin:0">${school?.school_name||'School'}</h1>
        <p style="margin:4px 0 0;font-size:12pt;font-weight:bold">PAYMENT RECEIPT</p>
        <p style="margin:2px 0 0;font-size:10pt;color:#6b7280">${payment.receipt_number}</p>
      </div>
      <table style="width:100%;font-size:10pt;margin-bottom:12px">
        <tr><td style="color:#6b7280;padding:3px 0">Student</td><td style="font-weight:600">${payment.last_name||''} ${payment.first_name||''}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0">Reg #</td><td>${payment.reg_number||'—'}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0">Class</td><td>${payment.class_name||'—'}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0">Term</td><td>${payment.term_name||''}, ${payment.session_name||''}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0">Date</td><td>${payment.payment_date}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0">Method</td><td style="text-transform:uppercase">${payment.payment_method||''}</td></tr>
        ${payment.reference ? `<tr><td style="color:#6b7280;padding:3px 0">Ref</td><td>${payment.reference}</td></tr>` : ''}
      </table>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center;padding:14px;margin:14px 0">
        <p style="margin:0;font-size:11pt;color:#6b7280">Amount Paid</p>
        <p style="margin:4px 0 0;font-size:22pt;font-weight:bold;color:#1d4ed8">${fmtN(payment.amount_paid)}</p>
      </div>
      <div style="background:${balance>0?'#fef2f2':'#f0fdf4'};border:1px solid ${balance>0?'#fecaca':'#bbf7d0'};border-radius:8px;text-align:center;padding:10px">
        <p style="margin:0;font-size:10pt;color:#6b7280">${balance>0?'Outstanding Balance':'Account Status'}</p>
        <p style="margin:3px 0 0;font-size:15pt;font-weight:bold;color:${balance>0?'#dc2626':'#16a34a'}">${balance>0?fmtN(balance)+' remaining':'&#10003; Fully Paid'}</p>
      </div>
      ${school?.receipt_footer ? `<p style="text-align:center;margin-top:12px;font-size:9pt;color:#9ca3af">${school.receipt_footer}</p>` : ''}
    </div>`
    await printCleanHtml(html)
  }

  const handleEmailReceipt = async () => {
    setEmailing(true)
    try {
      const r = await window.api.sendEmailReceipt({ payment_id: payment.id })
      if (r.ok) toast.success(`Receipt emailed to ${payment.parent_email || 'parent'}!`)
      else toast.error(r.error || 'Failed to send email')
    } catch (e) { toast.error(e.message) }
    finally { setEmailing(false) }
  }

  const isReversal = payment.amount_paid < 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Controls — hidden on print */}
        <div className="no-print flex items-center justify-between px-4 py-3 bg-gray-50 border-b rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 text-sm">
              {isReversal ? 'Reversal Notice' : 'Receipt Preview'}
            </span>
            {!isReversal && (
              <select
                className="form-select text-xs py-1 w-36"
                value={mode}
                onChange={e => setMode(e.target.value)}
              >
                <option value="a4">A4 / Full page</option>
                <option value="thermal80">Thermal 80mm</option>
                <option value="thermal58">Thermal 58mm</option>
              </select>
            )}
          </div>
          <div className="flex gap-2">
            {!isReversal && (
              <button className="btn btn-secondary btn-sm" onClick={handleEmailReceipt} disabled={emailing}
                title={payment.parent_email ? `Email to ${payment.parent_email}` : 'No parent email on file'}>
                <Mail size={13} /> {emailing ? 'Sending…' : 'Email'}
              </button>
            )}
            <button className="btn-primary btn btn-sm" onClick={handlePrint}>
              <Printer size={13} /> Print
            </button>
            <button className="btn-secondary btn btn-sm" onClick={onClose}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Receipt content */}
        <div className="receipt-content p-5 space-y-3 text-sm">

          {/* School header */}
          <div className="text-center pb-3 border-b-2 border-gray-800">
            {school?.logo_path && (
              <img
                src={`file://${school.logo_path}`}
                alt="Logo"
                className="w-14 h-14 object-contain mx-auto mb-1"
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
            <h1 className="font-bold text-gray-900 uppercase text-base">
              {school?.school_name || data.payment?.school_name || 'School Name'}
            </h1>
            {school?.address && <p className="text-xs text-gray-500">{school.address}</p>}
            {school?.phone   && <p className="text-xs text-gray-500">Tel: {school.phone}</p>}
            <div className="mt-2 border border-gray-800 inline-block px-4 py-0.5">
              <p className="font-bold uppercase tracking-wider text-xs">
                {isReversal ? '⚠ Payment Reversal Notice' : 'Official Fee Receipt'}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-1">
            {[
              ['Receipt No.',  payment.receipt_number],
              ['Date',         fmtD(payment.payment_date)],
              ['Student',      `${payment.last_name} ${payment.first_name}`],
              ['Reg. No.',     payment.reg_number],
              ['Class',        payment.class_name || '—'],
              ['Term',         `${payment.session_name || ''} — ${payment.term_name || ''}`],
              ['Method',       payment.payment_method?.toUpperCase()],
              ...(payment.reference ? [['Reference', payment.reference]] : []),
              ...(isReversal ? [['Reversal Reason', payment.reversal_reason || '—']] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-gray-100 pb-0.5">
                <span className="text-gray-500 flex-shrink-0 text-xs">{k}:</span>
                <span className="font-semibold text-gray-900 text-right text-xs">{v}</span>
              </div>
            ))}
          </div>

          {/* Fee schedule */}
          {bills.length > 0 && !isReversal && (
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-xs mb-1 border-t border-gray-200 pt-2">
                Fee Schedule This Term
              </p>
              <table className="w-full text-xs">
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

          {/* Payment summary box */}
          <div className={`border-2 p-3 space-y-1 ${isReversal ? 'border-red-800 bg-red-50' : 'border-gray-800'}`}>
            <div className="flex justify-between font-bold">
              <span>{isReversal ? 'AMOUNT REVERSED' : 'AMOUNT PAID'}</span>
              <span className={`text-base ${isReversal ? 'text-red-700' : ''}`}>
                {fmt(Math.abs(payment.amount_paid))}
              </span>
            </div>
            {!isReversal && (
              <>
                <div className="flex justify-between text-xs border-t border-gray-300 pt-1">
                  <span className="text-gray-500">Total Paid (All Receipts)</span>
                  <span>{fmt(totalPaid)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Balance Outstanding</span>
                  <span className={`font-bold ${balance <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmt(balance)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Bank details */}
          {school?.account_number && !isReversal && (
            <div className="text-center text-xs text-gray-500 border-t border-gray-200 pt-2">
              <p>Bank: <strong>{school.bank_name}</strong></p>
              <p>Account: <strong>{school.account_number}</strong> — {school.account_name}</p>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 border-t border-dashed border-gray-300 pt-2">
            {isReversal
              ? 'This is an official reversal notice. Balance has been adjusted accordingly.'
              : (school?.receipt_footer || 'Thank you for your payment.')}
            <br />
            Posted by: {payment.posted_by} · {payment.created_at?.slice(0, 16)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Reversal Modal ────────────────────────────────────────────────────────────
function ReversalModal({ payment, onClose, onConfirm, fmt }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!reason.trim()) { toast.error('Enter a reason for the reversal'); return }
    setSaving(true)
    try {
      await onConfirm(reason)
    } finally { setSaving(false) }
  }

  if (!payment) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <RotateCcw size={18} className="text-amber-600" />
          <h2 className="font-semibold text-gray-900">Reverse Payment</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm space-y-1">
            <p className="font-semibold text-amber-900">
              Receipt: {payment.receipt_number}
            </p>
            <p className="text-amber-800">
              {payment.last_name} {payment.first_name} — {fmt(payment.amount_paid)}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              A reversal entry (REV-...) will be created. The original receipt is preserved
              for audit. The student's outstanding balance will increase by {fmt(payment.amount_paid)}.
            </p>
          </div>
          <div>
            <label className="form-label">
              Reason for Reversal <span className="text-red-500">*</span>
            </label>
            <textarea
              className="form-input resize-none"
              rows={3}
              placeholder="e.g. Posted to wrong student, duplicate entry, bank error..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button className="btn-secondary btn flex-1 justify-center" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn flex-1 justify-center bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium py-2 flex items-center gap-2"
            onClick={handleConfirm}
            disabled={saving}
          >
            <RotateCcw size={14} />
            {saving ? 'Processing…' : 'Confirm Reversal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Payments Page ────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const { fmt }       = useAuth()
  const { receiptId } = useParams()
  const navigate      = useNavigate()

  const [payments, setPayments]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [school, setSchool]               = useState(null)
  const [receiptData, setReceiptData]     = useState(null)
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [reverseTarget, setReverseTarget] = useState(null)

  const load = useCallback(async () => {
    const [data, s] = await Promise.all([
      window.api.listPayments({}),
      window.api.getSettings(),
    ])
    setPayments(data)
    setSchool(s)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-open receipt from URL param
  useEffect(() => {
    if (receiptId) {
      window.api.getReceiptData(Number(receiptId)).then(d => {
        if (d) setReceiptData(d)
      })
    }
  }, [receiptId])

  const openReceipt = async (payment) => {
    const data = await window.api.getReceiptData(payment.id)
    setReceiptData(data)
  }

  const handleDelete = async () => {
    await window.api.deletePayment(deleteTarget.id)
    toast.success('Payment record deleted')
    load()
  }

  const handleReverse = async (reason) => {
    try {
      const result = await window.api.reversePayment({
        payment_id:  reverseTarget.id,
        reason,
        reversed_by: 'admin',
      })
      toast.success(`Payment reversed — ${result.reversal_receipt}`)
      setReverseTarget(null)
      load()
    } catch (e) {
      toast.error(e.message || 'Reversal failed')
      throw e
    }
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
      'Reversed':      p.is_reversed ? 'Yes' : 'No',
      'Posted By':     p.posted_by,
    }))
    await exportToExcel(rows, 'payments')
    toast.success('Exported to Excel')
  }

  const filtered = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${p.first_name} ${p.last_name} ${p.reg_number} ${p.receipt_number}`
      .toLowerCase().includes(q)
  })

  const netTotal = filtered
    .reduce((s, p) => s + Number(p.amount_paid), 0)

  const columns = [
    {
      key: 'receipt_number', label: 'Receipt', width: '150px',
      render: (v, row) => (
        <div>
          <span className={`font-mono text-xs font-semibold ${row.amount_paid < 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {v}
          </span>
          {row.is_reversed === 1 && (
            <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">REVERSED</span>
          )}
          {row.amount_paid < 0 && (
            <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">REVERSAL</span>
          )}
        </div>
      )
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
      key: 'amount_paid', label: 'Amount', width: '130px',
      render: v => (
        <span className={`font-bold text-base ${Number(v) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {Number(v) < 0 ? '−' : ''}{fmt(Math.abs(v))}
        </span>
      )
    },
    {
      key: 'payment_method', label: 'Method', width: '90px',
      render: v => <span className="badge-blue badge uppercase">{v}</span>
    },
    {
      key: 'term_name', label: 'Term', width: '130px',
      render: (v, row) => (
        <span className="text-xs text-gray-500">{row.session_name} · {v}</span>
      )
    },
    {
      key: 'actions', label: '', width: '100px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          {/* View receipt — not for reversal entries */}
          {row.amount_paid >= 0 && (
            <button
              title="View / Print Receipt"
              className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
              onClick={e => { e.stopPropagation(); openReceipt(row) }}
            >
              <Receipt size={12} />
            </button>
          )}
          {/* Reverse — only for positive, non-reversed payments */}
          {row.amount_paid > 0 && row.is_reversed !== 1 && (
            <button
              title="Reverse this payment"
              className="btn btn-sm text-amber-600 hover:bg-amber-50 border border-amber-200"
              onClick={e => { e.stopPropagation(); setReverseTarget(row) }}
            >
              <RotateCcw size={12} />
            </button>
          )}
          {/* Delete */}
          <button
            title="Delete record"
            className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )
    },
  ]

  return (
    <div>
      <PageHeader
        title="Payment History"
        subtitle={`${payments.length} records`}
        actions={
          <div className="flex gap-2">
            <button
              className="btn-secondary btn btn-sm"
              onClick={handleExport}
              disabled={!filtered.length}
            >
              <Download size={14} /> Export Excel
            </button>
            <button
              className="btn-primary btn"
              onClick={() => navigate('/payments/new')}
            >
              <Receipt size={15} /> Post Payment
            </button>
          </div>
        }
      />

      {/* Stats */}
      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Receipts</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.length}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Net Collected</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(netTotal)}</p>
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Reversals</p>
            <p className="text-2xl font-bold text-red-500 mt-1">
              {filtered.filter(p => p.is_reversed === 1).length}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search student name, reg number, receipt no…"
          className="w-80"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading
          ? <Spinner />
          : <DataTable
              columns={columns}
              data={filtered}
              emptyMessage="No payments recorded yet"
              onRowClick={row => row.amount_paid >= 0 && openReceipt(row)}
            />}
      </div>

      {/* Modals */}
      {receiptData && (
        <ReceiptModal
          data={receiptData}
          school={school}
          fmt={fmt}
          onClose={() => {
            setReceiptData(null)
            if (receiptId) navigate('/payments')
          }}
        />
      )}

      {reverseTarget && (
        <ReversalModal
          payment={reverseTarget}
          fmt={fmt}
          onClose={() => setReverseTarget(null)}
          onConfirm={handleReverse}
        />
      )}

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Delete Payment Record"
        message={`Delete receipt ${deleteTarget?.receipt_number} (${fmt(deleteTarget?.amount_paid || 0)}) for ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
      />
    </div>
  )
}
