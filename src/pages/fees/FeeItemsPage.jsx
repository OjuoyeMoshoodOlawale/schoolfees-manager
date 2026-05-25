import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2, ListChecks, Zap } from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner, DataTable } from '../../components/ui'

export default function FeeItemsPage() {
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [seeding, setSeeding]         = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const load = async () => {
    const data = await window.api.listFeeItems()
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    reset({ name: '', description: '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    reset({ name: item.name, description: item.description || '', is_active: !!item.is_active })
    setShowModal(true)
  }

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await window.api.updateFeeItem({ id: editing.id, ...data, is_active: data.is_active ? 1 : 0 })
        toast.success(`"${data.name}" updated`)
      } else {
        await window.api.createFeeItem({ name: data.name, description: data.description })
        toast.success(`"${data.name}" created`)
      }
      setShowModal(false)
      load()
    } catch (e) {
      toast.error(e.message?.includes('UNIQUE') ? 'A fee item with that name already exists' : 'Failed to save')
    }
  }

  const onDelete = async () => {
    try {
      await window.api.deleteFeeItem(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" deleted`)
      load()
    } catch (e) { toast.error(e.message || 'Cannot delete fee item') }
  }

  const seedDefaults = async () => {
    setSeeding(true)
    try {
      await window.api.seedFeeItems()
      toast.success('Default fee items added')
      load()
    } finally { setSeeding(false) }
  }

  const columns = [
    {
      key: 'name', label: 'Fee Item Name',
      render: (v, row) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <ListChecks size={13} className="text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{v}</p>
            {row.description && <p className="text-xs text-gray-400">{row.description}</p>}
          </div>
        </div>
      )
    },
    {
      key: 'is_active', label: 'Status', width: '100px',
      render: v => v
        ? <span className="badge-green badge">Active</span>
        : <span className="badge-gray badge">Inactive</span>
    },
    {
      key: 'actions', label: '', width: '90px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); openEdit(row) }}>
            <Pencil size={12} />
          </button>
          <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}>
            <Trash2 size={12} />
          </button>
        </div>
      )
    }
  ]

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Fee Items"
        subtitle="Define the types of fees your school charges. These are reused across all terms and classes."
        actions={
          <div className="flex gap-2">
            {items.length === 0 && (
              <button className="btn-secondary btn" onClick={seedDefaults} disabled={seeding}>
                <Zap size={14} /> {seeding ? 'Adding…' : 'Add Defaults'}
              </button>
            )}
            <button className="btn-primary btn" onClick={openAdd}>
              <Plus size={15} /> Add Fee Item
            </button>
          </div>
        }
      />

      <div className="card overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="empty-state p-10">
            <ListChecks size={36} className="empty-state-icon" />
            <p className="empty-state-title">No fee items yet</p>
            <p className="empty-state-sub">Add items like Tuition, Sportswear, Medical Levy…</p>
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary btn" onClick={seedDefaults} disabled={seeding}>
                <Zap size={14} /> Add Defaults
              </button>
              <button className="btn-primary btn" onClick={openAdd}>
                <Plus size={14} /> Add Item
              </button>
            </div>
          </div>
        ) : (
          <DataTable columns={columns} data={items} emptyMessage="No fee items found" />
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit: ${editing.name}` : 'New Fee Item'}
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onSubmit)}>
              {editing ? 'Save Changes' : 'Create Fee Item'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Fee Item Name" required error={errors.name?.message}
            hint="e.g. Tuition Fee, Sportswear, Medical Levy, PTA Levy">
            <input className="form-input" placeholder="Tuition Fee"
              {...register('name', { required: 'Name is required' })} />
          </Field>
          <Field label="Description" hint="Optional — appears on fee statements">
            <input className="form-input" placeholder="e.g. Termly tuition fee for all students"
              {...register('description')} />
          </Field>
          {editing && (
            <Field label="Status">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('is_active')} />
                <span className="text-sm text-gray-700">Active (can be used in bill configurations)</span>
              </label>
            </Field>
          )}
        </div>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Delete Fee Item"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone. Fee items used in a bill configuration cannot be deleted.`}
      />
    </div>
  )
}
