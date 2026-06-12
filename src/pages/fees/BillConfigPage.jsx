import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import {
  SlidersHorizontal, Plus, Pencil, Trash2,
  AlertCircle, ChevronDown, Filter
} from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner, DataTable } from '../../components/ui'
import { playErrorSound } from '../../lib/sounds'

const fmt = (n) => n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

const RULE_LABELS = {
  gender_rule:       { all: 'All Genders', male: 'Male Only',     female: 'Female Only' },
  student_type_rule: { all: 'All Students', new: 'New Only',      returning: 'Returning Only' },
  boarding_rule:     { all: 'All Types',    day: 'Day Only',      boarding: 'Boarding Only' },
}

function RulePill({ value, type }) {
  const label = RULE_LABELS[type]?.[value] || value
  const isAll = value === 'all'
  return (
    <span className={`badge text-xs ${isAll ? 'badge-gray' : 'badge-blue'}`}>{label}</span>
  )
}

// ─── Config row form (add/edit inside modal) ──────────────────────────────────
function ConfigForm({ feeItems, existingItems, editing, onSubmit, onCancel }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: editing ? {
      fee_item_id:       editing.fee_item_id,
      amount:            editing.amount,
      gender_rule:       editing.gender_rule,
      student_type_rule: editing.student_type_rule,
      boarding_rule:     editing.boarding_rule,
      is_compulsory:     String(editing.is_compulsory),
      is_active:         editing.is_active ? '1' : '0',
    } : {
      fee_item_id: '', amount: '', gender_rule: 'all',
      student_type_rule: 'all', boarding_rule: 'all',
      is_compulsory: '1', is_active: '1'
    }
  })

  // Filter out fee items already configured (unless editing that same one)
  const available = feeItems.filter(f =>
    !existingItems.includes(f.id) || (editing && f.id === editing.fee_item_id)
  ).filter(f => f.is_active)

  return (
    <form onSubmit={handleSubmit(onSubmit, playErrorSound)} className="space-y-4">
      <Field label="Fee Item" required error={errors.fee_item_id?.message}>
        <select className="form-select" disabled={!!editing}
          {...register('fee_item_id', { required: 'Select a fee item', valueAsNumber: true })}>
          <option value="">— Select fee item —</option>
          {available.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {available.length === 0 && !editing && (
          <p className="text-xs text-amber-600 mt-1">All fee items are already configured for this class/term.</p>
        )}
      </Field>

      <Field label="Amount (₦)" required error={errors.amount?.message}>
        <input type="number" min="0" step="0.01" className="form-input"
          placeholder="25000.00"
          {...register('amount', { required: 'Amount is required', min: { value: 0, message: 'Must be ≥ 0' }, valueAsNumber: true })} />
      </Field>

      {/* The 4 rule dropdowns in a 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender Rule">
          <select className="form-select" {...register('gender_rule')}>
            <option value="all">All Genders</option>
            <option value="male">Male Only</option>
            <option value="female">Female Only</option>
          </select>
        </Field>
        <Field label="Student Type">
          <select className="form-select" {...register('student_type_rule')}>
            <option value="all">All Students</option>
            <option value="new">New Only</option>
            <option value="returning">Returning Only</option>
          </select>
        </Field>
        <Field label="Boarding Type">
          <select className="form-select" {...register('boarding_rule')}>
            <option value="all">All Types</option>
            <option value="day">Day Only</option>
            <option value="boarding">Boarding Only</option>
          </select>
        </Field>
        <Field label="Compulsory?">
          <select className="form-select" {...register('is_compulsory')}>
            <option value="1">Compulsory</option>
            <option value="0">Elective</option>
          </select>
        </Field>
      </div>

      <Field label="Active?">
        <select className="form-select" {...register('is_active')}>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary btn">
          {editing ? 'Save Changes' : 'Add to Config'}
        </button>
      </div>
    </form>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BillConfigPage() {
  const [sessions, setSessions]       = useState([])
  const [classes, setClasses]         = useState([])
  const [feeItems, setFeeItems]       = useState([])
  const [currentTermId, setCurrentTermId] = useState(null)
  const [termLockState, setTermLockState] = useState({}) // termId → { locked, reason }
  const [terms, setTerms]             = useState([])
  const [configs, setConfigs]         = useState([])
  const [loading, setLoading]         = useState(false)

  const [selSession, setSelSession]   = useState('')
  const [selTerm, setSelTerm]         = useState('')
  const [selClass, setSelClass]       = useState('')

  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    async function init() {
      const [sess, cls, fi, currentTerm] = await Promise.all([
        window.api.listSessions(),
        window.api.listClasses(),
        window.api.listFeeItems(),
        window.api.getCurrentTerm(),
      ])
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
      setFeeItems(fi)
      // Auto-select current session/term
      if (currentTerm) {
        setCurrentTermId(currentTerm.id)
        setSelSession(String(currentTerm.session_id))
        const termList = await window.api.listTerms(currentTerm.session_id)
        setTerms(termList)
        setSelTerm(String(currentTerm.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSession) {
      window.api.listTerms(Number(selSession)).then(t => { setTerms(t); setSelTerm('') })
    } else {
      setTerms([]); setSelTerm('')
    }
  }, [selSession])

  const loadConfigs = useCallback(async () => {
    if (!selTerm || !selClass) { setConfigs([]); return }
    setLoading(true)
    const data = await window.api.listBillConfig({ term_id: Number(selTerm), class_id: Number(selClass) })
    setConfigs(data)
    setLoading(false)
  }, [selTerm, selClass])

  useEffect(() => { loadConfigs() }, [loadConfigs])

  const existingFeeItemIds = configs.map(c => c.fee_item_id)

  const handleSubmit = async (data) => {
    try {
      await window.api.upsertBillConfig({
        id: editing?.id,
        term_id: Number(selTerm),
        class_id: Number(selClass),
        fee_item_id: Number(data.fee_item_id),
        amount: Number(data.amount),
        gender_rule: data.gender_rule,
        student_type_rule: data.student_type_rule,
        boarding_rule: data.boarding_rule,
        is_compulsory: Number(data.is_compulsory),
        is_active: Number(data.is_active),
      })
      toast.success(editing ? 'Config updated' : 'Fee item added to config')
      setShowModal(false)
      setEditing(null)
      loadConfigs()
    } catch (e) { toast.error(e.message || 'Failed to save') }
  }

  const onDelete = async () => {
    try {
      await window.api.deleteBillConfig(deleteTarget.id)
      toast.success(`"${deleteTarget.fee_item_name}" removed from config`)
      loadConfigs()
    } catch (e) { toast.error(e.message || 'Cannot delete') }
  }

  const totalAmount = configs.filter(c => c.is_active).reduce((s, c) => s + Number(c.amount), 0)

  const columns = [
    {
      key: 'fee_item_name', label: 'Fee Item',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900">{v}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <RulePill value={row.gender_rule}       type="gender_rule" />
            <RulePill value={row.student_type_rule} type="student_type_rule" />
            <RulePill value={row.boarding_rule}     type="boarding_rule" />
          </div>
        </div>
      )
    },
    {
      key: 'amount', label: 'Amount', width: '130px',
      render: v => <span className="font-semibold text-gray-900">{fmt(v)}</span>
    },
    {
      key: 'is_compulsory', label: 'Type', width: '110px',
      render: v => v
        ? <span className="badge-green badge">Compulsory</span>
        : <span className="badge-yellow badge">Elective</span>
    },
    {
      key: 'is_active', label: 'Status', width: '90px',
      render: v => v
        ? <span className="badge-blue badge">Active</span>
        : <span className="badge-gray badge">Inactive</span>
    },
    {
      key: 'actions', label: '', width: '90px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); setEditing(row); setShowModal(true) }}
            disabled={isPastTerm}
            title={isPastTerm ? 'Past term — cannot edit' : 'Edit'}>
            <Pencil size={12} />
          </button>
          <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
            disabled={isPastTerm}
            title={isPastTerm ? 'Past term — cannot delete' : 'Delete'}>
            <Trash2 size={12} />
          </button>
        </div>
      )
    }
  ]

  // Past terms are always locked in the UI.
  // Current/future terms: lock state is determined by whether payments exist
  // (backend enforces this — UI shows it after a failed save attempt).
  const isPastTerm   = currentTermId !== null && Number(selTerm) < currentTermId
  const isTermLocked = isPastTerm
  const canAdd       = selTerm && selClass && !isPastTerm

  return (
    <div>
      <PageHeader
        title="Bill Configuration"
        subtitle="Set what each class is charged per term. Apply gender, boarding, and student-type rules to each item."
      />

      {/* Selector bar */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-40">
            <label className="form-label flex items-center gap-1">
              <Filter size={12} className="text-gray-400" /> Session
            </label>
            <select className="form-select" value={selSession} onChange={e => setSelSession(e.target.value)}>
              <option value="">— Select session —</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="form-label">Term</label>
            <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
              <option value="">— Select term —</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="form-label">Class</label>
            <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            className="btn-primary btn"
            disabled={!canAdd}
            onClick={() => { setEditing(null); setShowModal(true) }}
          >
            <Plus size={15} /> Add Fee Item
          </button>
        </div>
      </div>

      {/* Lock banner for past terms */}
      {selTerm && selClass && isPastTerm && (
        <div className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-300 flex items-center gap-3">
          <span className="text-gray-500 text-lg">🔒</span>
          <div>
            <p className="font-semibold text-gray-700 text-sm">Past term — read only.</p>
            <p className="text-gray-500 text-xs mt-0.5">Fee configuration for past terms cannot be changed. To correct a student's bill from a past term, use adjustments on their individual bill page.</p>
          </div>
        </div>
      )}

      {/* No selection prompt */}
      {!selTerm || !selClass ? (
        <div className="card text-center py-12">
          <SlidersHorizontal size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select a session, term and class above</p>
          <p className="text-gray-400 text-sm mt-1">to view and configure billing for that combination</p>
        </div>
      ) : null}

      {/* Config table */}
      {selTerm && selClass && (
        <div className="card overflow-hidden p-0">
          {/* Table header summary */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{configs.length} fee item{configs.length !== 1 ? 's' : ''}</span>
              {configs.length > 0 && (
                <span className="text-gray-400"> · Total (all active): <span className="font-semibold text-gray-700">{fmt(totalAmount)}</span></span>
              )}
            </div>
            {configs.length > 0 && (
              <p className="text-xs text-gray-400">
                {classes.find(c => c.id === Number(selClass))?.name} ·&nbsp;
                {terms.find(t => t.id === Number(selTerm))?.name}
              </p>
            )}
          </div>

          {loading ? (
            <Spinner />
          ) : configs.length === 0 ? (
            <div className="empty-state py-12">
              <SlidersHorizontal size={30} className="empty-state-icon" />
              <p className="empty-state-title">No fee items configured</p>
              <p className="empty-state-sub">Click "Add Fee Item" to start configuring fees for this class and term</p>
            </div>
          ) : (
            <DataTable columns={columns} data={configs} />
          )}
        </div>
      )}

      {/* Info box */}
      {selTerm && selClass && !isTermLocked && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2.5 text-sm text-blue-800">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
          <span>
            Rules are evaluated together. A student must match <strong>all</strong> rule conditions to receive that fee item.
            Use <strong>Copy Config</strong> to duplicate this setup to another class or term.
          </span>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        title={editing ? `Edit: ${editing.fee_item_name}` : 'Add Fee Item to Config'}
        size="md"
      >
        <ConfigForm
          feeItems={feeItems}
          existingItems={existingFeeItemIds}
          editing={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowModal(false); setEditing(null) }}
        />
      </Modal>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Remove from Config"
        message={`Remove "${deleteTarget?.fee_item_name}" from this term's billing configuration? Bills already generated from this config cannot be deleted.`}
      />
    </div>
  )
}
