import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Copy, History, AlertCircle, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { PageHeader, Spinner, Confirm } from '../../components/ui'
import { format } from 'date-fns'

const TABS = [
  { id: 'copy', label: 'Copy Config', icon: Copy },
  { id: 'log',  label: 'Copy History', icon: History },
]

function SelectPair({ label, sessions, classes, onSessionChange, terms, selSession, selTerm, selClass, onTermChange, onClassChange, disabled = false }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <div>
        <label className="form-label">Session</label>
        <select className="form-select" value={selSession} onChange={e => onSessionChange(e.target.value)} disabled={disabled}>
          <option value="">— Select session —</option>
          {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Term</label>
        <select className="form-select" value={selTerm} onChange={e => onTermChange(e.target.value)} disabled={disabled || !selSession}>
          <option value="">— Select term —</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Class</label>
        <select className="form-select" value={selClass} onChange={e => onClassChange(e.target.value)} disabled={disabled}>
          <option value="">— Select class —</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function CopyConfigPage() {
  const [tab, setTab]           = useState('copy')
  const [sessions, setSessions] = useState([])
  const [classes, setClasses]   = useState([])
  const [copyLog, setCopyLog]   = useState([])
  const [logLoading, setLogLoading] = useState(false)

  // From side
  const [fromSession, setFromSession] = useState('')
  const [fromTerms, setFromTerms]     = useState([])
  const [fromTerm, setFromTerm]       = useState('')
  const [fromClass, setFromClass]     = useState('')
  const [fromCount, setFromCount]     = useState(null)

  // To side
  const [toSession, setToSession]   = useState('')
  const [toTerms, setToTerms]       = useState([])
  const [toTerm, setToTerm]         = useState('')
  const [toClass, setToClass]       = useState('')

  const [overwrite, setOverwrite]   = useState(false)
  const [confirm, setConfirm]       = useState(false)
  const [copying, setCopying]       = useState(false)
  const [result, setResult]         = useState(null)

  useEffect(() => {
    async function init() {
      const [sess, cls] = await Promise.all([window.api.listSessions(), window.api.listClasses()])
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
    }
    init()
  }, [])

  useEffect(() => {
    if (fromSession) window.api.listTerms(Number(fromSession)).then(t => { setFromTerms(t); setFromTerm('') })
    else { setFromTerms([]); setFromTerm('') }
  }, [fromSession])

  useEffect(() => {
    if (toSession) window.api.listTerms(Number(toSession)).then(t => { setToTerms(t); setToTerm('') })
    else { setToTerms([]); setToTerm('') }
  }, [toSession])

  // Count source configs when from selection is complete
  useEffect(() => {
    if (fromTerm && fromClass) {
      window.api.listBillConfig({ term_id: Number(fromTerm), class_id: Number(fromClass) })
        .then(data => setFromCount(data.length))
    } else { setFromCount(null) }
  }, [fromTerm, fromClass])

  const loadLog = async () => {
    setLogLoading(true)
    const data = await window.api.getBillConfigCopyLog()
    setCopyLog(data)
    setLogLoading(false)
  }

  useEffect(() => { if (tab === 'log') loadLog() }, [tab])

  // ── Frontend forward-only guard (mirrors the backend) ─────────────────────
  const TERM_RANK = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3 }
  const orderKey = (sessName, termName) => `${sessName || ''}#${TERM_RANK[termName] || 0}`
  const fromKey = orderKey(
    sessions.find(s => s.id === Number(fromSession))?.name,
    fromTerms.find(t => t.id === Number(fromTerm))?.name
  )
  const toKey = orderKey(
    sessions.find(s => s.id === Number(toSession))?.name,
    toTerms.find(t => t.id === Number(toTerm))?.name
  )
  const sameTarget = fromTerm && toTerm && Number(fromTerm) === Number(toTerm) && Number(fromClass) === Number(toClass)
  const goingBackward = fromTerm && toTerm && fromSession && toSession && toKey < fromKey
  const sameTermDiffClassOk = fromTerm && toTerm && toKey === fromKey && Number(fromClass) !== Number(toClass)
  let orderError = ''
  if (sameTarget) orderError = 'Source and destination are identical — choose a different term or class.'
  else if (goingBackward) orderError = 'You can only copy forward — the destination term cannot be earlier than the source.'
  else if (fromTerm && toTerm && toKey === fromKey && !sameTermDiffClassOk) orderError = 'Choose a later term, or a different class within the same term.'

  const canCopy = fromTerm && fromClass && toTerm && toClass && fromCount > 0 && !orderError

  const doCopy = async () => {
    setCopying(true)
    try {
      const res = await window.api.copyBillConfig({
        from_term_id:  Number(fromTerm),
        from_class_id: Number(fromClass),
        to_term_id:    Number(toTerm),
        to_class_id:   Number(toClass),
        overwrite,
      })
      setResult(res)
      toast.success(`${res.inserted} item(s) copied${res.skipped ? `, ${res.skipped} skipped (already exist)` : ''}`)
    } catch (e) { toast.error(e.message || 'Copy failed') }
    finally { setCopying(false); setConfirm(false) }
  }

  const fromClassName  = classes.find(c => c.id === Number(fromClass))?.name  || '?'
  const toClassName    = classes.find(c => c.id === Number(toClass))?.name    || '?'
  const fromTermName   = fromTerms.find(t => t.id === Number(fromTerm))?.name || '?'
  const toTermName     = toTerms.find(t => t.id === Number(toTerm))?.name     || '?'
  const fromSessName   = sessions.find(s => s.id === Number(fromSession))?.name || '?'
  const toSessName     = sessions.find(s => s.id === Number(toSession))?.name   || '?'

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Copy Bill Config"
        subtitle="Duplicate a term's billing setup to another term or class to save time."
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── COPY TAB ──────────────────────────────────────────────────── */}
      {tab === 'copy' && (
        <div className="space-y-5">
          <div className="card">
            <div className="grid grid-cols-5 gap-4 items-start">
              {/* FROM */}
              <div className="col-span-2">
                <SelectPair
                  label="Copy FROM"
                  sessions={sessions} classes={classes}
                  terms={fromTerms}
                  selSession={fromSession} selTerm={fromTerm} selClass={fromClass}
                  onSessionChange={setFromSession}
                  onTermChange={setFromTerm}
                  onClassChange={setFromClass}
                />
                {fromCount !== null && (
                  <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${fromCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {fromCount > 0
                      ? <><CheckCircle2 size={12} className="inline mr-1" />{fromCount} fee item{fromCount !== 1 ? 's' : ''} found</>
                      : <><AlertCircle size={12} className="inline mr-1" />No configs found for this selection</>}
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="flex justify-center pt-16">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <ArrowRight size={18} className="text-blue-600" />
                </div>
              </div>

              {/* TO */}
              <div className="col-span-2">
                <SelectPair
                  label="Copy TO"
                  sessions={sessions} classes={classes}
                  terms={toTerms}
                  selSession={toSession} selTerm={toTerm} selClass={toClass}
                  onSessionChange={setToSession}
                  onTermChange={setToTerm}
                  onClassChange={setToClass}
                />
              </div>
            </div>

            {/* Options */}
            {orderError && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>{orderError}</span>
              </div>
            )}
            <div className="mt-5 pt-5 border-t border-gray-200 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                Overwrite existing items in the destination (replaces price and rules)
              </label>
              <button
                className="btn-primary btn"
                disabled={!canCopy || copying}
                onClick={() => setConfirm(true)}
              >
                <Copy size={15} /> {copying ? 'Copying…' : `Copy ${fromCount || ''} Items`}
              </button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold">Copy successful</p>
                <p className="mt-0.5">{result.inserted} item(s) copied · {result.skipped} skipped</p>
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2.5 text-sm text-blue-800">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
            Copying duplicates all fee items with their amounts and rules. You can edit individual items after copying.
            Prices are not automatically adjusted — review and update amounts as needed.
          </div>
        </div>
      )}

      {/* ── LOG TAB ────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Last 50 copy operations</p>
          </div>
          {logLoading ? <Spinner /> : copyLog.length === 0 ? (
            <div className="empty-state py-10">
              <History size={28} className="empty-state-icon" />
              <p className="empty-state-title">No copy history</p>
              <p className="empty-state-sub">Copy operations will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {copyLog.map(entry => (
                <div key={entry.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                  <Copy size={14} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium text-gray-800">
                      {entry.from_session_name} · {entry.from_term_name} · {entry.from_class_name}
                    </span>
                    <ArrowRight size={13} className="inline mx-2 text-gray-400" />
                    <span className="font-medium text-gray-800">
                      {entry.to_session_name} · {entry.to_term_name} · {entry.to_class_name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {entry.copied_at ? entry.copied_at.slice(0, 16).replace('T', ' ') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm copy */}
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={doCopy}
        title="Confirm Copy"
        message={`Copy ${fromCount} fee item(s) from ${fromSessName} · ${fromTermName} · ${fromClassName} → ${toSessName} · ${toTermName} · ${toClassName}?${overwrite ? ' Existing items will be overwritten.' : ' Existing items will be skipped.'}`}
      />
    </div>
  )
}
