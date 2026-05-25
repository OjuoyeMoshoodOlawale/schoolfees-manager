import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Shield, Plus, Pencil, Trash2, Eye, EyeOff, UserCheck } from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, DataTable, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const ROLE_LABELS = {
  admin:  { label: 'Admin',  color: 'badge-blue',  desc: 'Full access — can manage everything' },
  bursar: { label: 'Bursar', color: 'badge-green', desc: 'Post payments, view reports, no settings' },
  viewer: { label: 'Viewer', color: 'badge-gray',  desc: 'Read-only access to reports' },
}

export default function UsersPage() {
  const { user: currentUser, isDeveloper } = useAuth()
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showPwd, setShowPwd]         = useState(false)
  const [showPwdModal, setShowPwdModal] = useState(null)

  const { register, handleSubmit, reset, formState: { errors }, watch } = useForm()
  const pwdForm = useForm()

  const load = async () => {
    const data = await window.api.listUsers()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    reset({ full_name: '', username: '', password: '', role: 'bursar', is_active: true })
    setShowModal(true)
  }

  const openEdit = (u) => {
    setEditing(u)
    reset({ full_name: u.full_name, username: u.username, role: u.role, is_active: u.is_active === 1 })
    setShowModal(true)
  }

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await window.api.updateUser({
          id: editing.id, full_name: data.full_name, role: data.role,
          is_active: data.is_active ? 1 : 0,
          new_password: data.new_password || undefined,
        })
        toast.success('User updated')
      } else {
        await window.api.createUser({
          username: data.username.trim().toLowerCase(),
          full_name: data.full_name.trim(),
          password: data.password,
          role: data.role,
        })
        toast.success(`User ${data.username} created`)
      }
      setShowModal(false)
      load()
    } catch (e) { toast.error(e.message || 'Failed to save user') }
  }

  const onDelete = async () => {
    if (deleteTarget.id === currentUser?.id) { toast.error("You can't delete your own account"); return }
    await window.api.deleteUser(deleteTarget.id)
    toast.success('User deleted')
    load()
  }

  const onChangePwd = async (data) => {
    if (data.new_password !== data.confirm_password) {
      pwdForm.setError('confirm_password', { message: 'Passwords do not match' })
      return
    }
    try {
      await window.api.changePassword({
        id: currentUser.id,
        old_password: data.old_password,
        new_password: data.new_password,
      })
      toast.success('Password changed')
      setShowPwdModal(false)
      pwdForm.reset()
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  const columns = [
    {
      key: 'full_name', label: 'Name',
      render: (v, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
            {v?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{v}</p>
            <p className="text-xs text-gray-400">@{row.username}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role', label: 'Role', width: '110px',
      render: v => {
        const r = ROLE_LABELS[v] || { label: v, color: 'badge-gray' }
        return <span className={`badge ${r.color}`}>{r.label}</span>
      }
    },
    {
      key: 'is_active', label: 'Status', width: '90px',
      render: v => v ? <span className="badge-green badge">Active</span> : <span className="badge-red badge">Inactive</span>
    },
    {
      key: 'last_login', label: 'Last Login', width: '130px',
      render: v => <span className="text-xs text-gray-400">{v ? v.slice(0, 16).replace('T', ' ') : 'Never'}</span>
    },
    {
      key: 'actions', label: '', width: '90px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); openEdit(row) }}>
            <Pencil size={12} />
          </button>
          {row.id !== currentUser?.id && (
            <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
              onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )
    }
  ]

  if (loading) return <Spinner />

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Users & Access"
        subtitle="Manage who can log in and what they can access."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={() => setShowPwdModal(true)}>
              <Shield size={14} /> Change My Password
            </button>
            <button className="btn-primary btn" onClick={openAdd}>
              <Plus size={15} /> Add User
            </button>
          </div>
        }
      />

      {/* Role info */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Object.entries(ROLE_LABELS).map(([key, r]) => (
          <div key={key} className="card-sm">
            <span className={`badge ${r.color} mb-2`}>{r.label}</span>
            <p className="text-xs text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        {/* Developer note */}
        {isDeveloper && (
          <div className="px-4 py-2 bg-purple-50 border-b border-purple-200 text-xs text-purple-700">
            Developer login is hardcoded and does not appear in this list. It always has full access.
          </div>
        )}
        <DataTable columns={columns} data={users} emptyMessage="No users yet. Add the first user above." />
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit: ${editing.full_name}` : 'Add User'}
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onSubmit)}>
              {editing ? 'Save Changes' : 'Create User'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full Name" required error={errors.full_name?.message}>
            <input className="form-input" placeholder="e.g. Amaka Okafor"
              {...register('full_name', { required: 'Full name required' })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username" required error={errors.username?.message}>
              <input className="form-input" placeholder="e.g. amaka.okafor" disabled={!!editing}
                {...register('username', { required: !editing && 'Username required' })} />
            </Field>
            <Field label="Role" required>
              <select className="form-select" {...register('role')}>
                <option value="admin">Admin</option>
                <option value="bursar">Bursar</option>
                <option value="viewer">Viewer</option>
              </select>
            </Field>
          </div>
          {!editing ? (
            <Field label="Password" required error={errors.password?.message}>
              <input type="password" className="form-input" placeholder="Min 6 characters"
                {...register('password', { required: 'Password required', minLength: { value: 6, message: 'Min 6 chars' } })} />
            </Field>
          ) : (
            <Field label="New Password" hint="Leave blank to keep current password">
              <input type="password" className="form-input" placeholder="Leave blank to keep current"
                {...register('new_password')} />
            </Field>
          )}
          {editing && (
            <Field label="Status">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('is_active')} />
                <span className="text-sm text-gray-700">Active (can log in)</span>
              </label>
            </Field>
          )}
        </div>
      </Modal>

      {/* Change my password modal */}
      <Modal
        open={!!showPwdModal}
        onClose={() => { setShowPwdModal(false); pwdForm.reset() }}
        title="Change My Password"
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => { setShowPwdModal(false); pwdForm.reset() }}>Cancel</button>
            <button className="btn-primary btn" onClick={pwdForm.handleSubmit(onChangePwd)}>Change Password</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Current Password" required error={pwdForm.formState.errors.old_password?.message}>
            <input type="password" className="form-input"
              {...pwdForm.register('old_password', { required: 'Enter current password' })} />
          </Field>
          <Field label="New Password" required error={pwdForm.formState.errors.new_password?.message}>
            <input type="password" className="form-input"
              {...pwdForm.register('new_password', { required: 'Enter new password', minLength: { value: 6, message: 'Min 6 chars' } })} />
          </Field>
          <Field label="Confirm New Password" required error={pwdForm.formState.errors.confirm_password?.message}>
            <input type="password" className="form-input"
              {...pwdForm.register('confirm_password', { required: 'Confirm password' })} />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Delete User"
        message={`Delete user "${deleteTarget?.full_name}" (@${deleteTarget?.username})? They will no longer be able to log in.`}
      />
    </div>
  )
}
