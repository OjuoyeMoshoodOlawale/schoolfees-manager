import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { ArrowUpCircle, ArrowRight, Users, AlertCircle, CheckSquare, Square } from 'lucide-react'
import { PageHeader, Spinner, Confirm } from '../../components/ui'

const TABS = [
  { id: 'promote',  label: 'Promote to New Session/Class', icon: ArrowUpCircle },
  { id: 'term',     label: 'Change Term (Same Class)',      icon: ArrowRight },
]

export default function PromotePage() {
  const [tab, setTab]             = useState('promote')
  const [loading, setLoading]     = useState(true)
  const [sessions, setSessions]   = useState([])
  const [classes, setClasses]     = useState([])
  const [terms, setTerms]         = useState([])
  const [students, setStudents]   = useState([])
  const [selected, setSelected]   = useState([])
  const [confirm, setConfirm]     = useState(null)
  const [running, setRunning]     = useState(false)

  // Promote filters
  const [fromClass, setFromClass]   = useState('')
  const [toSession, setToSession]   = useState('')
  const [toTerm, setToTerm]         = useState('')
  const [toClass, setToClass]       = useState('')

  // Term change filters
  const [fromTerm, setFromTerm]     = useState('')
  const [destSession, setDestSession] = useState('')
  const [destTerm, setDestTerm]     = useState('')
  const [destTerms, setDestTerms]   = useState([])

  useEffect(() => {
    async function load() {
      const [sess, cls] = await Promise.all([
        window.api.listSessions(),
        window.api.listClasses(),
      ])
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
      setLoading(false)
    }
    load()
  }, [])

  // Load terms when session selected (promote tab)
  useEffect(() => {
    if (toSession) window.api.listTerms(Number(toSession)).then(setTerms)
    else setTerms([])
    setToTerm('')
  }, [toSession])

  // Load dest terms when destSession selected (term change tab)
  useEffect(() => {
    if (destSession) window.api.listTerms(Number(destSession)).then(setDestTerms)
    else setDestTerms([])
    setDestTerm('')
  }, [destSession])

  // Load students for selected class (promote tab)
  useEffect(() => {
    if (fromClass) {
      window.api.listStudents({ class_id: fromClass, status: 'active' }).then(studs => {
        setStudents(studs)
        setSelected(studs.map(s => s.id)) // select all by default
      })
    } else {
      setStudents([])
      setSelected([])
    }
  }, [fromClass])

  // Load students for current term (term change tab)
  useEffect(() => {
    if (fromTerm) {
      window.api.listStudents({ status: 'active' }).then(studs => {
        const inTerm = studs.filter(s => s.term_id === Number(fromTerm))
        setStudents(inTerm)
        setSelected(inTerm.map(s => s.id))
      })
    }
  }, [fromTerm])

  const toggleStudent = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  const toggleAll = () => {
    setSelected(selected.length === students.length ? [] : students.map(s => s.id))
  }

  // ── Promote ────────────────────────────────────────────────────────────────
  const doPromote = async () => {
    if (!selected.length || !toSession || !toTerm || !toClass) return
    setRunning(true)
    try {
      const result = await window.api.promoteStudents({
        studentIds: selected,
        new_session_id: Number(toSession),
        new_term_id: Number(toTerm),
        new_class_id: Number(toClass),
      })
      toast.success(`${result.count} students promoted to ${classes.find(c=>c.id===Number(toClass))?.name}`)
      setFromClass('')
      setStudents([])
      setSelected([])
    } catch (e) {
      toast.error(e.message || 'Promotion failed')
    } finally {
      setRunning(false)
      setConfirm(null)
    }
  }

  // ── Term change ────────────────────────────────────────────────────────────
  const doChangeTerm = async () => {
    if (!fromTerm || !destSession || !destTerm) return
    setRunning(true)
    try {
      const result = await window.api.changeTerm({
        fromTermId: Number(fromTerm),
        toSessionId: Number(destSession),
        toTermId: Number(destTerm),
      })
      toast.success(`${result.count} students moved to new term`)
      setFromTerm('')
      setStudents([])
    } catch (e) {
      toast.error(e.message || 'Term change failed')
    } finally {
      setRunning(false)
      setConfirm(null)
    }
  }

  if (loading) return <Spinner />

  // All terms across sessions for the "from" term selector
  const allCurrentTerms = sessions.filter(s => s.is_current)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Promote / Change Term"
        subtitle="Move students to a new class or term. Inserts new student status records."
      />

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setStudents([]); setSelected([]) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── PROMOTE TAB ────────────────────────────────────────────────── */}
      {tab === 'promote' && (
        <div className="space-y-5">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Promotion Setup</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">From Class (current) <span className="text-red-500">*</span></label>
                <select className="form-select" value={fromClass} onChange={e => setFromClass(e.target.value)}>
                  <option value="">— Select current class —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">To Session <span className="text-red-500">*</span></label>
                <select className="form-select" value={toSession} onChange={e => setToSession(e.target.value)}>
                  <option value="">— Select session —</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">To Term <span className="text-red-500">*</span></label>
                <select className="form-select" value={toTerm} onChange={e => setToTerm(e.target.value)} disabled={!toSession}>
                  <option value="">— Select term —</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">To Class <span className="text-red-500">*</span></label>
                <select className="form-select" value={toClass} onChange={e => setToClass(e.target.value)}>
                  <option value="">— Select new class —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Student selection */}
          {students.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <button onClick={toggleAll} className="text-gray-500 hover:text-blue-600">
                    {selected.length === students.length
                      ? <CheckSquare size={16} className="text-blue-600" />
                      : <Square size={16} />}
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    {selected.length} of {students.length} selected
                  </span>
                </div>
                <button
                  className="btn-primary btn btn-sm"
                  disabled={!selected.length || !toSession || !toTerm || !toClass || running}
                  onClick={() => setConfirm('promote')}
                >
                  <ArrowUpCircle size={14} />
                  Promote {selected.length} Students
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {students.map(s => (
                  <div
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors
                      ${selected.includes(s.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="text-gray-400">
                      {selected.includes(s.id)
                        ? <CheckSquare size={15} className="text-blue-600" />
                        : <Square size={15} />}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600 flex-shrink-0">
                      {s.first_name?.[0]}{s.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{s.reg_number}</p>
                    </div>
                    <span className="badge-blue badge text-xs">{s.class_name || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fromClass && students.length === 0 && (
            <div className="card text-center py-8">
              <Users size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No active students in this class</p>
            </div>
          )}
        </div>
      )}

      {/* ── TERM CHANGE TAB ─────────────────────────────────────────────── */}
      {tab === 'term' && (
        <div className="space-y-5">
          <div className="card">
            <div className="flex gap-2.5 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <AlertCircle size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              This moves all active students from one term to the next, keeping them in the same class. Use this at the end of each term.
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">From Session</label>
                <select className="form-select" onChange={async e => {
                  const terms = await window.api.listTerms(Number(e.target.value))
                  setTerms(terms)
                  setFromTerm('')
                }}>
                  <option value="">— Select session —</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">From Term <span className="text-red-500">*</span></label>
                <select className="form-select" value={fromTerm} onChange={e => setFromTerm(e.target.value)}>
                  <option value="">— Select current term —</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">To Session <span className="text-red-500">*</span></label>
                <select className="form-select" value={destSession} onChange={e => setDestSession(e.target.value)}>
                  <option value="">— Select session —</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="form-label">To Term <span className="text-red-500">*</span></label>
                <select className="form-select" value={destTerm} onChange={e => setDestTerm(e.target.value)} disabled={!destSession}>
                  <option value="">— Select target term —</option>
                  {destTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {students.length > 0 && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                <strong>{students.length} active students</strong> will be moved to the selected term keeping their current class.
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                className="btn-primary btn"
                disabled={!fromTerm || !destSession || !destTerm || !students.length || running}
                onClick={() => setConfirm('term')}
              >
                <ArrowRight size={15} /> Move {students.length} Students to New Term
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      <Confirm
        open={confirm === 'promote'}
        onClose={() => setConfirm(null)}
        onConfirm={doPromote}
        title="Confirm Promotion"
        message={`Promote ${selected.length} students to ${classes.find(c=>c.id===Number(toClass))?.name}? This inserts new student status records and cannot be undone.`}
      />
      <Confirm
        open={confirm === 'term'}
        onClose={() => setConfirm(null)}
        onConfirm={doChangeTerm}
        title="Confirm Term Change"
        message={`Move ${students.length} active students to the selected term? Their class stays the same. New student_status rows will be inserted.`}
      />
    </div>
  )
}
