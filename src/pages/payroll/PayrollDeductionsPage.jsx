import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const now = new Date()

const EMPTY_DED = { id: null, name: '', amount: '', is_recurring: 1, month: '', year: '', notes: '' }

export default function PayrollDeductionsPage() {
  const { canEdit, fmt } = useAuth()
  const [staff,    setStaff]    = useState([])
  const [selStaff, setSelStaff] = useState('')
  const [deds,     setDeds]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY_DED)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    window.api.payrollStaffList({ include_inactive: false }).then(setStaff)
  }, [])

  useEffect(() => {
    if (!selStaff) { setDeds([]); return }
    setLoading(true)
    window.api.payrollDeductionsList({ staff_id: Number(selStaff) })
      .then(setDeds).finally(() => setLoading(false))
  }, [selStaff])

  const openNew = () => {
    if (!selStaff) return toast.warn('Select a staff member first')
    setForm({ ...EMPTY_DED, month: String(now.getMonth() + 1), year: String(now.getFullYear()) })
    setModal(true)
  }

  const save = async () => {
    if (!form.name)   return toast.error('Deduction name required')
    if (!form.amount) return toast.error('Amount required')
    setSaving(true)
    try {
      await window.api.payrollDeductionSave({ ...form, staff_id: Number(selStaff) })
      toast.success(form.id ? 'Updated' : 'Added')
      setModal(false)
      window.api.payrollDeductionsList({ staff_id: Number(selStaff) }).then(setDeds)
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Remove this deduction?')) return
    await window.api.payrollDeductionDelete(id)
    toast.success('Removed')
    window.api.payrollDeductionsList({ staff_id: Number(selStaff) }).then(setDeds)
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const selectedStaff = staff.find(s => String(s.id) === String(selStaff))

  return (
    <div>
      <PageHeader title="Extra Deductions" subtitle="One-off or recurring deductions applied to staff pay (e.g. loans, disciplinary)"
        actions={canEdit && selStaff && (
          <button className="btn-primary btn btn-sm" onClick={openNew}><Plus size={14}/> Add Deduction</button>
        )}
      />

      <div className="card mb-5">
        <label className="form-label">Select Staff Member</label>
        <select className="form-select max-w-sm" value={selStaff} onChange={e => setSelStaff(e.target.value)}>
          <option value="">— Select staff —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.staff_number})</option>)}
        </select>
      </div>

      {selStaff && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 bg-gray-50 border-b">
            <h3 className="text-sm font-semibold text-gray-700">
              Deductions for {selectedStaff?.last_name}, {selectedStaff?.first_name}
            </h3>
          </div>
          {loading ? <div className="p-6"><Spinner/></div> : (
            <table className="data-table">
              <thead><tr>
                <th>Name</th><th className="text-right">Amount</th><th>Type</th>
                <th>Applies To</th><th>Notes</th>
                {canEdit && <th></th>}
              </tr></thead>
              <tbody>
                {deds.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-6">No extra deductions for this staff member.</td></tr>
                )}
                {deds.map(d => (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.name}</td>
                    <td className="text-right text-red-600 font-bold">{fmt(d.amount)}</td>
                    <td>
                      <span className={`badge ${d.is_recurring ? 'badge-orange' : 'badge-gray'}`}>
                        {d.is_recurring ? 'Recurring' : 'One-off'}
                      </span>
                    </td>
                    <td className="text-gray-500 text-xs">
                      {d.is_recurring ? 'Every month' : d.month && d.year ? `${MONTHS[d.month-1]} ${d.year}` : 'One time'}
                    </td>
                    <td className="text-gray-400 text-xs">{d.notes || '—'}</td>
                    {canEdit && (
                      <td>
                        <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(d.id)}><Trash2 size={12}/></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Add Deduction">
        <div className="space-y-3">
          <div>
            <label className="form-label">Deduction Name *</label>
            <input className="form-input" placeholder="e.g. Salary Advance, Loan Repayment" value={form.name} onChange={f('name')} />
          </div>
          <div>
            <label className="form-label">Amount *</label>
            <input className="form-input" type="number" min="0" value={form.amount} onChange={f('amount')} />
          </div>
          <div>
            <label className="form-label">Type</label>
            <select className="form-select" value={form.is_recurring} onChange={e => setForm(p => ({ ...p, is_recurring: Number(e.target.value) }))}>
              <option value={1}>Recurring (every month)</option>
              <option value={0}>One-off (specific month)</option>
            </select>
          </div>
          {!form.is_recurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Month</label>
                <select className="form-select" value={form.month} onChange={f('month')}>
                  {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Year</label>
                <input className="form-input" type="number" value={form.year} onChange={f('year')} />
              </div>
            </div>
          )}
          <div>
            <label className="form-label">Notes</label>
            <input className="form-input" placeholder="Optional reason" value={form.notes} onChange={f('notes')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Deduction'}</button>
        </div>
      </Modal>
    </div>
  )
}
