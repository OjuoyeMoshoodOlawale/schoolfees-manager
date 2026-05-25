import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import {
  ArrowLeft, Plus, Trash2, Receipt,
  TrendingDown, TrendingUp, Printer
} from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fmtDate } from '../../lib/utils'

export default function StudentBillPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { fmt } = useAuth()
  const [summary, setSummary]       = useState(null)
  const [payments, setPayments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showAdjModal, setShowAdjModal] = useState(false)
  const [deleteAdj, setDeleteAdj]   = useState(null)
  const [saving, setSaving]         = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: { type: 'discount', calc_mode: 'fixed', amount: '', reason: '' }
  })
  const adjType  = watch('type')
  const calcMode = watch('calc_mode')

  const load = useCallback(async () => {
    const [data, pmts] = await Promise.all([
      window.api.getStudentBillSummary({ student_id: Number(id) }),
      window.api.listPayments({ student_id: Number(id) }),
    ])
    setSummary(data)
    setPayments(pmts || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const onAddAdj = async (data) => {
    setSaving(true)
    try {
      await window.api.createAdjustment({
        student_id: Number(id),
        type: data.type,
        calc_mode: data.calc_mode,
        amount: Number(data.amount),
        reason: data.reason,
      })
      toast.success('Adjustment added')
      setShowAdjModal(false)
      reset()
      load()
    } catch (e) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  const onDeleteAdj = async () => {
    await window.api.deleteAdjustment(deleteAdj.id)
    toast.success('Adjustment removed')
    load()
  }

  const onWaive = async (bill) => {
    await window.api.waiveBill({ bill_id: bill.id, waive: bill.status !== 'waived' })
    toast.success(bill.status === 'waived' ? 'Bill reinstated' : 'Bill waived')
    load()
  }

  const handlePrint = () => window.print()

  if (loading) return <Spinner />
  if (!summary) return (
    <div className="card text-center py-10">
      <p className="text-gray-400">Student not found or no bills generated yet.</p>
      <button className="btn-secondary btn mt-4" onClick={() => navigate(-1)}>← Back</button>
    </div>
  )

  const { student, bills, adjustments, bill_total, prev_balance,
          adj_total, total_expected, total_paid, balance } = summary

  const pct = total_expected > 0 ? Math.min(Math.round((total_paid / total_expected) * 100), 100) : 0
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'

  const calcAdjPreview = (type, mode, amount) => {
    if (!amount) return 0
    const val = mode === 'percent' ? (Number(amount) / 100) * bill_total : Number(amount)
    return type === 'addition' ? val : -val
  }

  return (
    <div className="max-w-3xl">
      {/* Print-only header */}
      <div className="hidden print:block text-center mb-6 border-b-2 border-gray-800 pb-4">
        <h1 className="text-xl font-bold uppercase">Fee Statement</h1>
        <p className="text-sm mt-1">{student.last_name} {student.first_name} — {student.reg_number}</p>
      </div>

      <div className="print:hidden">
        <PageHeader
          title={`${student.last_name} ${student.first_name}`}
          subtitle={`${student.reg_number} · ${student.gender === 'M' ? 'Male' : 'Female'} · ${student.boarding_type || 'day'} · ${student.entry_type}`}
          actions={
            <div className="flex gap-2">
              <button className="btn-secondary btn btn-sm" onClick={handlePrint}>
                <Printer size={14} /> Print Statement
              </button>
              <button className="btn-secondary btn" onClick={() => navigate(-1)}>
                <ArrowLeft size={14} /> Back
              </button>
              <button className="btn-primary btn" onClick={() => navigate(`/payments/new?student=${id}`)}>
                <Receipt size={14} /> Post Payment
              </button>
            </div>
          }
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Billed', value: fmt(total_expected), color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Total Paid',   value: fmt(total_paid),     color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Balance Due',  value: fmt(balance),        color: `${balance > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}` },
          { label: 'Paid',         value: `${pct}%`,           color: `${pct >= 100 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : pct >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-red-700 bg-red-50 border-red-200'}` },
        ].map(c => (
          <div key={c.label} className={`border rounded-xl px-4 py-3 ${c.color}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">{c.label}</p>
            <p className="text-2xl font-bold mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{fmt(total_paid)} paid of {fmt(total_expected)}</p>
      </div>

      {/* Bill items */}
      <div className="card mb-4 overflow-hidden p-0">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Fee Items</h2>
          <button className="btn-primary btn btn-sm print:hidden" onClick={() => setShowAdjModal(true)}>
            <Plus size={13} /> Add Adjustment
          </button>
        </div>

        {bills.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            No bills generated. Go to Generate Bills first.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fee Item</th>
                <th>Type</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th className="print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} className={b.status === 'waived' ? 'opacity-40' : ''}>
                  <td className={`font-medium ${b.status === 'waived' ? 'line-through' : ''}`}>{b.fee_item_name}</td>
                  <td>{b.is_compulsory
                    ? <span className="badge-green badge">Compulsory</span>
                    : <span className="badge-yellow badge">Elective</span>}
                  </td>
                  <td><span className={`badge ${b.status === 'waived' ? 'badge-gray' : 'badge-blue'}`}>{b.status}</span></td>
                  <td className="text-right font-semibold">{fmt(b.amount)}</td>
                  <td className="text-right print:hidden">
                    <button
                      onClick={() => onWaive(b)}
                      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >{b.status === 'waived' ? 'Reinstate' : 'Waive'}</button>
                  </td>
                </tr>
              ))}
              {prev_balance > 0 && (
                <tr className="bg-amber-50">
                  <td className="italic text-amber-800">Previous term balance</td>
                  <td><span className="badge-yellow badge">Carry-over</span></td>
                  <td></td>
                  <td className="text-right font-semibold text-amber-800">{fmt(prev_balance)}</td>
                  <td></td>
                </tr>
              )}
              {adjustments.map(a => {
                const effect = a.calc_mode === 'percent' ? (a.amount / 100) * bill_total : a.amount
                const isAdd  = a.type === 'addition'
                return (
                  <tr key={a.id} className={isAdd ? 'bg-red-50' : 'bg-emerald-50'}>
                    <td className="italic">
                      {isAdd ? '+ Addition' : '− Discount'} — {a.reason}
                    </td>
                    <td><span className={`badge ${isAdd ? 'badge-red' : 'badge-green'}`}>{a.calc_mode}</span></td>
                    <td></td>
                    <td className={`text-right font-semibold ${isAdd ? 'text-red-700' : 'text-emerald-700'}`}>
                      {isAdd ? '+' : '−'}{fmt(effect)}
                    </td>
                    <td className="text-right print:hidden">
                      <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
                        onClick={() => setDeleteAdj(a)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-900 text-white font-bold">
                <td colSpan={3} className="px-4 py-3">TOTAL EXPECTED</td>
                <td className="text-right px-4 py-3 text-lg">{fmt(total_expected)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Payment history */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Payment History</h2>
        </div>
        {payments.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No payments recorded yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{p.receipt_number}</td>
                  <td className="text-sm text-gray-600">{fmtDate(p.payment_date)}</td>
                  <td><span className="badge-blue badge uppercase">{p.payment_method}</span></td>
                  <td className="text-xs text-gray-400">{p.reference || '—'}</td>
                  <td className="text-right font-bold text-emerald-700">{fmt(p.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-bold">
                <td colSpan={4} className="px-4 py-2 text-emerald-800">Total Paid</td>
                <td className="text-right px-4 py-2 text-emerald-700">{fmt(total_paid)}</td>
              </tr>
              <tr className={`font-bold ${balance > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <td colSpan={4} className={`px-4 py-2 ${balance > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                  Balance Outstanding
                </td>
                <td className={`text-right px-4 py-2 ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {fmt(balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Adjustment modal */}
      <Modal
        open={showAdjModal}
        onClose={() => { setShowAdjModal(false); reset() }}
        title="Add Adjustment"
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => { setShowAdjModal(false); reset() }}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onAddAdj)} disabled={saving}>
              {saving ? 'Saving…' : 'Add'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <select className="form-select" {...register('type')}>
                <option value="discount">Discount (reduces bill)</option>
                <option value="addition">Addition (increases bill)</option>
              </select>
            </Field>
            <Field label="Mode" required>
              <select className="form-select" {...register('calc_mode')}>
                <option value="fixed">Fixed amount (₦)</option>
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat deduction (₦)</option>
              </select>
            </Field>
          </div>
          <Field label={calcMode === 'percent' ? 'Percentage (%)' : 'Amount (₦)'} required error={errors.amount?.message}>
            <input type="number" min="0" step="0.01" className="form-input"
              placeholder={calcMode === 'percent' ? '10' : '5000'}
              {...register('amount', { required: 'Required', min: { value: 0.01, message: 'Must be > 0' }, valueAsNumber: true })} />
          </Field>
          <Field label="Reason" required error={errors.reason?.message}>
            <input className="form-input" placeholder="e.g. Scholarship, Late fee"
              {...register('reason', { required: 'Reason is required' })} />
          </Field>
          {watch('amount') > 0 && (
            <div className={`p-3 rounded-lg border text-sm ${adjType === 'addition' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              This will {adjType === 'addition' ? 'add' : 'deduct'}{' '}
              <strong>{fmt(Math.abs(calcAdjPreview(adjType, calcMode, watch('amount'))))}</strong>{' '}
              {adjType === 'addition' ? 'to' : 'from'} the bill.
              New total: <strong>{fmt(total_expected + calcAdjPreview(adjType, calcMode, watch('amount')))}</strong>
            </div>
          )}
        </div>
      </Modal>

      <Confirm
        open={!!deleteAdj}
        onClose={() => setDeleteAdj(null)}
        onConfirm={onDeleteAdj}
        danger
        title="Remove Adjustment"
        message={`Remove this ${deleteAdj?.type} adjustment? (${deleteAdj?.reason})`}
      />
    </div>
  )
}
