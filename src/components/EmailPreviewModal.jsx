import { X, Mail, Send, AlertCircle } from 'lucide-react'

/**
 * EmailPreviewModal — shows the exact email (To / Subject / rendered HTML body)
 * before anything is dispatched. The user confirms with Send or backs out.
 *
 * Props:
 *   open      : boolean
 *   to        : recipient address ('' shows a missing-email warning)
 *   subject   : email subject line
 *   html      : full email body HTML (rendered sandboxed in an iframe)
 *   sending   : boolean — disables Send while dispatching
 *   onSend    : () => void
 *   onClose   : () => void
 */
export default function EmailPreviewModal({ open, to, subject, html, sending, onSend, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-slate-50">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Mail size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm">Email Preview</p>
            <p className="text-xs text-gray-400">Review before sending — nothing has been sent yet</p>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Envelope details */}
        <div className="px-5 py-2.5 border-b border-gray-100 space-y-1 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-400 w-14 flex-shrink-0">To:</span>
            {to
              ? <span className="font-medium text-gray-700 truncate">{to}</span>
              : <span className="text-red-500 flex items-center gap-1 text-xs font-medium">
                  <AlertCircle size={13}/> No parent email on file — sending will fail
                </span>}
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-14 flex-shrink-0">Subject:</span>
            <span className="text-gray-700 truncate">{subject}</span>
          </div>
        </div>

        {/* Body preview — sandboxed iframe so email styles can't leak out */}
        <div className="flex-1 overflow-hidden bg-gray-100 p-3">
          <iframe
            title="Email body preview"
            sandbox=""
            srcDoc={html}
            className="w-full h-full min-h-[380px] bg-white rounded-lg border border-gray-200"
          />
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-white">
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSend} disabled={sending || !to}>
            <Send size={13} /> {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
