import { useState } from 'react'
import { toast } from 'react-toastify'
import { Modal, Field } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

/**
 * Isolated modal component so its internal state never re-renders the parent
 * StudentBillPage — this is the fix for the "inputs feel laggy / unresponsive"
 * issue caused by react-hook-form watch() in the parent triggering full-page re-renders.
 */
export default function AdjustmentModal({ open, onClose, studentId, billTotal, onSaved }) {
  const { fmt } = useAuth()
  const [type,     setType]     = useState('discount')
  const [calcMode, setCalcMode] = useState('fixed')
  const [amount,   setAmount]   = useState('')
  const [reason,   setReason]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [errors,   setErrors]   = useState({})

  const resetForm = () => {
    setType('discount'); setCalcMode('fixed')
    setAmount(''); setReason(''); setErrors({})
  }

  const handleClose = () => { resetForm(); onClose() }

  const computeEffect = () => {
    const n = Number(amount)
    if (!n || n <= 0) return null
    const val = calcMode === 'percent' ? (n / 100) * billTotal : n
    return type === 'addition' ? val : -val
  }

  const validate = () => {
    const e = {}
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) e.amount = 'Enter a valid amount greater than 0'
    if (!reason.trim()) e.reason = 'Reason is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await window.api.createAdjustment({
        student_id: Number(studentId),
        type,
        calc_mode: calcMode,
        amount: Number(amount),
        reason: reason.trim(),
      })
      toast.success('Adjustment added')
      handleClose()
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Failed to save adjustment')
    } finally {
      setSaving(false)
    }
  }

  const effect = computeEffect()

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Adjustment"
      footer={
        <>
          <button className="btn-secondary btn" onClick={handleClose} disabled={saving}>Cancel</button>
          <button className="btn-primary btn" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Adjustment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" required>
            <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
              <option value="discount">Discount — reduces bill</option>
              <option value="addition">Addition — increases bill</option>
            </select>
          </Field>
          <Field label="Calculation Mode" required>
            <select className="form-select" value={calcMode} onChange={e => setCalcMode(e.target.value)}>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percentage of bill (%)</option>
            </select>
          </Field>
        </div>

        <Field label={calcMode === 'percent' ? 'Percentage (%)' : 'Amount'} required error={errors.amount}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="form-input"
            placeholder={calcMode === 'percent' ? 'e.g. 10 for 10%' : 'e.g. 5000'}
            value={amount}
            onChange={e => { setAmount(e.target.value); setErrors(prev => ({ ...prev, amount: undefined })) }}
            autoFocus
          />
        </Field>

        <Field label="Reason" required error={errors.reason}>
          <input
            className="form-input"
            placeholder="e.g. Scholarship, PTSA waiver, Late penalty"
            value={reason}
            onChange={e => { setReason(e.target.value); setErrors(prev => ({ ...prev, reason: undefined })) }}
          />
        </Field>

        {effect !== null && (
          <div className={`p-3 rounded-lg border text-sm font-medium ${
            type === 'addition'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            This will {type === 'addition' ? '➕ add' : '➖ deduct'}{' '}
            <strong>{fmt(Math.abs(effect))}</strong>{' '}
            {type === 'addition' ? 'to' : 'from'} the total bill.
            {billTotal > 0 && (
              <span> New total: <strong>{fmt(billTotal + effect)}</strong></span>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
