import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  ArrowLeft, Receipt, Printer, FileText, RefreshCw, Mail
} from 'lucide-react'
import { PageHeader, Confirm, Spinner } from '../../components/ui'
import EmailPreviewModal from '../../components/EmailPreviewModal'
import { useAuth } from '../../context/AuthContext'
import { fmtDate, buildBillSlipHtml, printCleanHtml } from '../../lib/utils'
import AdjustmentModal from './AdjustmentModal'

export default function StudentBillPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { fmt, canEdit } = useAuth()

  const [summary,      setSummary]      = useState(null)
  const [payments,     setPayments]     = useState([])
  const [school,       setSchool]       = useState(null)
  const [currentTerm,  setCurrentTerm]  = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [showAdj,      setShowAdj]      = useState(false)
  const [deleteAdj,    setDeleteAdj]    = useState(null)
  const [regenerating, setRegenerating] = useState(false)
  const [printing,     setPrinting]     = useState(false)
  const [emailing,     setEmailing]     = useState(false)

  const load = useCallback(async () => {
    const [data, pmts, s, term] = await Promise.all([
      window.api.getStudentBillSummary({ student_id: Number(id) }),
      window.api.listPayments({ student_id: Number(id) }),
      window.api.getSettings(),
      window.api.getCurrentTerm(),
    ])
    setSummary(data)
    setPayments(pmts || [])
    setSchool(s)
    setCurrentTerm(term)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // ── Auto-check: show banner if student has no bills but fee config exists ──
  const hasBills = summary?.bills?.length > 0

  const onRegenerateBills = async () => {
    if (!window.confirm(
      hasBills
        ? 'Re-check this student\'s bills against their current profile (gender, boarding, entry type)?\n\nExisting payments are safe — only missing or obsolete pending lines are updated.'
        : 'This student has no bills yet. Generate bills based on their current profile?'
    )) return
    setRegenerating(true)
    try {
      const result = await window.api.regenerateStudentBills({ student_id: Number(id) })
      toast.success(result.message || 'Bills updated')
      load()
    } catch (e) {
      toast.error(e.message || 'Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  const onWaive = async (bill) => {
    await window.api.waiveBill({ bill_id: bill.id, waive: bill.status !== 'waived' })
    toast.success(bill.status === 'waived' ? 'Bill reinstated' : 'Bill waived')
    load()
  }

  const onDeleteAdj = async () => {
    await window.api.deleteAdjustment(deleteAdj.id)
    toast.success('Adjustment removed')
    load()
  }

  const handlePrint = async () => {
    if (!summary) return
    setPrinting(true)
    try {
      const sessionName = currentTerm?.session_name || ''
      const termName    = currentTerm?.name          || ''
      const className   = summary.student?.class_name || ''

      const html = buildBillSlipHtml({
        ...summary,
        school,
        sessionName,
        termName,
        className,
      })
      const r = await printCleanHtml(html)
      if (r && !r.ok) toast.error('Print failed: ' + (r.error || 'Unknown error'))
    } catch(e) {
      toast.error('Print error: ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  // Email the term bill to the parent — preview first, send on confirm
  const [emailPreview, setEmailPreview] = useState(null) // { to, subject, html }
  const handleEmailBill = async () => {
    if (!summary?.student) return
    setEmailing(true)
    try {
      const p = await window.api.previewBillEmail({
        student_id: Number(id),
        term_id: currentTerm?.id,
      })
      if (!p.ok) { toast.error(p.error || 'Could not build email preview'); return }
      if (!p.email_enabled) { toast.error('Email sending is disabled in Settings'); return }
      setEmailPreview(p)   // show the preview modal — user confirms with Send
    } catch (e) { toast.error(e.message) }
    finally { setEmailing(false) }
  }

  const confirmSendEmail = async () => {
    setEmailing(true)
    try {
      const r = await window.api.sendBillEmail({
        student_id: Number(id),
        term_id: currentTerm?.id,
      })
      if (r.ok) {
        toast.success(`Bill emailed to ${emailPreview?.to || 'parent'}!`)
        setEmailPreview(null)
      }
      else toast.error(r.error || 'Failed to send bill email')
    } catch (e) { toast.error(e.message) }
    finally { setEmailing(false) }
  }

  if (loading) return <Spinner />
  if (!summary) return (
    <div className="card text-center py-10">
      <p className="text-gray-400">Student not found or no data available.</p>
      <button className="btn-secondary btn mt-4" onClick={() => navigate(-1)}>← Back</button>
    </div>
  )

  const { student, bills, adjustments, bill_total, prev_balance,
          adj_total, total_expected, total_paid, balance } = summary

  const pct      = total_expected > 0 ? Math.min(Math.round((total_paid / total_expected) * 100), 100) : 0
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${student.last_name} ${student.first_name}`}
        subtitle={`${student.reg_number} · ${student.gender === 'M' ? 'Male' : 'Female'} · ${student.boarding_type || 'day'} · ${student.entry_type}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
              <Printer size={14} /> {printing ? 'Printing…' : 'Print Bill'}
            </button>
            <button className="btn-secondary btn btn-sm" onClick={handleEmailBill} disabled={emailing}
              title={summary?.student?.parent_email ? `Email to ${summary.student.parent_email}` : 'No parent email on file'}>
              <Mail size={14} /> {emailing ? 'Working…' : 'Email Bill'}
            </button>
            <button className="btn-secondary btn btn-sm" onClick={() => navigate(`/billing/student/${id}/statement`)}>
              <FileText size={14} /> Statement
            </button>
            <button className="btn-secondary btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} /> Back
            </button>
            {canEdit && (
              <button className="btn-primary btn" onClick={() => navigate(`/payments/new?student=${id}`)}>
                <Receipt size={14} /> Post Payment
              </button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Billed', value: fmt(total_expected), color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Total Paid',   value: fmt(total_paid),     color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Balance Due',  value: fmt(balance),        color: balance > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Paid',         value: `${pct}%`,           color: pct >= 100 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : pct >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-red-700 bg-red-50 border-red-200' },
        ].map(c => (
          <div key={c.label} className={`border rounded-xl px-4 py-3 ${c.color}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">{c.label}</p>
            <p className="text-2xl font-bold mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{fmt(total_paid)} paid of {fmt(total_expected)}</p>
      </div>

      {/* Bill items */}
      <div className="card mb-4 overflow-hidden p-0">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Fee Items</h2>
          {canEdit && (
            <div className="flex gap-2">
              <button
                className="btn-secondary btn btn-sm"
                onClick={onRegenerateBills}
                disabled={regenerating}
                title="Recalculates bills based on student's current profile. Safe even after payments — only adjusts pending lines."
              >
                <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                {regenerating ? 'Working…' : '↺ Recalculate Bills'}
              </button>
              <button className="btn-primary btn btn-sm" onClick={() => setShowAdj(true)}>
                + Add Adjustment
              </button>
            </div>
          )}
        </div>

        {bills.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            No bills generated yet.{canEdit && ' Use "↺ Recalculate Bills" above to generate them.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fee Item</th>
                <th>Type</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} className={b.status === 'waived' ? 'opacity-40' : b.status === 'frozen' ? 'opacity-50 bg-gray-50' : ''}>
                  <td className={`font-medium ${b.status === 'waived' ? 'line-through' : ''}`}>{b.fee_item_name}</td>
                  <td>{b.is_compulsory
                    ? <span className="badge-green badge">Compulsory</span>
                    : <span className="badge-yellow badge">Elective</span>}
                  </td>
                  <td>
                    <span className={`badge ${b.status === 'waived' ? 'badge-gray' : b.status === 'frozen' ? 'badge-gray' : 'badge-blue'}`}>
                      {b.status === 'frozen' ? '❄ frozen' : b.status}
                    </span>
                  </td>
                  <td className="text-right font-semibold">{fmt(b.amount)}</td>
                  <td className="text-right">
                    {canEdit && b.status !== 'frozen' && (
                      <button
                        onClick={() => onWaive(b)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                      >{b.status === 'waived' ? 'Reinstate' : 'Waive'}</button>
                    )}
                  </td>
                </tr>
              ))}
              {prev_balance > 0 && (
                <tr className="bg-amber-50">
                  <td className="italic text-amber-800">Previous term balance</td>
                  <td><span className="badge-yellow badge">Carry-over</span></td>
                  <td></td>
                  <td className="text-right font-semibold text-amber-800">{fmt(prev_balance)}</td>
                  <td></td>
                </tr>
              )}
              {adjustments.map(a => {
                const effect = a.calc_mode === 'percent' ? (a.amount / 100) * bill_total : a.amount
                const isAdd  = a.type === 'addition'
                return (
                  <tr key={a.id} className={isAdd ? 'bg-red-50' : 'bg-emerald-50'}>
                    <td className="italic">
                      {isAdd ? '+ Addition' : '− Discount'} — {a.reason}
                    </td>
                    <td><span className={`badge ${isAdd ? 'badge-red' : 'badge-green'}`}>{a.calc_mode}</span></td>
                    <td></td>
                    <td className={`text-right font-semibold ${isAdd ? 'text-red-700' : 'text-emerald-700'}`}>
                      {isAdd ? '+' : '−'}{fmt(effect)}
                    </td>
                    <td className="text-right">
                      {canEdit && (
                        <button className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
                          onClick={() => setDeleteAdj(a)}>✕</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-900 text-white font-bold">
                <td colSpan={3} className="px-4 py-3">TOTAL EXPECTED</td>
                <td className="text-right px-4 py-3 text-lg">{fmt(total_expected)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Payment history */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Payment History</h2>
        </div>
        {payments.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No payments recorded yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className={p.is_reversed ? 'opacity-40 line-through' : ''}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{p.receipt_number}</td>
                  <td className="text-sm text-gray-600">{fmtDate(p.payment_date)}</td>
                  <td><span className="badge-blue badge uppercase">{p.payment_method}</span></td>
                  <td className="text-xs text-gray-400">{p.reference || '—'}</td>
                  <td className="text-right font-bold text-emerald-700">{fmt(p.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-bold">
                <td colSpan={4} className="px-4 py-2 text-emerald-800">Total Paid</td>
                <td className="text-right px-4 py-2 text-emerald-700">{fmt(total_paid)}</td>
              </tr>
              <tr className={`font-bold ${balance > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <td colSpan={4} className={`px-4 py-2 ${balance > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                  Balance Outstanding
                </td>
                <td className={`text-right px-4 py-2 ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {fmt(balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Isolated adjustment modal — no re-renders on parent */}
      <AdjustmentModal
        open={showAdj}
        onClose={() => setShowAdj(false)}
        studentId={id}
        billTotal={bill_total}
        onSaved={load}
      />

      <Confirm
        open={!!deleteAdj}
        onClose={() => setDeleteAdj(null)}
        onConfirm={onDeleteAdj}
        danger
        title="Remove Adjustment"
        message={`Remove this ${deleteAdj?.type} adjustment? (${deleteAdj?.reason})`}
      />
      <EmailPreviewModal
        open={!!emailPreview}
        to={emailPreview?.to}
        subject={emailPreview?.subject}
        html={emailPreview?.html}
        sending={emailing}
        onSend={confirmSendEmail}
        onClose={() => setEmailPreview(null)}
      />
    </div>
  )
}
