import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, PowerOff, Power, ChevronDown, ChevronUp, X } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const DEPTS = ['Teaching','Administration','Maintenance','Security','Catering','Other']
const EMPTY = {
  id: null, staff_number: '', first_name: '', last_name: '', other_names: '',
  gender: 'M', phone: '', email: '', address: '', department: '', designation: '',
  date_of_birth: '', date_joined: '', bank_name: '', account_number: '', account_name: '',
  tax_id: '', pension_pin: '', salary_grade_id: '', basic_salary: '', housing_allowance: '',
  transport_allowance: '', other_allowances: '', is_active: 1,
}

export default function StaffPage() {
  const { canEdit, fmt } = useAuth()
  const [staff,   setStaff]   = useState([])
  const [grades,  setGrades]  = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [expandId, setExpandId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [s, g] = await Promise.all([
        window.api.payrollStaffList({ include_inactive: showInactive }),
        window.api.payrollGradesList(),
      ])
      setStaff(s); setGrades(g)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [showInactive])

  const openNew  = () => { setForm(EMPTY); setModal(true) }
  const openEdit = s  => { setForm({ ...s, salary_grade_id: s.salary_grade_id || '' }); setModal(true) }

  const applyGrade = (gradeId) => {
    const g = grades.find(g => String(g.id) === String(gradeId))
    if (g) {
      setForm(f => ({
        ...f,
        salary_grade_id: gradeId,
        basic_salary: g.basic_salary,
        housing_allowance: g.housing_allowance,
        transport_allowance: g.transport_allowance,
        other_allowances: g.other_allowances,
      }))
    } else {
      setForm(f => ({ ...f, salary_grade_id: gradeId }))
    }
  }

  const save = async () => {
    if (!form.first_name || !form.last_name) return toast.error('First and last name required')
    if (!form.basic_salary && Number(form.basic_salary) !== 0) return toast.error('Basic salary required')
    setSaving(true)
    try {
      await window.api.payrollStaffSave(form)
      toast.success(form.id ? 'Staff updated' : 'Staff added')
      setModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggle = async (id) => {
    try { await window.api.payrollStaffToggle(id); load() }
    catch(e) { toast.error(e.message) }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const grossPreview = (s) => {
    const b = Number(s.basic_salary)||0, h = Number(s.housing_allowance)||0
    const t = Number(s.transport_allowance)||0, o = Number(s.other_allowances)||0
    return b+h+t+o
  }

  return (
    <div>
      <PageHeader title="Staff" subtitle="Manage all school staff members"
        actions={canEdit && (
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
            <button className="btn-primary btn btn-sm" onClick={openNew}><Plus size={14}/> Add Staff</button>
          </div>
        )}
      />

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>Staff #</th><th>Name</th><th>Department</th><th>Designation</th>
              <th className="text-right">Gross Salary</th><th>Status</th>
              {canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {staff.length === 0 && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-8">No staff found. Add your first staff member.</td></tr>
              )}
              {staff.map(s => (
                <>
                  <tr key={s.id} className={s.is_active ? '' : 'opacity-50'}>
                    <td className="font-mono text-xs">{s.staff_number}</td>
                    <td>
                      <button className="font-semibold text-left hover:text-blue-600 transition-colors flex items-center gap-1"
                        onClick={() => setExpandId(expandId === s.id ? null : s.id)}>
                        {s.last_name}, {s.first_name}
                        {expandId === s.id ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                      </button>
                      {s.other_names && <div className="text-xs text-gray-400">{s.other_names}</div>}
                    </td>
                    <td className="text-gray-600">{s.department || '—'}</td>
                    <td className="text-gray-600">{s.designation || '—'}</td>
                    <td className="text-right font-semibold">{fmt(grossPreview(s))}</td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="flex gap-1">
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)}><Pencil size={12}/></button>
                        <button className="btn btn-sm btn-secondary" onClick={() => toggle(s.id)}
                          title={s.is_active ? 'Deactivate' : 'Activate'}>
                          {s.is_active ? <PowerOff size={12}/> : <Power size={12}/>}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandId === s.id && (
                    <tr key={`${s.id}-exp`} className="bg-blue-50 border-b">
                      <td colSpan={canEdit ? 7 : 6} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {[
                            ['Basic',     fmt(s.basic_salary)],
                            ['Housing',   fmt(s.housing_allowance)],
                            ['Transport', fmt(s.transport_allowance)],
                            ['Other',     fmt(s.other_allowances)],
                            ['Phone',     s.phone || '—'],
                            ['Email',     s.email || '—'],
                            ['Bank',      s.bank_name || '—'],
                            ['Account',   s.account_number || '—'],
                            ['TIN',       s.tax_id || '—'],
                            ['Pension PIN', s.pension_pin || '—'],
                            ['Grade',     s.grade_name || '—'],
                            ['Joined',    s.date_joined || '—'],
                          ].map(([k,v]) => (
                            <div key={k}><span className="text-gray-400">{k}:</span> <span className="font-medium">{v}</span></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Staff' : 'Add Staff'} size="xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">First Name *</label>
            <input className="form-input" value={form.first_name} onChange={f('first_name')} />
          </div>
          <div>
            <label className="form-label">Last Name *</label>
            <input className="form-input" value={form.last_name} onChange={f('last_name')} />
          </div>
          <div>
            <label className="form-label">Other Names</label>
            <input className="form-input" value={form.other_names} onChange={f('other_names')} />
          </div>
          <div>
            <label className="form-label">Gender</label>
            <select className="form-select" value={form.gender} onChange={f('gender')}>
              <option value="M">Male</option><option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="form-select" value={form.department} onChange={f('department')}>
              <option value="">— Select —</option>
              {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Designation</label>
            <input className="form-input" placeholder="e.g. Class Teacher, Principal" value={form.designation} onChange={f('designation')} />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone} onChange={f('phone')} />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={f('email')} />
          </div>
          <div>
            <label className="form-label">Date of Birth</label>
            <input className="form-input" type="date" value={form.date_of_birth} onChange={f('date_of_birth')} />
          </div>
          <div>
            <label className="form-label">Date Joined</label>
            <input className="form-input" type="date" value={form.date_joined} onChange={f('date_joined')} />
          </div>

          <div className="sm:col-span-2 border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Salary</p>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Salary Grade (optional — loads salary components)</label>
            <select className="form-select" value={form.salary_grade_id} onChange={e => applyGrade(e.target.value)}>
              <option value="">— Manual entry —</option>
              {grades.filter(g => g.is_active).map(g => (
                <option key={g.id} value={g.id}>{g.name} — Basic: {fmt(g.basic_salary)}</option>
              ))}
            </select>
          </div>
          {[['basic_salary','Basic Salary *'],['housing_allowance','Housing Allowance'],
            ['transport_allowance','Transport Allowance'],['other_allowances','Other Allowances']].map(([k,l]) => (
            <div key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" type="number" min="0" value={form[k]} onChange={f(k)} />
            </div>
          ))}

          <div className="sm:col-span-2 border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Bank & Tax Details</p>
          </div>
          {[['bank_name','Bank Name'],['account_number','Account Number'],['account_name','Account Name'],
            ['tax_id','Tax ID (TIN)'],['pension_pin','Pension PIN'],['address','Address']].map(([k,l]) => (
            <div key={k} className={k === 'address' ? 'sm:col-span-2' : ''}>
              <label className="form-label">{l}</label>
              <input className="form-input" value={form[k]} onChange={f(k)} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Update Staff' : 'Add Staff'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
