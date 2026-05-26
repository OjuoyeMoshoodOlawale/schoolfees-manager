import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  id: null, name: '', basic_salary: '', housing_allowance: '',
  transport_allowance: '', other_allowances: '', description: '', is_active: 1,
}

export default function SalaryGradesPage() {
  const { canEdit, fmt } = useAuth()
  const [grades,  setGrades]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)

  const load = async () => {
    setLoading(true)
    try { setGrades(await window.api.payrollGradesList()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openNew  = () => { setForm(EMPTY); setModal(true) }
  const openEdit = g  => { setForm(g);     setModal(true) }

  const save = async () => {
    if (!form.name) return toast.error('Grade name required')
    setSaving(true)
    try {
      await window.api.payrollGradeSave(form)
      toast.success(form.id ? 'Grade updated' : 'Grade created')
      setModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this grade?')) return
    try { await window.api.payrollGradeDelete(id); toast.success('Deleted'); load() }
    catch(e) { toast.error(e.message) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const gross = g => (Number(g.basic_salary)||0) + (Number(g.housing_allowance)||0)
                  + (Number(g.transport_allowance)||0) + (Number(g.other_allowances)||0)

  return (
    <div>
      <PageHeader title="Salary Grades" subtitle="Define pay bands — assign to staff for quick salary entry"
        actions={canEdit && (
          <button className="btn-primary btn btn-sm" onClick={openNew}><Plus size={14}/> Add Grade</button>
        )}
      />

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>Grade Name</th><th className="text-right">Basic</th><th className="text-right">Housing</th>
              <th className="text-right">Transport</th><th className="text-right">Other</th>
              <th className="text-right">Gross</th><th>Status</th>
              {canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {grades.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">No grades yet. Create your first salary grade.</td></tr>
              )}
              {grades.map(g => (
                <tr key={g.id} className={g.is_active ? '' : 'opacity-50'}>
                  <td className="font-semibold">
                    {g.name}
                    {g.description && <div className="text-xs text-gray-400">{g.description}</div>}
                  </td>
                  <td className="text-right">{fmt(g.basic_salary)}</td>
                  <td className="text-right text-gray-600">{fmt(g.housing_allowance)}</td>
                  <td className="text-right text-gray-600">{fmt(g.transport_allowance)}</td>
                  <td className="text-right text-gray-600">{fmt(g.other_allowances)}</td>
                  <td className="text-right font-bold text-emerald-700">{fmt(gross(g))}</td>
                  <td><span className={`badge ${g.is_active ? 'badge-green' : 'badge-gray'}`}>{g.is_active ? 'Active' : 'Inactive'}</span></td>
                  {canEdit && (
                    <td className="flex gap-1">
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(g)}><Pencil size={12}/></button>
                      <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(g.id)}><Trash2 size={12}/></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Grade' : 'New Salary Grade'}>
        <div className="space-y-3">
          <div>
            <label className="form-label">Grade Name *</label>
            <input className="form-input" placeholder="e.g. Grade Level 7, Senior Teacher" value={form.name} onChange={f('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['basic_salary','Basic Salary'],['housing_allowance','Housing Allowance'],
              ['transport_allowance','Transport Allowance'],['other_allowances','Other Allowances']].map(([k,l]) => (
              <div key={k}>
                <label className="form-label">{l}</label>
                <input className="form-input" type="number" min="0" value={form[k]} onChange={f(k)} />
              </div>
            ))}
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="Optional note" value={form.description} onChange={f('description')} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="gactive" checked={!!form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} />
            <label htmlFor="gactive" className="text-sm text-gray-700">Active</label>
          </div>
          {/* Gross preview */}
          <div className="bg-emerald-50 rounded-lg px-4 py-2 text-sm flex justify-between">
            <span className="text-gray-600">Gross total</span>
            <span className="font-bold text-emerald-700">
              {fmt((Number(form.basic_salary)||0)+(Number(form.housing_allowance)||0)
                  +(Number(form.transport_allowance)||0)+(Number(form.other_allowances)||0))}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Grade'}</button>
        </div>
      </Modal>
    </div>
  )
}
