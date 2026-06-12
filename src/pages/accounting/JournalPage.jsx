import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Trash2, FileText, ChevronRight, AlertCircle } from 'lucide-react'
import { PageHeader, Modal, Spinner, Field, exportToExcel } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fmtDate, todayISO } from '../../lib/utils'
import { Download } from 'lucide-react'
import { playErrorSound } from '../../lib/sounds'

export default function JournalPage() {
  const { fmt, user } = useAuth()
  const [entries, setEntries]     = useState([])
  const [accounts, setAccounts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [viewEntry, setViewEntry] = useState(null)
  const [saving, setSaving]       = useState(false)

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      description: '', entry_date: todayISO(), entry_type: 'manual',
      lines: [
        { account_id: '', debit: '', credit: '', narration: '' },
        { account_id: '', debit: '', credit: '', narration: '' },
      ]
    }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines')

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  useEffect(() => {
    Promise.all([window.api.listJournal(), window.api.listAccounts()])
      .then(([j, a]) => { setEntries(j); setAccounts(a); setLoading(false) })
  }, [])

  const onSubmit = async (data) => {
    const validLines = data.lines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast.error('At least 2 lines required'); return }

    setSaving(true)
    try {
      await window.api.postJournalEntry({
        description: data.description,
        entry_date:  data.entry_date,
        entry_type:  data.entry_type,
        posted_by:   user?.username || 'admin',
        lines: validLines.map(l => ({
          account_id: Number(l.account_id),
          debit:      Number(l.debit)  || 0,
          credit:     Number(l.credit) || 0,
          narration:  l.narration || '',
        }))
      })
      toast.success('Journal entry posted')
      setShowModal(false)
      reset()
      window.api.listJournal().then(setEntries)
    } catch (e) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  const openEntry = async (entry) => {
    const full = await window.api.getJournalEntry(entry.id)
    setViewEntry(full)
  }

  const handleExport = async () => {
    const rows = entries.map(e => ({
      Reference: e.reference, Date: e.entry_date, Description: e.description,
      Type: e.entry_type, 'Total Debit': e.total_debit, 'Total Credit': e.total_credit, By: e.posted_by
    }))
    await exportToExcel(rows, 'journal_entries')
    toast.success('Exported')
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Journal Entries"
        subtitle="Double-entry bookkeeping records."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={handleExport} disabled={!entries.length}><Download size={14} /> Export</button>
            <button className="btn-primary btn" onClick={() => { reset(); setShowModal(true) }}><Plus size={15} /> New Entry</button>
          </div>
        }
      />

      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-gray-100">
          {entries.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">No journal entries yet</div>}
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => openEntry(e)}>
              <FileText size={15} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{e.description}</p>
                <p className="text-xs text-gray-400">{e.reference} · {fmtDate(e.entry_date)} · {e.entry_type}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-gray-800">{fmt(e.total_debit)}</p>
                <p className="text-xs text-gray-400">{e.line_count} lines</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Post entry modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Post Journal Entry" size="lg"
        footer={<>
          <button className="btn-secondary btn" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn-primary btn" onClick={handleSubmit(onSubmit, playErrorSound)} disabled={saving || !isBalanced}>
            {saving ? 'Posting…' : 'Post Entry'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Description" required error={errors.description?.message}>
              <input className="form-input" {...register('description', { required: 'Required' })} />
            </Field>
            <Field label="Date" required>
              <input type="date" className="form-input" {...register('entry_date')} />
            </Field>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Journal Lines</label>
              <button type="button" className="btn-secondary btn btn-sm"
                onClick={() => append({ account_id: '', debit: '', credit: '', narration: '' })}>
                <Plus size={12} /> Add line
              </button>
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Account</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium w-28">Debit (₦)</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium w-28">Credit (₦)</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Narration</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.id} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <select className="form-select text-xs" {...register(`lines.${i}.account_id`)}>
                        <option value="">— Select —</option>
                        {accounts.filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" step="0.01" className="form-input text-right text-xs" placeholder="0.00"
                        {...register(`lines.${i}.debit`, { min: 0 })} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" step="0.01" className="form-input text-right text-xs" placeholder="0.00"
                        {...register(`lines.${i}.credit`, { min: 0 })} />
                    </td>
                    <td className="px-2 py-1">
                      <input className="form-input text-xs" placeholder="Optional note" {...register(`lines.${i}.narration`)} />
                    </td>
                    <td className="px-1 py-1">
                      {fields.length > 2 && (
                        <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-sm">
                  <td className="px-3 py-2 text-gray-600">Totals</td>
                  <td className={`px-3 py-2 text-right ${isBalanced ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(totalDebit)}</td>
                  <td className={`px-3 py-2 text-right ${isBalanced ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(totalCredit)}</td>
                  <td colSpan={2} className="px-3 py-2 text-xs">
                    {isBalanced
                      ? <span className="text-emerald-600">✓ Balanced</span>
                      : <span className="text-red-500">⚠ Not balanced — difference: {fmt(Math.abs(totalDebit - totalCredit))}</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* View entry modal */}
      {viewEntry && (
        <Modal open={!!viewEntry} onClose={() => setViewEntry(null)} title={`Entry: ${viewEntry.reference}`} size="lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Date', fmtDate(viewEntry.entry_date)], ['Description', viewEntry.description],
                ['Type', viewEntry.entry_type], ['Posted by', viewEntry.posted_by]].map(([k,v]) => (
                <div key={k}><span className="text-gray-400 text-xs">{k}</span><p className="font-medium">{v}</p></div>
              ))}
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Account</th>
                  <th className="text-right px-3 py-2">Debit</th>
                  <th className="text-right px-3 py-2">Credit</th>
                  <th className="text-left px-3 py-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {viewEntry.lines?.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{l.account_code} — {l.account_name}</td>
                    <td className="px-3 py-2 text-right">{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right">{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{l.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
