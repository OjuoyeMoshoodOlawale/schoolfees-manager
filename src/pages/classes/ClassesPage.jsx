import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2, BookOpen, GripVertical } from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner, DataTable } from '../../components/ui'

// Preset Nigerian secondary school classes
const PRESETS = [
  { name: 'JSS 1', level: 1 }, { name: 'JSS 2', level: 2 }, { name: 'JSS 3', level: 3 },
  { name: 'SS 1',  level: 4 }, { name: 'SS 2',  level: 5 }, { name: 'SS 3',  level: 6 },
]

export default function ClassesPage() {
  const [classes, setClasses]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [seeding, setSeeding]           = useState(false)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm()

  const load = async () => {
    const data = await window.api.listClasses()
    setClasses(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    reset({ name: '', level: (classes.length + 1) * 10, is_active: 1 })
    setShowModal(true)
  }

  const openEdit = (cls) => {
    setEditing(cls)
    reset({ name: cls.name, level: cls.level, is_active: cls.is_active })
    setShowModal(true)
  }

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await window.api.updateClass({ id: editing.id, ...data, is_active: data.is_active ? 1 : 0 })
        toast.success(`${data.name} updated`)
      } else {
        await window.api.createClass({ name: data.name.trim(), level: Number(data.level) })
        toast.success(`${data.name} created`)
      }
      setShowModal(false)
      load()
    } catch (e) {
      toast.error(e.message?.includes('UNIQUE') ? 'A class with that name already exists' : 'Failed to save class')
    }
  }

  const onDelete = async () => {
    try {
      await window.api.deleteClass(deleteTarget.id)
      toast.success(`${deleteTarget.name} deleted`)
      load()
    } catch { toast.error('Cannot delete — class may have students assigned') }
  }

  const seedPresets = async () => {
    setSeeding(true)
    try {
      for (const p of PRESETS) {
        try { await window.api.createClass(p) } catch {} // skip existing
      }
      toast.success('Default classes added')
      load()
    } finally { setSeeding(false) }
  }

  const columns = [
    {
      key: 'level', label: 'Order', width: '80px',
      render: (v) => <span className="text-gray-400 text-xs font-mono">{v}</span>
    },
    {
      key: 'name', label: 'Class Name',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <BookOpen size={12} className="text-blue-600" />
          </div>
          <span className="font-medium text-gray-900">{v}</span>
        </div>
      )
    },
    {
      key: 'is_active', label: 'Status', width: '100px',
      render: (v) => v ? <span className="badge-green badge">Active</span> : <span className="badge-gray badge">Inactive</span>
    },
    {
      key: 'actions', label: '', width: '100px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={(e) => { e.stopPropagation(); openEdit(row) }}>
            <Pencil size={12} />
          </button>
          <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}>
            <Trash2 size={12} />
          </button>
        </div>
      )
    },
  ]

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Classes"
        subtitle="Define the classes in your school. Level determines promotion order."
        actions={
          <div className="flex gap-2">
            {classes.length === 0 && (
              <button className="btn-secondary btn" onClick={seedPresets} disabled={seeding}>
                {seeding ? 'Adding…' : '+ Add JSS1–SS3 defaults'}
              </button>
            )}
            <button className="btn-primary btn" onClick={openAdd}>
              <Plus size={15} /> Add Class
            </button>
          </div>
        }
      />

      <div className="card">
        {classes.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={36} className="empty-state-icon" />
            <p className="empty-state-title">No classes yet</p>
            <p className="empty-state-sub">Add your classes or use the defaults button above</p>
            <button className="btn-primary btn mt-4" onClick={openAdd}>
              <Plus size={15} /> Add First Class
            </button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={classes}
            emptyMessage="No classes found"
          />
        )}
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Class'}
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onSubmit)}>
              {editing ? 'Save Changes' : 'Add Class'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Class Name" required error={errors.name?.message}
            hint="e.g. JSS 1, SS 2, JSS 3A, SS 2 Science">
            <input
              className="form-input"
              placeholder="JSS 1"
              {...register('name', { required: 'Class name is required' })}
            />
          </Field>

          <Field label="Level / Order" required error={errors.level?.message}
            hint="Lower number = lower class. Used for promotion ordering. JSS1=1, SS3=6.">
            <input
              type="number"
              className="form-input"
              min="0"
              max="999"
              {...register('level', {
                required: 'Level is required',
                min: { value: 0, message: 'Level must be 0 or more' }
              })}
            />
          </Field>

          {editing && (
            <Field label="Status">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  {...register('is_active')} />
                <span className="text-sm text-gray-700">Active (students can be assigned to this class)</span>
              </label>
            </Field>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Delete Class"
        message={`Delete class "${deleteTarget?.name}"? This cannot be undone. You cannot delete a class that has students assigned.`}
      />
    </div>
  )
}
