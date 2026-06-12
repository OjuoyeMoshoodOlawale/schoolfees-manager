import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2, BookMarked } from 'lucide-react'
import { PageHeader, DataTable, Modal, Confirm, Field, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { playErrorSound } from '../../lib/sounds'

const TYPES = ['asset','liability','equity','income','expense']
const TYPE_COLORS = {
  asset:     'badge-blue',
  liability: 'badge-red',
  equity:    'badge-purple',
  income:    'badge-green',
  expense:   'badge-yellow',
}

export default function AccountsPage() {
  const { fmt } = useAuth()
  const [accounts, setAccounts]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const load = async () => {
    setAccounts(await window.api.listAccounts())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    reset({ code: '', name: '', type: 'asset', account_group: '' })
    setShowModal(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    reset({ code: a.code, name: a.name, type: a.type, account_group: a.account_group, is_active: a.is_active === 1 })
    setShowModal(true)
  }

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await window.api.updateAccount({ id: editing.id, ...data, is_active: data.is_active ? 1 : 0 })
        toast.success('Account updated')
      } else {
        await window.api.createAccount(data)
        toast.success('Account created')
      }
      setShowModal(false)
      load()
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  const onDelete = async () => {
    try {
      await window.api.deleteAccount(deleteTarget.id)
      toast.success('Account deleted')
      load()
    } catch (e) { toast.error(e.message || 'Cannot delete — account has journal entries') }
  }

  // Group by type
  const grouped = TYPES.map(type => ({
    type, accounts: accounts.filter(a => a.type === type)
  })).filter(g => g.accounts.length > 0)

  const columns = [
    { key: 'code', label: 'Code', width: '80px', render: v => <span className="font-mono text-xs text-gray-600">{v}</span> },
    { key: 'name', label: 'Account Name', render: (v, row) => (
      <div>
        <p className="font-medium text-gray-900">{v}</p>
        {row.account_group && <p className="text-xs text-gray-400">{row.account_group}</p>}
      </div>
    )},
    { key: 'balance', label: 'Balance', width: '130px', render: v => (
      <span className={`font-semibold ${Number(v) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(v)}</span>
    )},
    { key: 'is_active', label: 'Status', width: '80px', render: v => v ? <span className="badge-green badge">Active</span> : <span className="badge-gray badge">Inactive</span> },
    { key: 'actions', label: '', width: '80px', sortable: false, render: (_, row) => (
      <div className="flex gap-1 justify-end">
        <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200" onClick={e => { e.stopPropagation(); openEdit(row) }}><Pencil size={12} /></button>
        <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200" onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}><Trash2 size={12} /></button>
      </div>
    )}
  ]

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Manage all financial accounts used in journal entries."
        actions={<button className="btn-primary btn" onClick={openAdd}><Plus size={15} /> Add Account</button>}
      />

      <div className="space-y-4">
        {grouped.map(g => (
          <div key={g.type} className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <span className={`badge ${TYPE_COLORS[g.type] || 'badge-gray'} capitalize`}>{g.type}</span>
              <span className="text-xs text-gray-400">{g.accounts.length} account{g.accounts.length !== 1 ? 's' : ''}</span>
              <span className="ml-auto text-xs font-semibold text-gray-600">
                Balance: {fmt(g.accounts.reduce((s, a) => s + Number(a.balance), 0))}
              </span>
            </div>
            <DataTable columns={columns} data={g.accounts} />
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? `Edit: ${editing.name}` : 'New Account'}
        footer={<>
          <button className="btn-secondary btn" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary btn" onClick={handleSubmit(onSubmit, playErrorSound)}>{editing ? 'Save' : 'Create'}</button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Code" required error={errors.code?.message}>
              <input className="form-input font-mono" placeholder="e.g. 1001" {...register('code', { required: 'Code required' })} />
            </Field>
            <Field label="Type" required>
              <select className="form-select" {...register('type')}>
                {TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Account Name" required error={errors.name?.message}>
            <input className="form-input" placeholder="e.g. Cash on Hand" {...register('name', { required: 'Name required' })} />
          </Field>
          <Field label="Group / Category" hint="e.g. Current Assets, Operating Expenses">
            <input className="form-input" placeholder="e.g. Current Assets" {...register('account_group')} />
          </Field>
          {editing && <Field label="Status">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('is_active')} />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </Field>}
        </div>
      </Modal>

      <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} danger
        title="Delete Account" message={`Delete account "${deleteTarget?.name}" (${deleteTarget?.code})?`} />
    </div>
  )
}
