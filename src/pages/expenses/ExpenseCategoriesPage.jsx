import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function ExpenseCategoriesPage() {
  const { canEdit } = useAuth()
  const [categories, setCategories] = useState([])
  const [accounts,   setAccounts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [form,       setForm]       = useState({ id:null, name:'', account_id:'', description:'', is_active:1 })
  const [saving,     setSaving]     = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [c, a] = await Promise.all([
        window.api.expenseCategoriesList(),
        window.api.listAccounts(),
      ])
      setCategories(c)
      setAccounts((a||[]).filter(a => a.type === 'expense' && a.is_active))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openNew  = () => setForm({ id:null, name:'', account_id:'', description:'', is_active:1 })
  const openEdit = c  => setForm({ ...c, account_id: c.account_id||'' })

  const save = async () => {
    if (!form.name) return toast.error('Category name required')
    setSaving(true)
    try {
      await window.api.expenseCategorySave({ ...form, account_id: form.account_id ? Number(form.account_id) : null })
      toast.success(form.id ? 'Updated' : 'Category created')
      setModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this category?')) return
    try { await window.api.expenseCategoryDelete(id); toast.success('Deleted'); load() }
    catch(e) { toast.error(e.message) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <PageHeader title="Expense Categories" subtitle="Define expense types and link them to chart-of-accounts"
        actions={canEdit && (
          <button className="btn-primary btn btn-sm" onClick={() => { openNew(); setModal(true) }}>
            <Plus size={14}/> Add Category
          </button>
        )}
      />

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>Name</th><th>Linked Account</th><th>Description</th><th>Status</th>
              {canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {categories.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">No categories. Default categories are seeded on first run.</td></tr>
              )}
              {categories.map(c => (
                <tr key={c.id} className={c.is_active ? '' : 'opacity-50'}>
                  <td className="font-semibold">{c.name}</td>
                  <td className="text-sm">
                    {c.account_code
                      ? <span className="font-mono text-xs text-blue-600">{c.account_code}</span>
                      : null} {c.account_name||<span className="text-orange-500 text-xs">⚠ No account linked</span>}
                  </td>
                  <td className="text-gray-500 text-sm">{c.description||'—'}</td>
                  <td><span className={`badge ${c.is_active?'badge-green':'badge-gray'}`}>{c.is_active?'Active':'Inactive'}</span></td>
                  {canEdit && (
                    <td className="flex gap-1">
                      <button className="btn btn-sm btn-secondary" onClick={() => { openEdit(c); setModal(true) }}><Pencil size={12}/></button>
                      <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(c.id)}><Trash2 size={12}/></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Category' : 'New Category'}>
        <div className="space-y-3">
          <div>
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={f('name')} placeholder="e.g. Generator Fuel" />
          </div>
          <div>
            <label className="form-label">Chart of Accounts (Expense Account)</label>
            <select className="form-select" value={form.account_id} onChange={f('account_id')}>
              <option value="">— Select account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">When an expense in this category is approved, it will debit this account.</p>
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={f('description')} placeholder="Optional note" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="catactive" checked={!!form.is_active} onChange={e => setForm(p => ({...p, is_active: e.target.checked?1:0}))} />
            <label htmlFor="catactive" className="text-sm text-gray-700">Active</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
        </div>
      </Modal>
    </div>
  )
}
