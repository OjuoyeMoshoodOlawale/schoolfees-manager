import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import {
  ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2,
  Receipt, TrendingDown, TrendingUp, Clock
} from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner } from '../../components/ui'

const fmt = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

function SummaryBar({ label, value, sub, color = 'gray' }) {
  const colors = {
    blue:  'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    red:   'bg-red-50 border-red-200 text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    gray:  'bg-gray-50 border-gray-200 text-gray-800',
  }
  return (
    <div className={`border rounded-xl px-4 py-3 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function StudentBillPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdjModal, setShowAdjModal] = useState(false)
  const [deleteAdj, setDeleteAdj] = useState(null)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: { type: 'discount', calc_mode: 'fixed', amount: '', reason: '' }
  })
  const adjType = watch('type')
  const calcMode = watch('calc_mode')

  const load = useCallback(async () => {
    const data = await window.api.getStudentBillSummary({ student_id: Number(id) })
    setSummary(data)
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

  if (loading) return <Spinner />
  if (!summary) return <div className="card text-center py-10 text-gray-400">Student not found</div>

  const { student, bills, adjustments, bill_total, prev_balance, adj_total,
          total_expected, total_paid, balance } = summary

  const pct = total_expected > 0 ? Math.min(Math.round((total_paid / total_expected) * 100), 100) : 0
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'

  // Calculate displayed adjustment amount for preview
  const calcAdjPreview = (type, mode, amount) => {
    if (!amount) return 0
    const val = mode === 'percent' ? (Number(amount) / 100) * bill_total : Number(amount)
    return type === 'addition' ? val : -val
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${student.last_name} ${student.first_name}`}
        subtitle={`${student.reg_number} · ${student.gender === 'M' ? 'Male' : 'Female'} · ${student.boarding_type || 'day'} · ${student.entry_type}`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} /> Back
            </button>
            <button className="btn-primary btn" onClick={() => navigate(`/payments/new?student=${id}`)}>
              <Receipt size={14} /> Post Payment
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBar label="Total Billed"    value={fmt(total_expected)} color="blue" />
        <SummaryBar label="Total Paid"      value={fmt(total_paid)}     color="green" />
        <SummaryBar label="Balance"         value={fmt(balance)}        color={balance > 0 ? 'red' : 'green'} />
        <SummaryBar label="Collection"      value={`${pct}%`}           color={pct >= 100 ? 'green' : pct >= 60 ? 'amber' : 'red'} />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{fmt(total_paid)} paid of {fmt(total_expected)} expected</p>
      </div>

      {/* Bill line items */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Bill Items</h2>
        {bills.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No bills generated yet. Go to Generate Bills first.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fee Item</th>
                <th>Type</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th></th>
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
                  <td className="text-right">
                    <button
                      onClick={() => onWaive(b)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${b.status === 'waived'
                        ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
                        : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}
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
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td colSpan={3} className="font-bold text-gray-800 px-4 py-3">Subtotal (Bills)</td>
                <td className="text-right font-bold text-gray-900 px-4 py-3">{fmt(bill_total + prev_balance)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Adjustments */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Adjustments</h2>
          <button className="btn-primary btn btn-sm" onClick={() => setShowAdjModal(true)}>
            <Plus size={13} /> Add Adjustment
          </button>
        </div>
        {adjustments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">No adjustments. Use this to add extra charges or discounts.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Type</th><th>Mode</th><th>Reason</th><th>By</th><th className="text-right">Effect</th><th></th></tr>
            </thead>
            <tbody>
              {adjustments.map(a => {
                const effect = a.calc_mode === 'percent'
                  ? (a.amount / 100) * bill_total
                  : a.amount
                const isAdd = a.type === 'addition'
                return (
                  <tr key={a.id}>
                    <td>
                      <span className={`badge ${isAdd ? 'badge-blue' : 'badge-green'} flex items-center gap-1 w-fit`}>
                        {isAdd ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                        {isAdd ? 'Addition' : 'Discount'}
                      </span>
                    </td>
                    <td className="text-gray-500 text-xs capitalize">
                      {a.calc_mode === 'percent' ? `${a.amount}%` : fmt(a.amount)} ({a.calc_mode})
                    </td>
                    <td className="text-gray-700">{a.reason || '—'}</td>
                    <td className="text-gray-400 text-xs">{a.created_by}</td>
                    <td className={`text-right font-semibold ${isAdd ? 'text-red-600' : 'text-emerald-600'}`}>
                      {isAdd ? '+' : '−'}{fmt(effect)}
                    </td>
                    <td>
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
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={4} className="font-semibold text-gray-700 px-4 py-2">Total Adjustment</td>
                <td className={`text-right font-bold px-4 py-2 ${adj_total >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {adj_total >= 0 ? '+' : ''}{fmt(adj_total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Grand total */}
      <div className="card bg-gray-900 text-white mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Grand Total Expected</p>
            <p className="text-3xl font-bold mt-1">{fmt(total_expected)}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs uppercase tracking-wide">Balance Due</p>
            <p className={`text-3xl font-bold mt-1 ${balance <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(balance)}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Add adjustment modal */}
      <Modal
        open={showAdjModal}
        onClose={() => { setShowAdjModal(false); reset() }}
        title="Add Adjustment"
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => { setShowAdjModal(false); reset() }}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onAddAdj)} disabled={saving}>
              {saving ? 'Saving…' : 'Add Adjustment'}
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
            <Field label="Calculation Mode" required>
              <select className="form-select" {...register('calc_mode')}>
                <option value="fixed">Fixed amount (₦)</option>
                <option value="percent">Percentage of bill (%)</option>
                <option value="flat">Flat deduction (₦)</option>
              </select>
            </Field>
          </div>
          <Field label={calcMode === 'percent' ? 'Percentage (%)' : 'Amount (₦)'} required error={errors.amount?.message}>
            <input type="number" min="0" step="0.01" className="form-input"
              placeholder={calcMode === 'percent' ? '10' : '5000'}
              {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be > 0' }, valueAsNumber: true })} />
          </Field>
          <Field label="Reason" required error={errors.reason?.message}
            hint="This appears on the student's bill statement">
            <input className="form-input" placeholder="e.g. Scholarship discount, Late registration fee"
              {...register('reason', { required: 'Reason is required' })} />
          </Field>
          {/* Live preview */}
          {watch('amount') > 0 && (
            <div className={`p-3 rounded-lg border text-sm ${adjType === 'addition' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              This will {adjType === 'addition' ? 'add' : 'deduct'}{' '}
              <strong>{fmt(Math.abs(calcAdjPreview(adjType, calcMode, watch('amount'))))}</strong>{' '}
              {adjType === 'addition' ? 'to' : 'from'} the student's bill.
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
        message={`Remove this ${deleteAdj?.type} adjustment of ${deleteAdj?.amount}${deleteAdj?.calc_mode === 'percent' ? '%' : ' ₦'} (${deleteAdj?.reason})?`}
      />
    </div>
  )
}
