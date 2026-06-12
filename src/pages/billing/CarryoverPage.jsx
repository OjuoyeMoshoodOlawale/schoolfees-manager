import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useForm } from 'react-hook-form'
import { History, Zap, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PageHeader, Spinner, Confirm, Modal, Field, DataTable, exportToExcel } from '../../components/ui'
import { Download } from 'lucide-react'
import { playErrorSound } from '../../lib/sounds'


export default function CarryoverPage() {
  const { fmt } = useAuth()
  const [sessions, setSessions]   = useState([])
  const [terms, setTerms]         = useState([])
  const [toTerms, setToTerms]     = useState([])
  const [classes, setClasses]     = useState([])
  const [students, setStudents]   = useState([])

  const [fromSession, setFromSession] = useState('')
  const [fromTerm, setFromTerm]       = useState('')
  const [toSession, setToSession]     = useState('')
  const [toTerm, setToTerm]           = useState('')

  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [computing, setComputing] = useState(false)
  const [result, setResult]       = useState(null)
  const [confirm, setConfirm]     = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  useEffect(() => {
    async function init() {
      const [sess, cls, ct] = await Promise.all([
        window.api.listSessions(), window.api.listClasses(), window.api.getCurrentTerm()
      ])
      setSessions(sess)
      setClasses(cls)
      if (ct) {
        setToSession(String(ct.session_id))
        const tlist = await window.api.listTerms(ct.session_id)
        setToTerms(tlist)
        setToTerm(String(ct.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (fromSession) window.api.listTerms(Number(fromSession)).then(t => { setTerms(t); setFromTerm('') })
  }, [fromSession])

  useEffect(() => {
    if (toSession) window.api.listTerms(Number(toSession)).then(t => { setToTerms(t) })
  }, [toSession])

  useEffect(() => {
    if (toTerm) loadEntries()
    else setEntries([])
  }, [toTerm])

  useEffect(() => {
    if (toTerm) {
      window.api.listStudents({ status: 'active' })
        .then(s => setStudents(s.filter(st => st.term_id === Number(toTerm))))
    }
  }, [toTerm])

  const loadEntries = async () => {
    if (!toTerm) return
    setLoading(true)
    const data = await window.api.listCarryover({ to_term_id: Number(toTerm) })
    setEntries(data)
    setLoading(false)
  }

  const doAutoCompute = async () => {
    setComputing(true)
    try {
      const res = await window.api.autoComputeCarryover({
        from_term_id: Number(fromTerm),
        to_term_id: Number(toTerm),
      })
      setResult(res)
      toast.success(`${res.posted} balances computed and posted · ${res.zero} students had no outstanding balance`)
      loadEntries()
    } catch (e) { toast.error(e.message || 'Failed') }
    finally { setComputing(false); setConfirm(false) }
  }

  const onManualPost = async (data) => {
    try {
      await window.api.postCarryover({
        student_id: Number(data.student_id),
        from_term_id: Number(fromTerm || data.from_term_id),
        to_term_id: Number(toTerm),
        balance_amount: Number(data.balance_amount),
      })
      toast.success('Balance posted')
      setShowManual(false)
      reset()
      loadEntries()
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  const onDelete = async () => {
    await window.api.deleteCarryover(deleteTarget.id)
    toast.success('Carry-over balance removed')
    loadEntries()
  }

  const handleExport = async () => {
    const rows = entries.map(e => ({
      'Student': `${e.last_name} ${e.first_name}`,
      'Reg No': e.reg_number,
      'From': `${e.from_session_name} · ${e.from_term_name}`,
      'Balance (₦)': e.balance_amount,
    }))
    await exportToExcel(rows, 'carryover_balances')
    toast.success('Exported')
  }

  const totalCarryover = entries.reduce((s, e) => s + Number(e.balance_amount), 0)

  const columns = [
    {
      key: 'last_name', label: 'Student',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.last_name} {row.first_name}</p>
          <p className="text-xs font-mono text-gray-400">{row.reg_number}</p>
        </div>
      )
    },
    {
      key: 'from_term_name', label: 'From Term',
      render: (v, row) => <span className="text-sm text-gray-600">{row.from_session_name} · {v}</span>
    },
    {
      key: 'balance_amount', label: 'Balance Amount', width: '150px',
      render: v => <span className="font-semibold text-amber-700">{fmt(v)}</span>
    },
    {
      key: 'actions', label: '', width: '60px', sortable: false,
      render: (_, row) => (
        <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
          onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}>
          <Trash2 size={12} />
        </button>
      )
    }
  ]

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Carry-over Balances"
        subtitle="Post unpaid balances from a previous term into the current term's bills."
        actions={
          entries.length > 0 && (
            <button className="btn-secondary btn btn-sm" onClick={handleExport}>
              <Download size={14} /> Export
            </button>
          )
        }
      />

      <div className="card mb-5">
        <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
          Auto-compute scans all active students from the source term, calculates their unpaid balance, and posts it to the target term. You can also post individual balances manually.
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">From (source term)</p>
            <div>
              <label className="form-label">Session</label>
              <select className="form-select" value={fromSession} onChange={e => setFromSession(e.target.value)}>
                <option value="">— Select —</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Term</label>
              <select className="form-select" value={fromTerm} onChange={e => setFromTerm(e.target.value)} disabled={!fromSession}>
                <option value="">— Select —</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To (target term)</p>
            <div>
              <label className="form-label">Session</label>
              <select className="form-select" value={toSession} onChange={e => setToSession(e.target.value)}>
                <option value="">— Select —</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Term</label>
              <select className="form-select" value={toTerm} onChange={e => setToTerm(e.target.value)} disabled={!toSession}>
                <option value="">— Select —</option>
                {toTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            className="btn-primary btn"
            disabled={!fromTerm || !toTerm || computing}
            onClick={() => setConfirm(true)}
          >
            <Zap size={15} /> {computing ? 'Computing…' : 'Auto-Compute & Post All'}
          </button>
          <button
            className="btn-secondary btn"
            disabled={!toTerm}
            onClick={() => setShowManual(true)}
          >
            <Plus size={15} /> Post Manual Balance
          </button>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-semibold">Carry-over computed</p>
            <p>{result.posted} students had outstanding balances posted · {result.zero} had nothing owed</p>
          </div>
        </div>
      )}

      {/* Entries table */}
      {toTerm && (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              {entries.length} carry-over balance{entries.length !== 1 ? 's' : ''}
              {entries.length > 0 && <span className="text-gray-400"> · Total: <span className="font-semibold text-amber-700">{fmt(totalCarryover)}</span></span>}
            </span>
          </div>
          {loading ? <Spinner /> : entries.length === 0 ? (
            <div className="empty-state py-10">
              <History size={28} className="empty-state-icon" />
              <p className="empty-state-title">No carry-over balances</p>
              <p className="empty-state-sub">Use Auto-Compute to post outstanding balances from a previous term</p>
            </div>
          ) : (
            <DataTable columns={columns} data={entries} />
          )}
        </div>
      )}

      {/* Manual post modal */}
      <Modal
        open={showManual}
        onClose={() => { setShowManual(false); reset() }}
        title="Post Manual Carry-over Balance"
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => { setShowManual(false); reset() }}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onManualPost, playErrorSound)}>Post Balance</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Student" required error={errors.student_id?.message}>
            <select className="form-select"
              {...register('student_id', { required: 'Select a student' })}>
              <option value="">— Select student —</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.last_name} {s.first_name} ({s.reg_number})</option>
              ))}
            </select>
          </Field>
          <Field label="Balance Amount (₦)" required error={errors.balance_amount?.message}>
            <input type="number" min="0.01" step="0.01" className="form-input"
              placeholder="15000.00"
              {...register('balance_amount', { required: 'Enter the balance amount', min: { value: 0.01, message: 'Must be > 0' }, valueAsNumber: true })} />
          </Field>
          <Field label="Source Term (optional)" hint="Which term this balance is from">
            <select className="form-select" {...register('from_term_id')}>
              <option value="">— Select source term —</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={doAutoCompute}
        title="Auto-Compute Carry-over Balances"
        message="This will calculate all unpaid balances from the source term and post them to the target term. Existing carry-over entries for the same students will be updated. Continue?"
      />
      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Remove Carry-over"
        message={`Remove carry-over balance of ${fmt(deleteTarget?.balance_amount)} for ${deleteTarget?.last_name} ${deleteTarget?.first_name}?`}
      />
    </div>
  )
}
