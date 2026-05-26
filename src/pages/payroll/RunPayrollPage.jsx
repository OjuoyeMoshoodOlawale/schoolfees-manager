import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Play, CheckCircle, DollarSign, Printer, Trash2, Eye, Loader, Info } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { printCleanHtml } from '../../lib/utils'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const now = new Date()

export default function RunPayrollPage() {
  const { canEdit, canAdmin, user, fmt } = useAuth()
  const [runs,      setRuns]     = useState([])
  const [loading,   setLoading]  = useState(true)

  // new run form
  const [month,   setMonth]   = useState(String(now.getMonth() + 1))
  const [year,    setYear]    = useState(String(now.getFullYear()))
  const [notes,   setNotes]   = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [running,    setRunning]    = useState(false)

  // run detail modal
  const [detailRun, setDetailRun] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [printingSlip, setPrintingSlip] = useState(null)
  const [printingAll,  setPrintingAll]  = useState(false)

  const loadRuns = async () => {
    setLoading(true)
    try { setRuns(await window.api.payrollRunsList()) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadRuns() }, [])

  const doPreview = async () => {
    setPreviewing(true); setPreview(null)
    try {
      const rows = await window.api.payrollRunPreview({ month: Number(month), year: Number(year) })
      if (!rows.length) return toast.warn('No active staff found.')
      setPreview(rows)
    } catch(e) { toast.error(e.message) }
    finally { setPreviewing(false) }
  }

  const doCreate = async () => {
    if (!preview) return
    if (!confirm(`Create payroll for ${MONTHS[month-1]} ${year}? This will lock the run.`)) return
    setRunning(true)
    try {
      await window.api.payrollRunCreate({ month: Number(month), year: Number(year), notes, created_by: user?.username })
      toast.success(`Payroll for ${MONTHS[month-1]} ${year} created`)
      setPreview(null); loadRuns()
    } catch(e) { toast.error(e.message) }
    finally { setRunning(false) }
  }

  const doApprove = async (id) => {
    try {
      await window.api.payrollRunApprove({ id, approved_by: user?.username })
      toast.success('Payroll approved'); loadRuns()
      if (detailRun) { const r = await window.api.payrollRunGet(id); setDetailRun(r) }
    } catch(e) { toast.error(e.message) }
  }

  const doMarkPaid = async (id) => {
    if (!confirm('Mark all salaries as paid? This cannot be undone.')) return
    try {
      await window.api.payrollRunMarkPaid(id)
      toast.success('Payroll marked as paid'); loadRuns()
      if (detailRun) { const r = await window.api.payrollRunGet(id); setDetailRun(r) }
    } catch(e) { toast.error(e.message) }
  }

  const doDelete = async (id) => {
    if (!confirm('Delete this payroll run?')) return
    try { await window.api.payrollRunDelete(id); toast.success('Deleted'); loadRuns() }
    catch(e) { toast.error(e.message) }
  }

  const openDetail = async (id) => {
    const r = await window.api.payrollRunGet(id)
    setDetailRun(r); setDetailOpen(true)
  }

  const printSlip = async (run_id, staff_id) => {
    setPrintingSlip(staff_id)
    try {
      const html = await window.api.payrollPayslipHtml({ run_id, staff_id })
      await printCleanHtml(html)
    } catch(e) { toast.error(e.message) }
    finally { setPrintingSlip(null) }
  }

  const printSummary = async (id) => {
    setPrintingAll(true)
    try {
      const html = await window.api.payrollSummaryHtml(id)
      await printCleanHtml(html)
    } catch(e) { toast.error(e.message) }
    finally { setPrintingAll(false) }
  }

  const statusColor = s => s === 'paid' ? 'badge-green' : s === 'approved' ? 'badge-blue' : 'badge-gray'

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="space-y-6">
      <PageHeader title="Run Payroll" subtitle="Generate, approve and pay monthly salary runs" />

      {/* ── New Run Card ── */}
      {canEdit && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Generate New Payroll Run</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="form-label">Month</label>
              <select className="form-select w-36" value={month} onChange={e => { setMonth(e.target.value); setPreview(null) }}>
                {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Year</label>
              <select className="form-select w-28" value={year} onChange={e => { setYear(e.target.value); setPreview(null) }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="form-label">Notes (optional)</label>
              <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. includes promotion increment" />
            </div>
            <button className="btn btn-secondary" onClick={doPreview} disabled={previewing}>
              {previewing ? <><Loader size={14} className="animate-spin"/> Calculating…</> : <><Eye size={14}/> Preview</>}
            </button>
            {preview && (
              <button className="btn btn-primary" onClick={doCreate} disabled={running}>
                {running ? <><Loader size={14} className="animate-spin"/> Creating…</> : <><Play size={14}/> Create Run</>}
              </button>
            )}
          </div>

          {/* Preview table */}
          {preview && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Info size={14} className="text-blue-500"/>
                <p className="text-xs text-blue-600">Preview only — nothing saved yet. Click "Create Run" to lock this payroll.</p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="data-table text-xs">
                  <thead><tr>
                    <th>Staff</th><th>Dept</th>
                    <th className="text-right">Basic</th><th className="text-right">Housing</th>
                    <th className="text-right">Transport</th><th className="text-right">Gross</th>
                    <th className="text-right text-red-600">PAYE</th>
                    <th className="text-right text-red-600">Pension (8%)</th>
                    <th className="text-right text-red-600">Other Ded.</th>
                    <th className="text-right font-bold">Net Pay</th>
                  </tr></thead>
                  <tbody>
                    {preview.map(p => (
                      <tr key={p.staff_id}>
                        <td>
                          <div className="font-semibold">{p.last_name}, {p.first_name}</div>
                          <div className="text-gray-400">{p.staff_number}</div>
                        </td>
                        <td className="text-gray-500">{p.department||'—'}</td>
                        <td className="text-right">{fmt(p.basic_salary)}</td>
                        <td className="text-right">{fmt(p.housing_allowance)}</td>
                        <td className="text-right">{fmt(p.transport_allowance)}</td>
                        <td className="text-right font-semibold">{fmt(p.gross_salary)}</td>
                        <td className="text-right text-red-600">{fmt(p.paye_tax)}</td>
                        <td className="text-right text-red-600">{fmt(p.pension_employee)}</td>
                        <td className="text-right text-red-600">{fmt(p.other_deductions)}</td>
                        <td className="text-right font-bold text-emerald-700">{fmt(p.net_salary)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold border-t-2">
                      <td colSpan={5} className="px-3 py-2">TOTAL ({preview.length} staff)</td>
                      <td className="text-right px-3 py-2">{fmt(preview.reduce((s,p)=>s+p.gross_salary,0))}</td>
                      <td className="text-right px-3 py-2 text-red-600">{fmt(preview.reduce((s,p)=>s+p.paye_tax,0))}</td>
                      <td className="text-right px-3 py-2 text-red-600">{fmt(preview.reduce((s,p)=>s+p.pension_employee,0))}</td>
                      <td className="text-right px-3 py-2 text-red-600">{fmt(preview.reduce((s,p)=>s+p.other_deductions,0))}</td>
                      <td className="text-right px-3 py-2 text-emerald-700">{fmt(preview.reduce((s,p)=>s+p.net_salary,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Employer pension (10% of pensionable pay) is shown on payslips but NOT deducted from staff salaries.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Past Runs ── */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 bg-gray-50 border-b">
          <h3 className="text-sm font-semibold text-gray-700">Payroll History</h3>
        </div>
        {loading ? <div className="p-6"><Spinner/></div> : (
          <table className="data-table">
            <thead><tr>
              <th>Reference</th><th>Period</th><th className="text-center">Staff</th>
              <th className="text-right">Gross</th><th className="text-right">PAYE</th>
              <th className="text-right">Net Pay</th><th>Status</th>
              <th></th>
            </tr></thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">No payroll runs yet.</td></tr>
              )}
              {runs.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.run_reference}</td>
                  <td className="font-semibold">{MONTHS[r.month-1]} {r.year}</td>
                  <td className="text-center">{r.staff_count}</td>
                  <td className="text-right">{fmt(r.total_gross)}</td>
                  <td className="text-right text-red-600">{fmt(r.total_paye)}</td>
                  <td className="text-right font-bold text-emerald-700">{fmt(r.total_net)}</td>
                  <td><span className={`badge ${statusColor(r.status)}`}>{r.status}</span></td>
                  <td className="flex gap-1 flex-wrap">
                    <button className="btn btn-sm btn-secondary" onClick={() => openDetail(r.id)} title="View"><Eye size={12}/></button>
                    {canAdmin && r.status === 'draft' && (
                      <button className="btn btn-sm btn-secondary text-blue-600" onClick={() => doApprove(r.id)} title="Approve">
                        <CheckCircle size={12}/>
                      </button>
                    )}
                    {canAdmin && r.status === 'approved' && (
                      <button className="btn btn-sm btn-primary" onClick={() => doMarkPaid(r.id)} title="Mark Paid">
                        <DollarSign size={12}/>
                      </button>
                    )}
                    {canEdit && r.status !== 'paid' && (
                      <button className="btn btn-sm btn-secondary text-red-500" onClick={() => doDelete(r.id)} title="Delete">
                        <Trash2 size={12}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail Modal ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)}
        title={detailRun ? `${MONTHS[detailRun.month-1]} ${detailRun.year} — ${detailRun.run_reference}` : ''}
        size="xl">
        {detailRun && (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Total Gross',   fmt(detailRun.total_gross),             'text-gray-900'],
                ['Total PAYE',    fmt(detailRun.total_paye),              'text-red-700'],
                ['Total Pension', fmt(detailRun.total_pension_employee),  'text-red-700'],
                ['Total Net Pay', fmt(detailRun.total_net),               'text-emerald-700'],
              ].map(([l,v,c]) => (
                <div key={l} className="card py-3 px-4">
                  <p className="text-xs text-gray-500 uppercase">{l}</p>
                  <p className={`text-xl font-bold mt-0.5 ${c}`}>{v}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <span className={`badge ${statusColor(detailRun.status)}`}>{detailRun.status}</span>
              {detailRun.approved_by && <span className="text-xs text-gray-500">Approved by {detailRun.approved_by}</span>}
              <div className="flex-1"/>
              {canAdmin && detailRun.status === 'draft' && (
                <button className="btn btn-sm btn-secondary text-blue-600" onClick={() => doApprove(detailRun.id)}>
                  <CheckCircle size={12}/> Approve
                </button>
              )}
              {canAdmin && detailRun.status === 'approved' && (
                <button className="btn btn-sm btn-primary" onClick={() => doMarkPaid(detailRun.id)}>
                  <DollarSign size={12}/> Mark All Paid
                </button>
              )}
              <button className="btn btn-sm btn-secondary" onClick={() => printSummary(detailRun.id)} disabled={printingAll}>
                {printingAll ? <Loader size={12} className="animate-spin"/> : <Printer size={12}/>} Summary
              </button>
            </div>

            {/* Lines table */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="data-table text-xs">
                <thead><tr>
                  <th>Staff</th><th>Dept</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right text-red-600">PAYE</th>
                  <th className="text-right text-red-600">Pension</th>
                  <th className="text-right text-red-600">Other</th>
                  <th className="text-right">Net Pay</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {detailRun.lines?.map(l => (
                    <tr key={l.staff_id}>
                      <td>
                        <div className="font-semibold">{l.last_name}, {l.first_name}</div>
                        <div className="text-gray-400">{l.staff_number}</div>
                      </td>
                      <td className="text-gray-500">{l.department||'—'}</td>
                      <td className="text-right">{fmt(l.gross_salary)}</td>
                      <td className="text-right text-red-600">{fmt(l.paye_tax)}</td>
                      <td className="text-right text-red-600">{fmt(l.pension_employee)}</td>
                      <td className="text-right text-red-600">{fmt(l.other_deductions)}</td>
                      <td className="text-right font-bold text-emerald-700">{fmt(l.net_salary)}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" disabled={printingSlip === l.staff_id}
                          onClick={() => printSlip(detailRun.id, l.staff_id)}>
                          {printingSlip === l.staff_id
                            ? <Loader size={12} className="animate-spin"/>
                            : <Printer size={12}/>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400">
              Employer pension contribution: {fmt(detailRun.total_pension_employer)} — shown on payslips, not deducted from salaries.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
