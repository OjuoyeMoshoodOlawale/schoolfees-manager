import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { AlertTriangle, CheckCircle, Trash2, RefreshCw, CheckCheck, Eye } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const SEV_COLORS = {
  error:   'badge-red',
  warning: 'badge-yellow',
  info:    'badge-blue',
}

export default function SystemErrorsPage() {
  const { canAdmin } = useAuth()
  const [errors,      setErrors]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showResolved,setShowResolved]= useState(false)
  const [detail,      setDetail]      = useState(null)
  const [resolveModal,setResolveModal]= useState(null)
  const [resolution,  setResolution]  = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setErrors(await window.api.errorsList({ resolved: showResolved }))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [showResolved])

  const resolve = async () => {
    setSaving(true)
    try {
      await window.api.errorsResolve({ id: resolveModal, resolution })
      toast.success('Marked as resolved')
      setResolveModal(null); setResolution(''); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const resolveAll = async () => {
    if (!confirm('Mark all errors as resolved?')) return
    await window.api.errorsResolveAll()
    toast.success('All errors resolved'); load()
  }

  const del = async (id) => {
    if (!confirm('Delete this error log?')) return
    await window.api.errorsDelete(id)
    toast.success('Deleted'); load()
  }

  const clearResolved = async () => {
    if (!confirm('Delete all resolved errors?')) return
    await window.api.errorsClearResolved()
    toast.success('Cleared'); load()
  }

  const fmtDate = d => d ? new Date(d).toLocaleString('en-NG') : '—'

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Errors"
        subtitle="Technical errors logged by the app — review and resolve"
        actions={canAdmin && (
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)}/>
              Show resolved
            </label>
            <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13}/> Refresh</button>
            {!showResolved && errors.length > 0 && (
              <button className="btn btn-secondary btn-sm text-emerald-600" onClick={resolveAll}>
                <CheckCheck size={13}/> Resolve All
              </button>
            )}
            {showResolved && (
              <button className="btn btn-secondary btn-sm text-red-500" onClick={clearResolved}>
                <Trash2 size={13}/> Clear Resolved
              </button>
            )}
          </div>
        )}
      />

      {!showResolved && errors.length > 0 && (
        <div className="flex gap-3 items-start rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="font-semibold text-amber-800 text-sm">{errors.length} unresolved error{errors.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              These are technical errors caught by the app. Users saw a friendly message — not the raw error below.
              Review and mark as resolved once investigated.
            </p>
          </div>
        </div>
      )}

      {loading ? <div className="py-10"><Spinner/></div> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>Time</th><th>Handler</th><th>Message</th><th>Severity</th>
              {showResolved && <th>Resolution</th>}
              <th></th>
            </tr></thead>
            <tbody>
              {errors.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2"/>
                    <p className="text-gray-500 font-medium">
                      {showResolved ? 'No resolved errors' : 'No unresolved errors — all good!'}
                    </p>
                  </td>
                </tr>
              )}
              {errors.map(e => (
                <tr key={e.id} className={e.resolved ? 'opacity-50' : ''}>
                  <td className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                  <td>
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {e.handler || '—'}
                    </span>
                  </td>
                  <td className="max-w-xs">
                    <p className="text-sm truncate" title={e.message}>{e.message}</p>
                  </td>
                  <td><span className={`badge ${SEV_COLORS[e.severity] || 'badge-gray'}`}>{e.severity}</span></td>
                  {showResolved && <td className="text-xs text-gray-500">{e.resolution || '—'}</td>}
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm btn-secondary" onClick={() => setDetail(e)} title="View details">
                        <Eye size={12}/>
                      </button>
                      {!e.resolved && canAdmin && (
                        <button className="btn btn-sm btn-secondary text-emerald-600"
                          onClick={() => { setResolveModal(e.id); setResolution('') }}
                          title="Mark resolved">
                          <CheckCircle size={12}/>
                        </button>
                      )}
                      {canAdmin && (
                        <button className="btn btn-sm btn-secondary text-red-500" onClick={() => del(e.id)} title="Delete">
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Error Details" size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-gray-400 mb-1">Handler</p>
                <p className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{detail.handler || '—'}</p></div>
              <div><p className="text-xs text-gray-400 mb-1">Severity</p>
                <span className={`badge ${SEV_COLORS[detail.severity]}`}>{detail.severity}</span></div>
              <div><p className="text-xs text-gray-400 mb-1">Time</p>
                <p>{fmtDate(detail.created_at)}</p></div>
              <div><p className="text-xs text-gray-400 mb-1">Status</p>
                <span className={`badge ${detail.resolved ? 'badge-green' : 'badge-red'}`}>
                  {detail.resolved ? 'Resolved' : 'Unresolved'}
                </span></div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Error Message</p>
              <p className="bg-red-50 border border-red-100 rounded px-3 py-2 font-mono text-xs text-red-800 break-all">
                {detail.message}
              </p>
            </div>
            {detail.context && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Context (inputs that caused error)</p>
                <pre className="bg-gray-50 rounded px-3 py-2 text-xs overflow-auto max-h-24 text-gray-700">
                  {(() => { try { return JSON.stringify(JSON.parse(detail.context), null, 2) } catch { return detail.context } })()}
                </pre>
              </div>
            )}
            {detail.stack && (
              <details>
                <summary className="cursor-pointer text-xs text-gray-400">Stack trace</summary>
                <pre className="mt-2 bg-gray-50 rounded px-3 py-2 text-xs overflow-auto max-h-40 text-gray-500 whitespace-pre-wrap">
                  {detail.stack}
                </pre>
              </details>
            )}
            {detail.resolution && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Resolution</p>
                <p className="text-sm text-emerald-700">{detail.resolution}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Resolve modal */}
      <Modal open={!!resolveModal} onClose={() => setResolveModal(null)} title="Mark as Resolved">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Describe what was done to fix this issue (optional — for your records):
          </p>
          <textarea className="form-input" rows={3} value={resolution}
            onChange={e => setResolution(e.target.value)}
            placeholder="e.g. Added missing boarding_type field to student form, updated migration"/>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={resolve} disabled={saving}>
            {saving ? 'Saving…' : 'Mark Resolved'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
