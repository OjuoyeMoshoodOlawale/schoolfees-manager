import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  id:null, name:'', contact_person:'', phone:'', email:'', address:'',
  bank_name:'', account_number:'', account_name:'', is_active:1,
}

export default function SuppliersPage() {
  const { canEdit } = useAuth()
  const [suppliers, setSuppliers]  = useState([])
  const [loading,   setLoading]    = useState(true)
  const [modal,     setModal]      = useState(false)
  const [form,      setForm]       = useState(EMPTY)
  const [saving,    setSaving]     = useState(false)
  const [expandId,  setExpandId]   = useState(null)
  const [showAll,   setShowAll]    = useState(false)

  const load = async () => {
    setLoading(true)
    try { setSuppliers(await window.api.expenseSuppliersList({ include_inactive: showAll })) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [showAll])

  const openNew  = () => { setForm(EMPTY); setModal(true) }
  const openEdit = s  => { setForm(s); setModal(true) }

  const save = async () => {
    if (!form.name) return toast.error('Supplier name required')
    setSaving(true)
    try {
      await window.api.expenseSupplierSave(form)
      toast.success(form.id ? 'Updated' : 'Supplier added')
      setModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete supplier?')) return
    try { await window.api.expenseSupplierDelete(id); toast.success('Deleted'); load() }
    catch(e) { toast.error(e.message) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Vendors and service providers for expense tracking"
        actions={canEdit && (
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              Show inactive
            </label>
            <button className="btn-primary btn btn-sm" onClick={openNew}><Plus size={14}/> Add Supplier</button>
          </div>
        )}
      />

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Status</th>
              {canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {suppliers.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8">No suppliers yet.</td></tr>
              )}
              {suppliers.map(s => (
                <>
                  <tr key={s.id} className={s.is_active?'':'opacity-50'}>
                    <td>
                      <button className="font-semibold text-left hover:text-blue-600 flex items-center gap-1"
                        onClick={() => setExpandId(expandId===s.id?null:s.id)}>
                        {s.name}
                        {expandId===s.id?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                      </button>
                    </td>
                    <td className="text-gray-600">{s.contact_person||'—'}</td>
                    <td className="text-gray-600">{s.phone||'—'}</td>
                    <td className="text-gray-600">{s.email||'—'}</td>
                    <td><span className={`badge ${s.is_active?'badge-green':'badge-gray'}`}>{s.is_active?'Active':'Inactive'}</span></td>
                    {canEdit && (
                      <td className="flex gap-1">
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)}><Pencil size={12}/></button>
                        <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(s.id)}><Trash2 size={12}/></button>
                      </td>
                    )}
                  </tr>
                  {expandId===s.id && (
                    <tr key={`${s.id}-exp`} className="bg-blue-50 border-b">
                      <td colSpan={canEdit?6:5} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          {[['Address',s.address||'—'],['Bank',s.bank_name||'—'],['Account No.',s.account_number||'—'],['Account Name',s.account_name||'—']].map(([k,v])=>(
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

      <Modal open={modal} onClose={() => setModal(false)} title={form.id?'Edit Supplier':'New Supplier'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="form-label">Supplier Name *</label>
            <input className="form-input" value={form.name} onChange={f('name')} placeholder="Company or individual name"/>
          </div>
          {[['contact_person','Contact Person'],['phone','Phone'],['email','Email'],['address','Address']].map(([k,l])=>(
            <div key={k} className={k==='address'?'sm:col-span-2':''}>
              <label className="form-label">{l}</label>
              <input className="form-input" value={form[k]} onChange={f(k)}/>
            </div>
          ))}
          <div className="sm:col-span-2 border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Bank Details</p>
          </div>
          {[['bank_name','Bank Name'],['account_number','Account Number'],['account_name','Account Name']].map(([k,l])=>(
            <div key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" value={form[k]} onChange={f(k)}/>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="supactive" checked={!!form.is_active} onChange={e=>setForm(p=>({...p,is_active:e.target.checked?1:0}))}/>
            <label htmlFor="supactive" className="text-sm text-gray-700">Active</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':form.id?'Update':'Add Supplier'}</button>
        </div>
      </Modal>
    </div>
  )
}
