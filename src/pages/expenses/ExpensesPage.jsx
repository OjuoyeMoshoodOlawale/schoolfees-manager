import { useEffect, useState, useMemo } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, CheckCircle, DollarSign, XCircle, Trash2,
         Printer, Loader, Filter, Eye } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { printCleanHtml, todayISO } from '../../lib/utils'

const STATUS_COLORS = {
  draft:    'badge-gray',
  approved: 'badge-blue',
  paid:     'badge-green',
  rejected: 'badge-red',
}
const PAID_FROM_LABELS = {
  cash: 'Cash on Hand', bank: 'Bank Account',
  petty_cash: 'Petty Cash', payable: 'Accounts Payable',
}

const EMPTY = {
  id: null, category_id: '', supplier_id: '', description: '',
  amount: '', expense_date: todayISO(), paid_from: 'cash',
  payment_reference: '', notes: '',
}

export default function ExpensesPage() {
  const { canEdit, canAdmin, user, fmt } = useAuth()
  const [expenses,    setExpenses]    = useState([])
  const [categories,  setCategories]  = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(false)
  const [form,        setForm]        = useState(EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [printing,    setPrinting]    = useState(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCat,    setFilterCat]    = useState('')
  const [search,       setSearch]       = useState('')

  // Approve / reject modals
  const [approveId,    setApproveId]   = useState(null)
  const [rejectModal,  setRejectModal] = useState(null)
  const [rejectReason, setRejectReason]= useState('')
  const [payModal,     setPayModal]    = useState(null)
  const [payRef,       setPayRef]      = useState('')
  const [actioning,    setActioning]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [e, c, s] = await Promise.all([
        window.api.expensesList({ status: filterStatus }),
        window.api.expenseCategoriesList(),
        window.api.expenseSuppliersList(),
      ])
      setExpenses(e); setCategories(c); setSuppliers(s)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus])

  const openNew  = () => { setForm({ ...EMPTY, created_by: user?.username || 'admin' }); setModal(true) }
  const openEdit = e  => { setForm({ ...e, amount: String(e.amount) }); setModal(true) }

  const save = async () => {
    if (!form.category_id) return toast.error('Select a category')
    if (!form.description)  return toast.error('Description required')
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Valid amount required')
    setSaving(true)
    try {
      await window.api.expenseSave({ ...form, amount: Number(form.amount) })
      toast.success(form.id ? 'Expense updated' : 'Expense created')
      setModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const approve = async (id) => {
    setActioning(true)
    try {
      const r = await window.api.expenseApprove({ id, approved_by: user?.username || 'admin' })
      toast.success(`Approved — Journal Entry posted automatically`)
      setApproveId(null); load()
    } catch(e) { toast.error(e.message) }
    finally { setActioning(false) }
  }

  const reject = async () => {
    setActioning(true)
    try {
      await window.api.expenseReject({ id: rejectModal, reason: rejectReason })
      toast.success('Expense returned to draft')
      setRejectModal(null); setRejectReason(''); load()
    } catch(e) { toast.error(e.message) }
    finally { setActioning(false) }
  }

  const markPaid = async () => {
    setActioning(true)
    try {
      await window.api.expenseMarkPaid({ id: payModal, payment_reference: payRef })
      toast.success('Marked as paid')
      setPayModal(null); setPayRef(''); load()
    } catch(e) { toast.error(e.message) }
    finally { setActioning(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this draft expense?')) return
    try { await window.api.expenseDelete(id); toast.success('Deleted'); load() }
    catch(e) { toast.error(e.message) }
  }

  const printVoucher = async (expense) => {
    setPrinting(expense.id)
    try {
      const school  = await window.api.getSettings()
      const sym     = school.currency_symbol || '₦'
      const fmtN    = n => sym + Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:2})
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:14px;margin-bottom:18px">
          <h1 style="font-size:14pt;font-weight:bold;text-transform:uppercase;margin:0">${school.school_name||'School'}</h1>
          <p style="margin:4px 0 0;font-size:12pt;font-weight:bold">EXPENSE PAYMENT VOUCHER</p>
          <p style="margin:2px 0 0;font-size:10pt;color:#6b7280">${expense.expense_number}</p>
        </div>
        <table style="width:100%;font-size:11pt;border-collapse:collapse;margin-bottom:16px">
          ${[
            ['Date',        expense.expense_date],
            ['Category',    expense.category_name],
            ['Supplier',    expense.supplier_name||'—'],
            ['Description', expense.description],
            ['Paid From',   PAID_FROM_LABELS[expense.paid_from]||expense.paid_from],
            ['Reference',   expense.payment_reference||'—'],
            ['Approved By', expense.approved_by||'—'],
            ['Status',      expense.status.toUpperCase()],
          ].map(([l,v]) => `<tr>
            <td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">${l}</td>
            <td style="padding:6px 10px;font-weight:500;border-bottom:1px solid #f3f4f6">${v}</td>
          </tr>`).join('')}
        </table>
        <div style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:8px;text-align:center;padding:18px;margin:16px 0">
          <p style="margin:0;color:#6b7280;font-size:11pt">Amount</p>
          <p style="margin:6px 0 0;font-size:24pt;font-weight:bold;color:#1d4ed8">${fmtN(expense.amount)}</p>
        </div>
        ${expense.notes ? `<p style="font-size:10pt;color:#6b7280;margin-top:8px">Notes: ${expense.notes}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px">
          <div style="border-top:1px solid #000;padding-top:6px;text-align:center;font-size:10pt;color:#6b7280">Prepared By</div>
          <div style="border-top:1px solid #000;padding-top:6px;text-align:center;font-size:10pt;color:#6b7280">Authorised By</div>
        </div>
        <p style="text-align:center;font-size:9pt;color:#9ca3af;margin-top:20px">Generated ${new Date().toLocaleDateString('en-NG')}</p>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error(e.message) }
    finally { setPrinting(null) }
  }

  const filtered = useMemo(() => {
    let list = expenses
    if (filterCat)  list = list.filter(e => String(e.category_id) === String(filterCat))
    if (search)     list = list.filter(e =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
      (e.supplier_name||'').toLowerCase().includes(search.toLowerCase()))
    return list
  }, [expenses, filterCat, search])

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const totalFiltered = filtered.filter(e => e.status !== 'rejected').reduce((s,e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Expenses" subtitle="Record, approve, and track all school expenditures"
        actions={canEdit && (
          <button className="btn-primary btn btn-sm" onClick={openNew}><Plus size={14}/> New Expense</button>
        )}
      />

      {/* ── Filters ── */}
      <div className="card flex flex-wrap gap-3 items-end py-3">
        <div>
          <label className="form-label">Status</label>
          <select className="form-select w-32" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="form-label">Category</label>
          <select className="form-select w-44" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="form-label">Search</label>
          <input className="form-input" placeholder="Description, number, supplier…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.length > 0 && (
          <div className="ml-auto text-sm text-gray-500">
            <span className="font-semibold">{filtered.length}</span> records ·
            Total: <span className="font-bold text-emerald-700">{fmt(totalFiltered)}</span>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden p-0">
        {loading ? <div className="p-8"><Spinner/></div> : (
          <table className="data-table">
            <thead><tr>
              <th>Number</th><th>Date</th><th>Description</th><th>Category</th>
              <th>Supplier</th><th>Paid From</th>
              <th className="text-right">Amount</th><th>Status</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">No expenses found.</td></tr>
              )}
              {filtered.map(e => (
                <tr key={e.id} className={e.status === 'rejected' ? 'opacity-40' : ''}>
                  <td className="font-mono text-xs">{e.expense_number}</td>
                  <td className="text-gray-600 text-sm">{e.expense_date}</td>
                  <td className="font-medium max-w-48 truncate" title={e.description}>{e.description}</td>
                  <td className="text-gray-600 text-sm">{e.category_name}</td>
                  <td className="text-gray-500 text-sm">{e.supplier_name||'—'}</td>
                  <td className="text-xs text-gray-500">{PAID_FROM_LABELS[e.paid_from]}</td>
                  <td className="text-right font-bold">{fmt(e.amount)}</td>
                  <td><span className={`badge ${STATUS_COLORS[e.status]||'badge-gray'}`}>{e.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm btn-secondary" onClick={() => printVoucher(e)}
                        disabled={printing === e.id} title="Print voucher">
                        {printing === e.id ? <Loader size={12} className="animate-spin"/> : <Printer size={12}/>}
                      </button>
                      {canEdit && e.status === 'draft' && <>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(e)} title="Edit"><Pencil size={12}/></button>
                        <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(e.id)} title="Delete"><Trash2 size={12}/></button>
                      </>}
                      {canAdmin && e.status === 'draft' && (
                        <button className="btn btn-sm btn-secondary text-blue-600" onClick={() => setApproveId(e.id)} title="Approve">
                          <CheckCircle size={12}/>
                        </button>
                      )}
                      {canAdmin && e.status === 'approved' && (
                        <button className="btn btn-sm btn-primary" onClick={() => { setPayModal(e.id); setPayRef(e.payment_reference||'') }} title="Mark Paid">
                          <DollarSign size={12}/>
                        </button>
                      )}
                      {canAdmin && (e.status === 'draft' || e.status === 'approved') && (
                        <button className="btn btn-sm btn-secondary text-orange-500" onClick={() => { setRejectModal(e.id); setRejectReason('') }} title="Reject">
                          <XCircle size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── New/Edit Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Expense' : 'New Expense'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="form-label">Description *</label>
            <input className="form-input" placeholder="What was this expense for?" value={form.description} onChange={f('description')} />
          </div>
          <div>
            <label className="form-label">Category *</label>
            <select className="form-select" value={form.category_id} onChange={f('category_id')}>
              <option value="">— Select category —</option>
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Amount *</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={f('amount')} />
          </div>
          <div>
            <label className="form-label">Expense Date</label>
            <input className="form-input" type="date" value={form.expense_date} onChange={f('expense_date')} />
          </div>
          <div>
            <label className="form-label">Paid From</label>
            <select className="form-select" value={form.paid_from} onChange={f('paid_from')}>
              {Object.entries(PAID_FROM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Supplier (optional)</label>
            <select className="form-select" value={form.supplier_id} onChange={f('supplier_id')}>
              <option value="">— None —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Payment Reference</label>
            <input className="form-input" placeholder="Cheque no., transfer ref…" value={form.payment_reference} onChange={f('payment_reference')} />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={f('notes')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Update' : 'Create Expense'}
          </button>
        </div>
      </Modal>

      {/* ── Approve confirmation ── */}
      <Modal open={!!approveId} onClose={() => setApproveId(null)} title="Approve Expense">
        <p className="text-sm text-gray-700 mb-4">
          Approving will automatically post a journal entry:<br/>
          <strong>DR</strong> Expense account &nbsp;/&nbsp; <strong>CR</strong> {PAID_FROM_LABELS[expenses.find(e=>e.id===approveId)?.paid_from]||'payment account'}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => setApproveId(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => approve(approveId)} disabled={actioning}>
            {actioning ? 'Approving…' : 'Confirm Approve'}
          </button>
        </div>
      </Modal>

      {/* ── Reject modal ── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject / Return Expense">
        <div className="mb-4">
          <label className="form-label">Reason (shown in notes)</label>
          <textarea className="form-input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this is being returned…"/>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button className="btn btn-primary bg-orange-600 hover:bg-orange-700" onClick={reject} disabled={actioning}>
            {actioning ? 'Returning…' : 'Return to Draft'}
          </button>
        </div>
      </Modal>

      {/* ── Mark paid modal ── */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Mark as Paid">
        <div className="mb-4">
          <label className="form-label">Payment Reference (optional)</label>
          <input className="form-input" placeholder="Cheque number, transfer ref…" value={payRef} onChange={e => setPayRef(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={markPaid} disabled={actioning}>
            {actioning ? 'Saving…' : 'Confirm Paid'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
