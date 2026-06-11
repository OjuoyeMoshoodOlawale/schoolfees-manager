import { useEffect, useState } from 'react'
import { Eye, AlertCircle, Users, Filter, Printer } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { toast } from 'react-toastify'
import { Download } from 'lucide-react'
import { printCleanHtml } from '../../lib/utils'

const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

const PROFILE_LABELS = {
  'M-new-day':          { label: 'Male · New · Day',          color: 'bg-blue-50 border-blue-200 text-blue-900' },
  'M-new-boarding':     { label: 'Male · New · Boarding',      color: 'bg-indigo-50 border-indigo-200 text-indigo-900' },
  'M-returning-day':    { label: 'Male · Returning · Day',     color: 'bg-sky-50 border-sky-200 text-sky-900' },
  'M-returning-boarding':{ label: 'Male · Returning · Boarding', color: 'bg-violet-50 border-violet-200 text-violet-900' },
  'F-new-day':          { label: 'Female · New · Day',         color: 'bg-pink-50 border-pink-200 text-pink-900' },
  'F-new-boarding':     { label: 'Female · New · Boarding',    color: 'bg-rose-50 border-rose-200 text-rose-900' },
  'F-returning-day':    { label: 'Female · Returning · Day',   color: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900' },
  'F-returning-boarding':{ label: 'Female · Returning · Boarding', color: 'bg-purple-50 border-purple-200 text-purple-900' },
}

function ProfileCard({ profile }) {
  const key   = `${profile.gender}-${profile.student_type}-${profile.boarding}`
  const meta  = PROFILE_LABELS[key] || { label: key, color: 'bg-gray-50 border-gray-200 text-gray-900' }
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border rounded-xl overflow-hidden ${meta.color}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <Users size={16} className="opacity-60 flex-shrink-0" />
          <span className="font-medium text-sm">{meta.label}</span>
          <span className="text-xs opacity-60">({profile.items.length} item{profile.items.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-bold text-base">{fmt(profile.total)}</p>
            <p className="text-xs opacity-60">{fmt(profile.compulsory_total)} compulsory</p>
          </div>
          <span className="text-xs opacity-50">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-current border-opacity-20">
          {profile.items.length === 0 ? (
            <p className="px-4 py-3 text-sm opacity-60">No fee items match this profile</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="opacity-60 text-xs">
                  <th className="text-left px-4 py-2 font-medium">Fee Item</th>
                  <th className="text-center px-2 py-2 font-medium">Type</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {profile.items.map(item => (
                  <tr key={item.id} className="border-t border-current border-opacity-10">
                    <td className="px-4 py-2 font-medium">{item.fee_item_name}</td>
                    <td className="px-2 py-2 text-center">
                      {item.is_compulsory
                        ? <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Compulsory</span>
                        : <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">Elective</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-current border-opacity-30 font-bold">
                  <td className="px-4 py-2">Total</td>
                  <td />
                  <td className="px-4 py-2 text-right">{fmt(profile.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function BillPreviewPage() {
  const [sessions, setSessions]   = useState([])
  const [classes, setClasses]     = useState([])
  const [terms, setTerms]         = useState([])
  const [selSession, setSelSession] = useState('')
  const [selTerm, setSelTerm]     = useState('')
  const [selClass, setSelClass]   = useState('')
  const [profiles, setProfiles]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [school, setSchool]       = useState(null)
  const [printing, setPrinting]   = useState(false)

  useEffect(() => {
    async function init() {
      const [sess, cls, currentTerm] = await Promise.all([
        window.api.listSessions(),
        window.api.listClasses(),
        window.api.getCurrentTerm(),
      ])
      window.api.getSettings().then(setSchool).catch(() => {})
      setSessions(sess)
      setClasses(cls.filter(c => c.is_active))
      if (currentTerm) {
        setSelSession(String(currentTerm.session_id))
        const termList = await window.api.listTerms(currentTerm.session_id)
        setTerms(termList)
        setSelTerm(String(currentTerm.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSession) window.api.listTerms(Number(selSession)).then(t => { setTerms(t); setSelTerm('') })
    else { setTerms([]); setSelTerm('') }
  }, [selSession])

  const loadPreview = async () => {
    if (!selTerm || !selClass) return
    setLoading(true)
    try {
      const data = await window.api.previewBillConfig({ term_id: Number(selTerm), class_id: Number(selClass) })
      setProfiles(data)
    } finally { setLoading(false) }
  }

  const handleExport = async () => {
    if (!profiles) return
    const rows = profiles.flatMap(p =>
      p.items.map(item => ({
        Profile:      `${p.gender === 'M' ? 'Male' : 'Female'} · ${p.student_type} · ${p.boarding}`,
        'Fee Item':   item.fee_item_name,
        Type:         item.is_compulsory ? 'Compulsory' : 'Elective',
        'Amount (₦)': item.amount,
      }))
    )
    await exportToExcel(rows, 'bill_preview')
    toast.success('Exported to Excel')
  }

  const hasAnyItem = profiles?.some(p => p.items.length > 0)

  // Print a generic fee bill (no student name) for a walk-in parent enquiry.
  // Prints each student-profile's fee breakdown for the selected class/term.
  const handlePrintEnquiry = async () => {
    if (!profiles || !hasAnyItem) return
    setPrinting(true)
    try {
      const sym = school?.currency_symbol || '₦'
      const fmtN = n => sym + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
      const className = classes.find(c => c.id === Number(selClass))?.name || ''
      const termName  = terms.find(t => t.id === Number(selTerm))?.name || ''
      const sessName  = sessions.find(s => s.id === Number(selSession))?.name || ''
      const schoolName = esc(school?.school_name || 'School')
      const logoHtml = school?.logo_path
        ? `<img src="localfile://${school.logo_path}" style="max-height:56px;max-width:140px;display:block;margin:0 auto 8px;object-fit:contain"/>` : ''
      const addr = [school?.address, school?.phone, school?.email].filter(Boolean).map(esc).join(' &bull; ')

      const profileBlocks = profiles.filter(p => p.items.length > 0).map(p => {
        const label = `${p.gender === 'M' ? 'Male' : 'Female'} · ${p.student_type} · ${p.boarding}`
        const rows = p.items.map(it => `
          <tr><td style="padding:4px 12px;font-size:9.5pt">${esc(it.fee_item_name)}</td>
          <td style="padding:4px 12px;font-size:9pt;text-align:center;color:#64748b">${it.is_compulsory ? 'Compulsory' : 'Elective'}</td>
          <td style="padding:4px 12px;font-size:9.5pt;text-align:right;font-weight:600">${fmtN(it.amount)}</td></tr>`).join('')
        return `
          <div style="margin-bottom:14px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden">
            <div style="background:#1e293b;color:#fff;padding:6px 12px;font-size:9.5pt;font-weight:bold;display:flex;justify-content:space-between">
              <span>${esc(label)}</span><span>${fmtN(p.total)}</span>
            </div>
            <table style="width:100%;border-collapse:collapse">${rows}</table>
          </div>`
      }).join('')

      const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="text-align:center;padding:14px 20px 10px;border-bottom:2px solid #1e293b">
          ${logoHtml}
          <div style="font-size:15pt;font-weight:bold;text-transform:uppercase;letter-spacing:.04em">${schoolName}</div>
          ${addr ? `<div style="font-size:8.5pt;color:#64748b;margin-top:3px;font-family:Arial,sans-serif">${addr}</div>` : ''}
        </div>
        <div style="text-align:center;padding:8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif">
          <span style="font-size:11pt;font-weight:bold;letter-spacing:.06em">SCHOOL FEES SCHEDULE — ${esc((termName||'').toUpperCase())}, ${esc(sessName)}</span><br/>
          <span style="font-size:10pt;color:#475569">Class: ${esc(className)}</span>
        </div>
        <div style="padding:14px 16px">
          ${profileBlocks}
          <p style="font-size:8.5pt;color:#94a3b8;text-align:center;margin-top:14px;font-family:Arial,sans-serif">
            This is an indicative fee schedule for enquiry purposes. Actual fees depend on the student's category.
          </p>
        </div>
      </div>`
      await printCleanHtml(html)
    } catch (e) {
      toast.error('Print failed: ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Bill Preview"
        subtitle="See what each student profile would be billed for a selected class and term."
        actions={
          profiles && hasAnyItem && (
            <div className="flex gap-2">
              <button className="btn-secondary btn btn-sm" onClick={handlePrintEnquiry} disabled={printing}>
                <Printer size={14} /> {printing ? 'Printing…' : 'Print Schedule'}
              </button>
              <button className="btn-secondary btn btn-sm" onClick={handleExport}>
                <Download size={14} /> Export Excel
              </button>
            </div>
          )
        }
      />

      {/* Selectors */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-36">
            <label className="form-label flex items-center gap-1">
              <Filter size={12} className="text-gray-400" /> Session
            </label>
            <select className="form-select" value={selSession} onChange={e => setSelSession(e.target.value)}>
              <option value="">— Select session —</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-36">
            <label className="form-label">Term</label>
            <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)} disabled={!selSession}>
              <option value="">— Select term —</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-36">
            <label className="form-label">Class</label>
            <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button
            className="btn-primary btn"
            disabled={!selTerm || !selClass || loading}
            onClick={loadPreview}
          >
            <Eye size={15} /> {loading ? 'Loading…' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!profiles && !loading && (
        <div className="card text-center py-14">
          <Eye size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select a session, term and class, then click Preview</p>
          <p className="text-gray-400 text-sm mt-1">All 8 student profile combinations will be shown</p>
        </div>
      )}

      {loading && <Spinner />}

      {profiles && !loading && (
        <div className="space-y-3">
          {!hasAnyItem && (
            <div className="flex gap-2.5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
              No fee items are configured for this class and term yet. Go to Bill Config to add items.
            </div>
          )}
          {profiles.map((p, i) => (
            <ProfileCard key={i} profile={p} />
          ))}
        </div>
      )}
    </div>
  )
}
