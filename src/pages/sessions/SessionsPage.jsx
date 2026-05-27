import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Plus, Trash2, Check, ChevronDown, ChevronRight, Calendar, AlertCircle } from 'lucide-react'
import { PageHeader, Modal, Confirm, Field, Spinner, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const TERM_ORDER = ['First Term', 'Second Term', 'Third Term']

// ─── Term dates editor (inline) ──────────────────────────────────────────────
function TermRow({ term, isCurrent, onSetCurrent }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { start_date: term.start_date || '', end_date: term.end_date || '' }
  })

  const save = async (data) => {
    setSaving(true)
    try {
      await window.api.updateTerm({ id: term.id, ...data })
      toast.success(`${term.name} dates saved`)
      setEditing(false)
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className={`rounded-lg border p-3 ${isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Calendar size={14} className={isCurrent ? 'text-blue-500' : 'text-gray-400'} />
          <span className={`text-sm font-medium ${isCurrent ? 'text-blue-800' : 'text-gray-700'}`}>
            {term.name}
          </span>
          {isCurrent && <span className="badge-blue badge">Current</span>}
          {term.start_date && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              {term.start_date} → {term.end_date || '?'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="btn btn-sm text-xs text-gray-500 border border-gray-200 hover:bg-gray-50"
            onClick={() => setEditing(e => !e)}
          >
            {editing ? 'Cancel' : 'Set dates'}
          </button>
          {!isCurrent && (
            <button
              className="btn-primary btn btn-sm"
              onClick={() => onSetCurrent(term.id)}
            >
              <Check size={12} /> Set current
            </button>
          )}
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSubmit(save)} className="mt-3 flex items-end gap-3 flex-wrap">
          <Field label="Start date" >
            <input type="date" className="form-input" {...register('start_date')} />
          </Field>
          <Field label="End date">
            <input type="date" className="form-input" {...register('end_date')} />
          </Field>
          <button type="submit" className="btn-primary btn btn-sm mb-0.5" disabled={saving}>
            {saving ? 'Saving…' : 'Save dates'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── Session card ─────────────────────────────────────────────────────────────
function SessionCard({ session, currentTermId, onSetCurrent, onDelete, onRefresh }) {
  const [open, setOpen]     = useState(session.is_current === 1)
  const [terms, setTerms]   = useState([])
  const [loaded, setLoaded] = useState(false)

  const loadTerms = async () => {
    const t = await window.api.listTerms(session.id)
    setTerms(t)
    setLoaded(true)
  }

  useEffect(() => { if (open && !loaded) loadTerms() }, [open])

  const handleSetCurrent = async (termId) => {
    await window.api.setCurrentSession(session.id, termId)
    toast.success(`${session.name} — ${terms.find(t=>t.id===termId)?.name} set as current`)
    onRefresh()
  }

  return (
    <div className={`card border ${session.is_current ? 'border-blue-300' : 'border-gray-200'}`}>
      {/* Session header */}
      <div className="flex items-center justify-between gap-3">
        <button
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          onClick={() => setOpen(o => !o)}
        >
          {open ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
          <span className="font-semibold text-gray-900">{session.name}</span>
          {session.is_current === 1 && <span className="badge-green badge">Active Session</span>}
        </button>
        <button
          onClick={() => onDelete(session)}
          className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
          title="Delete session"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Terms */}
      {open && (
        <div className="mt-4 space-y-2">
          {!loaded
            ? <div className="text-xs text-gray-400 py-2 text-center">Loading terms…</div>
            : TERM_ORDER.map(name => {
                const term = terms.find(t => t.name === name)
                if (!term) return null
                return (
                  <TermRow
                    key={term.id}
                    term={term}
                    isCurrent={term.id === currentTermId}
                    onSetCurrent={handleSetCurrent}
                  />
                )
              })
          }
          {loaded && terms.length === 0 && (
            <p className="text-xs text-gray-400 text-center pt-1">
              No terms found for this session.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SessionsPage() {
  const { refreshTerm } = useAuth()
  const [sessions, setSessions]       = useState([])
  const [currentTermId, setCurrentTermId] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const load = async () => {
    const [sess, term] = await Promise.all([
      window.api.listSessions(),
      window.api.getCurrentTerm(),
    ])
    setSessions(sess)
    setCurrentTermId(term?.id || null)
    setLoading(false)
    // Update the global current term so the sidebar and all pages refresh
    refreshTerm()
  }

  useEffect(() => { load() }, [])

  const onCreate = async ({ name }) => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await window.api.createSession(trimmed)
      toast.success(`Session ${trimmed} created with 3 terms`)
      reset()
      setShowAdd(false)
      load()
    } catch (e) {
      toast.error(e.message?.includes('UNIQUE') ? 'A session with that name already exists' : 'Failed to create session')
    }
  }

  const onDelete = async () => {
    try {
      await window.api.deleteSession(deleteTarget.id)
      toast.success(`Session ${deleteTarget.name} deleted`)
      load()
    } catch { toast.error('Cannot delete — session may have student records') }
  }

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Sessions & Terms"
        subtitle="Manage academic sessions and set the current active term."
        actions={
          <button className="btn-primary btn" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> New Session
          </button>
        }
      />

      {/* Info banner */}
      <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2.5 text-sm text-blue-800">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
        <span>
          Each session automatically gets First, Second, and Third Term.
          Set one term as <strong>Current</strong> to enable billing and payments for that period.
        </span>
      </div>

      {/* Sessions list */}
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="empty-state card">
            <Calendar size={36} className="empty-state-icon" />
            <p className="empty-state-title">No sessions yet</p>
            <p className="empty-state-sub">Create your first academic session to get started</p>
            <button className="btn-primary btn mt-4" onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Create Session
            </button>
          </div>
        ) : (
          sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              currentTermId={currentTermId}
              onSetCurrent={async (termId) => {
                await window.api.setCurrentSession(s.id, termId)
                toast.success('Active term updated')
                load()
              }}
              onDelete={setDeleteTarget}
              onRefresh={load}
            />
          ))
        )}
      </div>

      {/* Add session modal */}
      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); reset() }}
        title="New Academic Session"
        footer={
          <>
            <button className="btn-secondary btn" onClick={() => { setShowAdd(false); reset() }}>Cancel</button>
            <button className="btn-primary btn" onClick={handleSubmit(onCreate)}>Create Session</button>
          </>
        }
      >
        <Field label="Session Name" required error={errors.name?.message}
          hint="Use the format YYYY/YYYY e.g. 2024/2025">
          <input
            className="form-input"
            placeholder="2024/2025"
            {...register('name', {
              required: 'Session name is required',
              pattern: { value: /^\d{4}\/\d{4}$/, message: 'Use format YYYY/YYYY e.g. 2024/2025' }
            })}
          />
        </Field>
      </Modal>

      {/* Delete confirm */}
      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        danger
        title="Delete Session"
        message={`Delete "${deleteTarget?.name}" and all its terms? This cannot be undone. Students linked to this session will lose their term placement records.`}
      />
    </div>
  )
}
