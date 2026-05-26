import { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import { Users, Download, Loader, Printer } from 'lucide-react'
import { PageHeader, Spinner, exportToExcel } from '../../components/ui'
import { printCleanHtml } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'

const STATUS_STYLE = { paid: 'bg-emerald-100 text-emerald-700', partial: 'bg-amber-100 text-amber-700', unpaid: 'bg-red-100 text-red-700' }

export default function ClassFeeStatusPage() {
  const { fmt } = useAuth()
  const [classes,  setClasses]  = useState([])
  const [terms,    setTerms]    = useState([])
  const [sessions, setSessions] = useState([])
  const [selClass, setSelClass] = useState('')
  const [selTerm,  setSelTerm]  = useState('')
  const [selSess,  setSelSess]  = useState('')
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    async function init() {
      const [cls, sess, ct] = await Promise.all([window.api.listClasses(), window.api.listSessions(), window.api.getCurrentTerm()])
      setClasses(cls.filter(c => c.is_active))
      setSessions(sess)
      if (ct) {
        setSelSess(String(ct.session_id))
        const tlist = await window.api.listTerms(ct.session_id)
        setTerms(tlist)
        setSelTerm(String(ct.id))
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selSess) window.api.listTerms(Number(selSess)).then(t => { setTerms(t) })
  }, [selSess])

  const load = async () => {
    if (!selClass || !selTerm) { toast.error('Select a class and term'); return }
    setLoading(true)
    try {
      const data = await window.api.getClassFeeStatus({ class_id: Number(selClass), term_id: Number(selTerm) })
      setRows(data)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const exportData = async () => {
    const out = rows.map(r => ({
      'Reg No': r.reg_number, 'Student': `${r.last_name} ${r.first_name}`,
      'Gender': r.gender === 'M' ? 'Male' : 'Female', 'Boarding': r.boarding_type,
      'Billed (₦)': r.total_expected, 'Paid (₦)': r.total_paid,
      'Balance (₦)': r.balance, 'Rate %': r.pct, 'Status': r.payment_status,
    }))
    await exportToExcel(out, `class_fee_status_${classes.find(c=>c.id===Number(selClass))?.name}`)
    toast.success('Exported')
  }

  const className = classes.find(c => c.id === Number(selClass))?.name || ''
  const filtered  = rows.filter(r => filter === 'all' || r.payment_status === filter)
  const totBilled = filtered.reduce((s,r) => s + r.total_expected, 0)
  const totPaid   = filtered.reduce((s,r) => s + r.total_paid, 0)
  const totBal    = filtered.reduce((s,r) => s + r.balance, 0)


  const handlePrint = async () => {
    if (!rows.length) return
    setPrinting(true)
    try {
      const className = classes.find(c => String(c.id) === String(selClass))?.name || ''
      const termName  = terms.find(t => String(t.id) === String(selTerm))?.name || ''
      const displayed = filter === 'all' ? rows : rows.filter(r => r.status === filter)
      const tableRows = displayed.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:5px 10px">${r.reg_number}</td>
        <td style="padding:5px 10px">${r.last_name}, ${r.first_name}</td>
        <td style="text-align:right;padding:5px 10px">${'₦'}${Number(r.billed||0).toLocaleString('en-NG',{minimumFractionDigits:2})}</td>
        <td style="text-align:right;padding:5px 10px;color:#059669">${'₦'}${Number(r.paid||0).toLocaleString('en-NG',{minimumFractionDigits:2})}</td>
        <td style="text-align:right;padding:5px 10px;color:${Number(r.balance)>0?'#dc2626':'#059669'}">${'₦'}${Number(r.balance||0).toLocaleString('en-NG',{minimumFractionDigits:2})}</td>
        <td style="text-align:center;padding:5px 10px;text-transform:uppercase;font-size:9pt">${r.status}</td>
      </tr>`).join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">Class Fee Status</h1>
          <p style="margin:4px 0 0;font-size:11pt">${className} — ${termName}${filter !== 'all' ? ' — '+filter.toUpperCase() : ''}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:7px 10px">Reg #</th>
            <th style="text-align:left;padding:7px 10px">Name</th>
            <th style="text-align:right;padding:7px 10px">Billed</th>
            <th style="text-align:right;padding:7px 10px">Paid</th>
            <th style="text-align:right;padding:7px 10px">Balance</th>
            <th style="text-align:center;padding:7px 10px">Status</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="margin-top:10px;font-size:9pt;color:#6b7280">${displayed.length} student(s)</p>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error('Print failed: ' + e.message) }
    finally { setPrinting(false) }
  }

  return (
    <div>
      <PageHeader title="Class Fee Status" subtitle="See every student's payment status for a class and term"
        actions={rows.length > 0 && <button className="btn-secondary btn btn-sm" onClick={exportData}><Download size={14}/> Export</button>}
      />

      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-32">
          <label className="form-label">Session</label>
          <select className="form-select" value={selSess} onChange={e => setSelSess(e.target.value)}>
            <option value="">— Session —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-32">
          <label className="form-label">Term</label>
          <select className="form-select" value={selTerm} onChange={e => setSelTerm(e.target.value)}>
            <option value="">— Term —</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-32">
          <label className="form-label">Class</label>
          <select className="form-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
            <option value="">— Class —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn-primary btn" onClick={load} disabled={loading || !selClass || !selTerm}>
          {loading ? <><Loader size={15} className="animate-spin"/> Loading…</> : <><Users size={15}/> Load</>}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Students', value: rows.length },
              { label: 'Fully Paid', value: rows.filter(r=>r.payment_status==='paid').length, color: 'text-emerald-700' },
              { label: 'Partial',   value: rows.filter(r=>r.payment_status==='partial').length, color: 'text-amber-700' },
              { label: 'Unpaid',    value: rows.filter(r=>r.payment_status==='unpaid').length, color: 'text-red-700' },
            ].map(m => (
              <div key={m.label} className="card py-3 px-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{m.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${m.color || 'text-gray-900'}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            {['all','paid','partial','unpaid'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`btn btn-sm capitalize ${filter === f ? 'btn-primary' : 'btn-secondary'}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-700">{className} — {filtered.length} students</h3>
            </div>
            <table className="data-table">
              <thead><tr>
                <th>Student</th><th>Reg No</th><th className="text-right">Expected</th>
                <th className="text-right">Paid</th><th className="text-right">Balance</th>
                <th className="text-center">Rate</th><th>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.last_name} {r.first_name}</td>
                    <td className="font-mono text-xs">{r.reg_number}</td>
                    <td className="text-right">{fmt(r.total_expected)}</td>
                    <td className="text-right text-emerald-700 font-semibold">{fmt(r.total_paid)}</td>
                    <td className={`text-right font-bold ${r.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(r.balance)}</td>
                    <td className="text-center">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${r.pct>=80?'bg-emerald-500':r.pct>=50?'bg-amber-400':'bg-red-500'}`} style={{width:`${Math.min(r.pct,100)}%`}}/>
                        </div>
                        <span className="text-xs font-medium w-8">{r.pct}%</span>
                      </div>
                    </td>
                    <td><span className={`badge text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[r.payment_status]}`}>{r.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td colSpan={2} className="px-4 py-2">TOTALS</td>
                  <td className="text-right px-4 py-2">{fmt(totBilled)}</td>
                  <td className="text-right px-4 py-2 text-emerald-700">{fmt(totPaid)}</td>
                  <td className={`text-right px-4 py-2 ${totBal>0?'text-red-700':'text-emerald-700'}`}>{fmt(totBal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
