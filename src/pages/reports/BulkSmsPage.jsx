import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { MessageSquare, Send, Users, CheckSquare, Square, AlertCircle } from 'lucide-react'
import { PageHeader, Spinner, SearchInput } from '../../components/ui'

export default function BulkSmsPage() {
  const [students, setStudents]     = useState([])
  const [classes, setClasses]       = useState([])
  const [filterClass, setFilterClass] = useState('')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState([])
  const [message, setMessage]       = useState('')
  const [sending, setSending]       = useState(false)
  const [result, setResult]         = useState(null)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    async function init() {
      const [studs, cls, settings] = await Promise.all([
        window.api.listStudents({ status: 'active' }),
        window.api.listClasses(),
        window.api.getSettings(),
      ])
      setStudents(studs)
      setClasses(cls.filter(c => c.is_active))
      setSmsEnabled(!!settings?.sms_enabled && !!settings?.sms_provider)
      setLoading(false)
    }
    init()
  }, [])

  const filtered = students.filter(s => {
    const matchClass = !filterClass || String(s.class_id) === filterClass
    const matchSearch = !search || `${s.first_name} ${s.last_name} ${s.reg_number}`.toLowerCase().includes(search.toLowerCase())
    return matchClass && matchSearch && s.parent_phone
  })

  const toggleSelect = (id) =>
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])

  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map(s => s.id))

  const doSend = async () => {
    if (!message.trim()) { toast.error('Enter a message'); return }
    if (!selected.length) { toast.error('Select at least one student'); return }

    setSending(true)
    setResult(null)
    try {
      // If the message uses <<bal>>, fetch each selected student's balance
      const needsBalance = /<<\s*bal(ance)?\s*>>/i.test(message)
      const balanceMap = {}
      if (needsBalance) {
        await Promise.all(
          selected.map(async id => {
            try {
              const sum = await window.api.getStudentBillSummary({ student_id: id })
              balanceMap[id] = sum?.balance ?? 0
            } catch { balanceMap[id] = 0 }
          })
        )
      }

      const recipients = students
        .filter(s => selected.includes(s.id))
        .map(s => ({
          phone: s.parent_phone,
          student_id: s.id,
          name: `${s.last_name} ${s.first_name}`.trim(),
          first_name: s.first_name,
          balance: needsBalance ? balanceMap[s.id] : null,
        }))

      const res = await window.api.sendBulkSms({ recipients, message: message.trim() })
      setResult(res)
      if (res.ok) {
        toast.success(`${res.sent} sent · ${res.failed} failed`)
      } else {
        toast.error(res.error || 'SMS failed')
      }
    } catch (e) { toast.error(e.message || 'Failed') }
    finally { setSending(false) }
  }

  // Insert a placeholder at the end of the current message
  const insertToken = (token) => setMessage(m => (m ? m + ' ' : '') + token)

  const charsLeft = 160 - message.length
  const msgParts  = Math.ceil(message.length / 160)

  if (loading) return <Spinner />

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Bulk SMS"
        subtitle="Send text messages to parents of selected students."
      />

      {/* SMS not configured warning */}
      {!smsEnabled && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">SMS not configured</p>
            <p className="text-xs text-amber-700 mt-1">
              Go to <strong>Settings → SMS</strong> to enable an SMS provider and enter your API key.
              Once configured, you can send messages to parents from this page.
            </p>
          </div>
        </div>
      )}

      {/* Message composer */}
      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Message</h2>
        <textarea
          className="form-input resize-none w-full"
          rows={4}
          placeholder="Type your message here…&#10;e.g. Dear Parent, please be informed that first term fees are due. Contact 08012345678 for enquiries."
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={480}
        />
        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
          <span>{message.length} characters · {msgParts} SMS unit{msgParts !== 1 ? 's' : ''} per recipient</span>
          <span className={charsLeft < 0 ? 'text-red-500' : ''}>{charsLeft > 0 ? `${charsLeft} chars left (1 SMS)` : `${msgParts} SMS units`}</span>
        </div>

        {/* Personalisation tokens */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Insert:</span>
          {[
            { token: '<<name>>', label: "Parent/ward name" },
            { token: '<<bal>>',  label: 'Outstanding balance' },
            { token: '<<school>>', label: 'School name' },
          ].map(t => (
            <button key={t.token} title={t.label}
              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono px-2 py-1 rounded transition"
              onClick={() => insertToken(t.token)}>
              {t.token}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Tokens are replaced per recipient. Example: “Dear Parent, your ward <span className="font-mono">&lt;&lt;name&gt;&gt;</span> has an outstanding balance of <span className="font-mono">&lt;&lt;bal&gt;&gt;</span>.”
        </p>

        {/* Quick templates */}
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-2">Quick templates (click to use, then customise):</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Personalised balance', text: 'Dear Parent, your ward <<name>> has an outstanding fee balance of <<bal>>. Kindly settle at the bursar\'s office. - <<school>>' },
              { label: 'Fees due', text: 'Dear Parent, first term fees are now due. Please make payment promptly to avoid penalty. - <<school>>' },
              { label: 'Reminder', text: 'Dear Parent, reminder: school reopens on Monday. Ensure <<name>>\'s fees are paid before resumption.' },
            ].map((t, i) => (
              <button key={i} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded transition"
                onClick={() => setMessage(t.text)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recipient selector */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <button onClick={toggleAll} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600">
            {selected.length === filtered.length && filtered.length > 0
              ? <CheckSquare size={15} className="text-blue-600" />
              : <Square size={15} />}
            Select all ({filtered.length})
          </button>
          <div className="flex-1 min-w-40">
            <SearchInput value={search} onChange={setSearch} placeholder="Search students…" />
          </div>
          <select className="form-select w-36" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No students with phone numbers found</div>
          ) : filtered.map(s => (
            <div key={s.id}
              onClick={() => toggleSelect(s.id)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                ${selected.includes(s.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className="text-gray-400 flex-shrink-0">
                {selected.includes(s.id)
                  ? <CheckSquare size={15} className="text-blue-600" />
                  : <Square size={15} />}
              </div>
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                {s.first_name?.[0]}{s.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                <p className="text-xs text-gray-400">{s.class_name} · {s.parent_name || 'Parent'}</p>
              </div>
              <span className="text-xs text-gray-500 font-mono flex-shrink-0">{s.parent_phone}</span>
            </div>
          ))}
        </div>

        {/* Send footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selected.length} recipient{selected.length !== 1 ? 's' : ''} selected
          </span>
          <button
            className="btn-primary btn"
            onClick={doSend}
            disabled={sending || !selected.length || !message.trim() || !smsEnabled}
          >
            {sending
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</>
              : <><Send size={14} /> Send to {selected.length}</>}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`mt-4 p-4 rounded-xl border ${result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-semibold ${result.ok ? 'text-emerald-800' : 'text-red-800'}`}>
            {result.ok ? `Sent: ${result.sent} · Failed: ${result.failed}` : result.error}
          </p>
          {result.errors?.length > 0 && (
            <ul className="mt-2 text-xs text-red-700 space-y-0.5">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
