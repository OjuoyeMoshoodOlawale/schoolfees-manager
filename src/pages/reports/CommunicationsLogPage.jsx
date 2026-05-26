import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { MessageSquare, Mail, RefreshCw, Edit2, Check, X } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { fmtDate } from '../../lib/utils'

const STATUS_STYLE = {
  sent:    'bg-emerald-100 text-emerald-700',
  failed:  'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
}

function EditContactModal({ open, type, log, onClose, onSaved }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setValue(type === 'sms' ? log?.phone : log?.email) }, [open, log])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    try {
      const result = type === 'sms'
        ? await window.api.smsUpdateResend({ log_id: log.id, new_phone: value })
        : await window.api.emailUpdateResend({ log_id: log.id, new_email: value })
      if (result.ok) { toast.success('Updated and resent successfully'); onSaved() }
      else toast.error(result.error || 'Failed')
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
        <h3 className="font-semibold text-gray-800">
          {type === 'sms' ? 'Update Phone & Resend' : 'Update Email & Resend'}
        </h3>
        <p className="text-xs text-gray-500">
          Student: <strong>{log?.last_name} {log?.first_name}</strong><br/>
          This will update the student's contact and resend immediately.
        </p>
        <input
          className="form-input w-full"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={type === 'sms' ? '080XXXXXXXX' : 'parent@email.com'}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary btn btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary btn btn-sm" onClick={save} disabled={saving || !value.trim()}>
            {saving ? 'Sending…' : 'Update & Resend'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommunicationsLogPage() {
  const [tab,     setTab]     = useState('email')
  const [filter,  setFilter]  = useState('all')
  const [smsLogs, setSmsLogs] = useState([])
  const [emlLogs, setEmlLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [editLog, setEditLog] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [sms, email] = await Promise.all([
        window.api.getSmsLogFull({ limit: 300 }),
        window.api.getEmailLogFull({ limit: 300 }),
      ])
      setSmsLogs(sms || [])
      setEmlLogs(email || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const resendSms = async (log) => {
    try {
      const r = await window.api.smsResend({ log_id: log.id })
      if (r.ok) { toast.success('Resent successfully'); load() }
      else toast.error(r.error || 'Failed to resend')
    } catch(e) { toast.error(e.message) }
  }

  const resendEmail = async (log) => {
    try {
      const r = await window.api.emailResend({ log_id: log.id })
      if (r.ok) { toast.success('Resent successfully'); load() }
      else toast.error(r.error || 'Failed to resend')
    } catch(e) { toast.error(e.message) }
  }

  const logs = tab === 'sms' ? smsLogs : emlLogs
  const filtered = filter === 'all' ? logs : logs.filter(l => l.status === filter)
  const failedCount = (tab === 'sms' ? smsLogs : emlLogs).filter(l => l.status === 'failed').length

  return (
    <div>
      <PageHeader title="Communications Log" subtitle="View sent, failed, and pending SMS and email notifications. Resend or fix contact details."
        actions={<button className="btn-secondary btn btn-sm" onClick={load}><RefreshCw size={14}/> Refresh</button>}
      />

      {failedCount > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-800">
          <span className="font-bold">⚠ {failedCount} failed {tab === 'sms' ? 'SMS' : 'email'}(s)</span>
          — click the resend button or fix the contact details to retry.
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('email')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab==='email'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>
            <Mail size={13}/> Email ({emlLogs.length})
          </button>
          <button onClick={() => setTab('sms')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab==='sms'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>
            <MessageSquare size={13}/> SMS ({smsLogs.length})
          </button>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {['all','sent','failed','pending'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${filter===f?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner/> : (
        <div className="card overflow-hidden p-0">
          {filtered.length === 0
            ? <div className="py-12 text-center text-gray-400 text-sm">No {filter === 'all' ? '' : filter} {tab} records found.</div>
            : (
              <table className="data-table">
                <thead><tr>
                  <th>Student</th>
                  <th>{tab === 'sms' ? 'Phone' : 'Email'}</th>
                  <th>{tab === 'sms' ? 'Message' : 'Subject'}</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Reason / Error</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(log => (
                    <tr key={log.id} className={log.status === 'failed' ? 'bg-red-50' : ''}>
                      <td className="font-medium text-sm">
                        {log.last_name ? `${log.last_name} ${log.first_name}` : '—'}
                        {log.reg_number && <p className="text-xs text-gray-400 font-mono">{log.reg_number}</p>}
                      </td>
                      <td className="text-sm font-mono text-gray-600">
                        {tab === 'sms' ? log.phone : log.email}
                      </td>
                      <td className="text-xs text-gray-600 max-w-xs truncate">
                        {tab === 'sms' ? log.message : log.subject}
                      </td>
                      <td className="text-xs text-gray-500">{fmtDate(log.sent_at || log.created_at)}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[log.status] || 'bg-gray-100 text-gray-600'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="text-xs text-red-600 max-w-xs">
                        {log.error_reason || (log.status === 'sent' ? '' : '—')}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200 text-xs"
                            onClick={() => tab === 'sms' ? resendSms(log) : resendEmail(log)}
                            title="Resend"
                          >
                            <RefreshCw size={12}/>
                          </button>
                          <button
                            className="btn btn-sm text-amber-600 hover:bg-amber-50 border border-amber-200 text-xs"
                            onClick={() => setEditLog(log)}
                            title={`Fix ${tab === 'sms' ? 'phone' : 'email'} & resend`}
                          >
                            <Edit2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      <EditContactModal
        open={!!editLog}
        type={tab}
        log={editLog}
        onClose={() => setEditLog(null)}
        onSaved={() => { setEditLog(null); load() }}
      />
    </div>
  )
}
