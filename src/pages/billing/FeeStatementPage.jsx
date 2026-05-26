import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import { fmtDate, printCleanHtml, buildBillSlipHtml } from '../../lib/utils'
import { ArrowLeft, Printer } from 'lucide-react'

export default function FeeStatementPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { fmt } = useAuth()
  const [data, setData]       = useState(null)
  const [school, setSchool]   = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [summary, settings, pmts] = await Promise.all([
      window.api.getStudentBillSummary({ student_id: Number(id) }),
      window.api.getSettings(),
      window.api.listPayments({ student_id: Number(id) }),
    ])
    setData(summary)
    setSchool(settings)
    // Only non-reversed payments for current term
    const termId = summary?.term_id
    setPayments((pmts || []).filter(p => p.term_id === termId && !p.is_reversed && p.amount_paid > 0))
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const handlePrint = async () => {
    const html = buildBillSlipHtml({
      student, bills, adjustments, bill_total, prev_balance,
      total_expected, total_paid, balance, school,
      sessionName: student.session_name || '',
      termName:    student.term_name    || '',
      className:   student.class_name   || '',
      currency:    sym,
    })
    await printCleanHtml(html)
  }

  if (loading) return <Spinner />
  if (!data) return <div className="p-8 text-gray-500">Student not found.</div>

  const { student, bills, adjustments, bill_total, prev_balance, adj_total, total_expected, total_paid, balance } = data
  const sym = school?.currency_symbol || '₦'

  return (
    <div>
      {/* Toolbar — hidden on print */}
      <div className="no-print flex items-center gap-3 p-4 border-b bg-gray-50">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/billing/student/${id}`)}>
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-sm font-medium text-gray-700">Fee Statement — {student.first_name} {student.last_name}</span>
        <button className="btn btn-primary btn-sm ml-auto" onClick={handlePrint}>
          <Printer size={14} /> Print Statement
        </button>
      </div>

      {/* Statement — this is what prints */}
      <div className="fee-statement max-w-2xl mx-auto p-8 bg-white" id="fee-statement">

        {/* School Header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-5">
          {school?.logo_path && (
            <img src={`localfile://${school.logo_path}`} alt="Logo"
              className="w-16 h-16 object-contain mx-auto mb-2"
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">
            {school?.school_name || 'School Name'}
          </h1>
          {school?.address && <p className="text-sm text-gray-600 mt-0.5">{school.address}</p>}
          {school?.phone   && <p className="text-sm text-gray-600">Tel: {school.phone}</p>}
          {school?.email   && <p className="text-sm text-gray-600">{school.email}</p>}
          <div className="mt-3 inline-block border-2 border-gray-800 px-6 py-1">
            <p className="font-bold uppercase tracking-widest text-sm">Student Fee Statement</p>
          </div>
        </div>

        {/* Student + Term Info */}
        <div className="grid grid-cols-2 gap-x-8 mb-5 text-sm">
          <div className="space-y-1">
            <div className="flex gap-2"><span className="text-gray-500 w-28">Student:</span><span className="font-semibold">{student.last_name} {student.first_name}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Reg. Number:</span><span className="font-semibold">{student.reg_number}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Gender:</span><span>{student.gender === 'M' ? 'Male' : 'Female'}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Type:</span><span className="capitalize">{student.boarding_type} · {student.entry_type}</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex gap-2"><span className="text-gray-500 w-28">Class:</span><span className="font-semibold">{student.class_name || '—'}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Term:</span><span className="font-semibold">{student.term_name}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Session:</span><span>{student.session_name}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28">Date:</span><span>{new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          </div>
        </div>

        {/* Fee Items Table */}
        <table className="w-full text-sm mb-4 border-collapse">
          <thead>
            <tr className="bg-gray-100 border-t border-b border-gray-400">
              <th className="text-left py-2 px-3 font-semibold">Fee Item</th>
              <th className="text-center py-2 px-3 font-semibold w-24">Status</th>
              <th className="text-right py-2 px-3 font-semibold w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b, i) => (
              <tr key={i} className={`border-b border-gray-200 ${b.status === 'waived' ? 'opacity-50' : ''}`}>
                <td className={`py-1.5 px-3 ${b.status === 'waived' ? 'line-through text-gray-400' : ''}`}>{b.fee_item_name}</td>
                <td className="py-1.5 px-3 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${b.status === 'waived' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
                    {b.status}
                  </span>
                </td>
                <td className={`py-1.5 px-3 text-right ${b.status === 'waived' ? 'text-gray-400' : ''}`}>{fmt(b.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-400 font-semibold">
              <td className="py-2 px-3" colSpan={2}>Subtotal (Fee Items)</td>
              <td className="py-2 px-3 text-right">{fmt(bill_total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Adjustments */}
        {adjustments.length > 0 && (
          <table className="w-full text-sm mb-4 border-collapse">
            <thead>
              <tr className="bg-gray-50 border-t border-b border-gray-300">
                <th className="text-left py-1.5 px-3 font-semibold">Adjustment</th>
                <th className="text-center py-1.5 px-3 font-semibold w-24">Type</th>
                <th className="text-right py-1.5 px-3 font-semibold w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a, i) => {
                const val = a.calc_mode === 'percent'
                  ? (a.amount / 100) * bill_total
                  : a.amount
                return (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1.5 px-3 text-gray-700">{a.reason || '—'}</td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${a.type === 'discount' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {a.type}
                      </span>
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${a.type === 'discount' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {a.type === 'discount' ? '-' : '+'}{fmt(val)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Summary Box */}
        <div className="border-2 border-gray-800 p-4 mb-5 text-sm space-y-1.5">
          {prev_balance > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Previous Term Balance B/F</span>
              <span className="font-medium text-red-600">{fmt(prev_balance)}</span>
            </div>
          )}
          {adj_total !== 0 && (
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-600">Total Adjustments</span>
              <span className={`font-medium ${adj_total < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(Math.abs(adj_total))}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-300 pt-1.5 font-semibold">
            <span>Total Amount Expected</span>
            <span>{fmt(total_expected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Paid This Term</span>
            <span className="text-emerald-700 font-medium">{fmt(total_paid)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-gray-800 pt-2 font-bold text-base">
            <span>Balance Outstanding</span>
            <span className={balance <= 0 ? 'text-emerald-700' : 'text-red-700'}>{fmt(balance)}</span>
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Payments Received This Term</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-t border-b border-gray-300">
                  <th className="text-left py-1.5 px-2">Receipt No.</th>
                  <th className="text-left py-1.5 px-2">Date</th>
                  <th className="text-left py-1.5 px-2">Method</th>
                  <th className="text-right py-1.5 px-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1 px-2 font-mono">{p.receipt_number}</td>
                    <td className="py-1 px-2">{fmtDate(p.payment_date)}</td>
                    <td className="py-1 px-2 capitalize">{p.payment_method}</td>
                    <td className="py-1 px-2 text-right font-medium">{fmt(p.amount_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bank / Footer */}
        {(school?.account_number || school?.bank_name) && (
          <div className="border-t border-gray-300 pt-3 text-center text-xs text-gray-600">
            <p className="font-semibold mb-0.5">Payment Details</p>
            {school.bank_name    && <p>Bank: <strong>{school.bank_name}</strong></p>}
            {school.account_number && <p>Account: <strong>{school.account_number}</strong> — {school.account_name}</p>}
          </div>
        )}
        <div className="border-t border-dashed border-gray-300 mt-3 pt-3 text-center text-xs text-gray-400">
          This statement was generated on {new Date().toLocaleString('en-NG')} by {school?.school_name || 'SchoolFees Manager'}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .fee-statement { max-width: 100% !important; padding: 0 !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}
