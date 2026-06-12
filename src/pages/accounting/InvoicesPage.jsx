import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Eye, Trash2, Receipt, ChevronRight, Download } from 'lucide-react'
import { PageHeader, DataTable, Modal, Confirm, Spinner, Field, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fmtDate, todayISO } from '../../lib/utils'
import { playErrorSound } from '../../lib/sounds'

const STATUS_COLORS = { draft:'badge-gray', sent:'badge-blue', paid:'badge-green', cancelled:'badge-red' }

export default function InvoicesPage() {
  const { fmt, user } = useAuth()
  const [invoices, setInvoices]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [viewInvoice, setViewInvoice] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving]           = useState(false)

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      payee_name: '', payee_address: '', invoice_date: todayISO(), due_date: '', tax_rate: 0, notes: '',
      items: [{ description: '', quantity: 1, unit_price: '', amount: '' }]
    }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items')
  const taxRate = Number(watch('tax_rate') || 0)
  const subtotal = items.reduce((s, i) => s + (Number(i.quantity||1) * Number(i.unit_price||0)), 0)
  const taxAmount = (subtotal * taxRate) / 100
  const total = subtotal + taxAmount

  const load = async () => { setInvoices(await window.api.listInvoices()); setLoading(false) }
  useEffect(() => { load() }, [])

  const openView = async (inv) => {
    const full = await window.api.getInvoice(inv.id)
    setViewInvoice(full)
  }

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      const processedItems = data.items.map(i => ({
        description: i.description,
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        amount: (Number(i.quantity)||1) * (Number(i.unit_price)||0)
      })).filter(i => i.description && i.amount > 0)
      if (!processedItems.length) { toast.error('Add at least one item'); setSaving(false); return }
      await window.api.createInvoice({ ...data, items: processedItems, created_by: user?.username || 'admin' })
      toast.success('Invoice created')
      setShowCreate(false)
      reset()
      load()
    } catch (e) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await window.api.updateInvoiceStatus({ id, status })
    toast.success(`Invoice marked as ${status}`)
    load()
    if (viewInvoice?.id === id) setViewInvoice(v => ({ ...v, status }))
  }

  const handleDelete = async () => {
    await window.api.deleteInvoice(deleteTarget.id)
    toast.success('Invoice deleted')
    load()
  }

  const columns = [
    { key: 'invoice_number', label: 'Invoice No.', width: '140px', render: v => <span className="font-mono text-xs font-semibold text-gray-700">{v}</span> },
    { key: 'payee_name', label: 'Payee' },
    { key: 'invoice_date', label: 'Date', width: '110px', render: v => <span className="text-sm text-gray-600">{fmtDate(v)}</span> },
    { key: 'total', label: 'Total', width: '120px', render: v => <span className="font-bold text-gray-900">{fmt(v)}</span> },
    { key: 'status', label: 'Status', width: '90px', render: v => <span className={`badge ${STATUS_COLORS[v] || 'badge-gray'} capitalize`}>{v}</span> },
    { key: 'actions', label: '', width: '80px', sortable: false, render: (_, row) => (
      <div className="flex gap-1 justify-end">
        <button className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200" onClick={e => { e.stopPropagation(); openView(row) }}><Eye size={12} /></button>
        <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200" onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}><Trash2 size={12} /></button>
      </div>
    )}
  ]

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Create and manage school invoices."
        actions={<button className="btn-primary btn" onClick={() => { reset(); setShowCreate(true) }}><Plus size={15} /> New Invoice</button>} />

      <div className="card overflow-hidden p-0">
        <DataTable columns={columns} data={invoices} emptyMessage="No invoices yet" onRowClick={openView} />
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Invoice" size="xl"
        footer={<>
          <button className="btn-secondary btn" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn-primary btn" onClick={handleSubmit(onSubmit, playErrorSound)} disabled={saving}>{saving ? 'Creating…' : 'Create Invoice'}</button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payee Name" required error={errors.payee_name?.message}>
              <input className="form-input" placeholder="Name of payee / vendor" {...register('payee_name', { required: 'Required' })} />
            </Field>
            <Field label="Payee Address">
              <input className="form-input" {...register('payee_address')} />
            </Field>
            <Field label="Invoice Date"><input type="date" className="form-input" {...register('invoice_date')} /></Field>
            <Field label="Due Date"><input type="date" className="form-input" {...register('due_date')} /></Field>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Invoice Items</label>
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => append({ description: '', quantity: 1, unit_price: '', amount: '' })}>
                <Plus size={12} /> Add item
              </button>
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2 w-20">Qty</th>
                  <th className="text-right px-3 py-2 w-28">Unit Price</th>
                  <th className="text-right px-3 py-2 w-28">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => {
                  const lineAmt = (Number(items[i]?.quantity)||1) * (Number(items[i]?.unit_price)||0)
                  return (
                    <tr key={field.id} className="border-t border-gray-100">
                      <td className="px-2 py-1"><input className="form-input text-xs" placeholder="Item description" {...register(`items.${i}.description`)} /></td>
                      <td className="px-2 py-1"><input type="number" min="1" step="1" className="form-input text-right text-xs" {...register(`items.${i}.quantity`)} /></td>
                      <td className="px-2 py-1"><input type="number" min="0" step="0.01" className="form-input text-right text-xs" placeholder="0.00" {...register(`items.${i}.unit_price`)} /></td>
                      <td className="px-3 py-1 text-right text-xs font-semibold text-gray-700">{fmt(lineAmt)}</td>
                      <td className="px-1 py-1">{fields.length > 1 && <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-end">
            <Field label="Tax Rate (%)"><input type="number" min="0" max="100" step="0.1" className="form-input w-24" {...register('tax_rate')} /></Field>
            <div className="text-right space-y-1 text-sm">
              <div className="flex gap-8 justify-between"><span className="text-gray-500">Subtotal:</span><span className="font-medium">{fmt(subtotal)}</span></div>
              {taxRate > 0 && <div className="flex gap-8 justify-between"><span className="text-gray-500">Tax ({taxRate}%):</span><span>{fmt(taxAmount)}</span></div>}
              <div className="flex gap-8 justify-between text-base font-bold"><span>Total:</span><span>{fmt(total)}</span></div>
            </div>
          </div>
          <Field label="Notes"><textarea className="form-input resize-none" rows={2} {...register('notes')} /></Field>
        </div>
      </Modal>

      {/* View invoice modal */}
      {viewInvoice && (
        <Modal open={!!viewInvoice} onClose={() => setViewInvoice(null)} title={`Invoice ${viewInvoice.invoice_number}`} size="lg">
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              {['draft','sent','paid','cancelled'].map(s => (
                <button key={s} onClick={() => updateStatus(viewInvoice.id, s)}
                  className={`btn btn-sm capitalize ${viewInvoice.status === s ? 'btn-primary' : 'btn-secondary'}`}>
                  {s}
                </button>
              ))}
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Unit Price</th><th className="text-right px-3 py-2">Amount</th></tr>
              </thead>
              <tbody>
                {viewInvoice.items?.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{fmt(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{fmt(viewInvoice.total)}</td>
                </tr>
              </tfoot>
            </table>
            {viewInvoice.notes && <p className="text-sm text-gray-500">Notes: {viewInvoice.notes}</p>}
          </div>
        </Modal>
      )}

      <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} danger
        title="Delete Invoice" message={`Delete invoice ${deleteTarget?.invoice_number}?`} />
    </div>
  )
}
