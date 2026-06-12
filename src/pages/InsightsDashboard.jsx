// src/pages/InsightsDashboard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS — the analytical view of the school's fee position.
// Every visual element is INTERACTIVE: click a day on the trend, a slice of the
// method donut, a class bar, a debt bucket, a segment, or a cashier, and a
// drill-down panel slides in showing the exact records behind that number —
// with one-click jumps to the student ledger or payments screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  X, TrendingUp, Wallet, AlertTriangle, Users, CalendarDays,
  MousePointerClick, ChevronRight, Receipt, RotateCcw, BadgePercent,
} from 'lucide-react'
import { Spinner } from '../components/ui'

const METHOD_COLORS = { cash: '#10b981', transfer: '#3b82f6', pos: '#8b5cf6', cheque: '#94a3b8' }
const PIE_FALLBACK  = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6']

// ── Small building blocks ─────────────────────────────────────────────────────
function Kpi({ label, value, sub, icon: Icon, tone = 'blue', onClick }) {
  const tones = {
    blue:    'bg-blue-50 text-blue-600',
    green:   'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-500',
    amber:   'bg-amber-50 text-amber-600',
    violet:  'bg-violet-50 text-violet-600',
  }
  return (
    <div
      className={`card flex items-center gap-3 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p>
        <p className="text-lg font-bold text-gray-800 leading-tight truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function PanelRowPayment({ r, fmt, navigate }) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 text-left transition"
      onClick={() => navigate(`/billing/student/${r.id || ''}`)}
      title="Open student bill"
    >
      <Receipt size={14} className="text-gray-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate">{r.last_name} {r.first_name}</p>
        <p className="text-[11px] text-gray-400 truncate">
          {r.receipt_number} · {r.payment_method?.toUpperCase() || ''} {r.payment_date ? `· ${r.payment_date}` : ''} {r.posted_by ? `· by ${r.posted_by}` : ''}
        </p>
      </div>
      <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{fmt(r.amount_paid)}</span>
    </button>
  )
}

function PanelRowStudent({ r, fmt, navigate }) {
  const bal = r.balance ?? (r.expected - r.paid)
  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 text-left transition"
      onClick={() => navigate(`/billing/student/${r.id}`)}
      title="Open student bill"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate">{r.last_name} {r.first_name}</p>
        <p className="text-[11px] text-gray-400 truncate">{r.reg_number}{r.class_name ? ` · ${r.class_name}` : ''}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${bal > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
          {bal > 0 ? fmt(bal) : 'Paid ✓'}
        </p>
        <p className="text-[10px] text-gray-400">of {fmt(r.expected)}</p>
      </div>
      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
    </button>
  )
}

// ── Drill-down slide-over panel ───────────────────────────────────────────────
function DrillPanel({ drill, fmt, navigate, onClose }) {
  const [rows, setRows]       = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!drill) return
    setLoading(true); setRows(null)
    window.api.getInsightsDrill({ type: drill.type, key: drill.key })
      .then(r => setRows(r.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [drill])

  if (!drill) return null
  const isPaymentRows = ['day', 'method', 'cashier'].includes(drill.type)
  const total = (rows || []).reduce((s, r) => s + (isPaymentRows ? Number(r.amount_paid || 0) : Math.max((r.balance ?? r.expected - r.paid), 0)), 0)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-[slideIn_.18s_ease-out]">
        <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity:.4 } to { transform:none; opacity:1 } }`}</style>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-blue-500 font-bold flex items-center gap-1">
              <MousePointerClick size={12} /> Drill-down
            </p>
            <h3 className="font-bold text-gray-800 truncate">{drill.label}</h3>
            {rows && (
              <p className="text-xs text-gray-400 mt-0.5">
                {rows.length} record{rows.length !== 1 ? 's' : ''} · {isPaymentRows ? 'total collected' : 'total outstanding'} <span className="font-semibold text-gray-600">{fmt(total)}</span>
              </p>
            )}
          </div>
          <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && <div className="py-10"><Spinner /></div>}
          {rows && rows.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">No records behind this point.</p>
          )}
          {rows && rows.map((r, i) =>
            isPaymentRows
              ? <PanelRowPayment key={i} r={r} fmt={fmt} navigate={navigate} />
              : <PanelRowStudent key={i} r={r} fmt={fmt} navigate={navigate} />
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400">
          Click any row to open the student's bill page.
        </div>
      </div>
    </>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function InsightsDashboard({ fmt }) {
  const navigate = useNavigate()
  const [data,  setData]  = useState(null)
  const [load,  setLoad]  = useState(true)
  const [drill, setDrill] = useState(null) // { type, key, label }

  useEffect(() => {
    window.api.getInsights()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoad(false))
  }, [])

  // Fill gaps in the daily trend so the area chart is continuous
  const trend = useMemo(() => {
    if (!data?.dailyTrend) return []
    const map = new Map(data.dailyTrend.map(d => [d.day, d]))
    const out = []
    for (let i = 59; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const row = map.get(key)
      out.push({
        day: key,
        label: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        total: row?.total || 0,
        n: row?.n || 0,
      })
    }
    return out
  }, [data])

  if (load) return <div className="py-16"><Spinner /></div>
  if (!data) return (
    <div className="card text-center py-12 text-gray-400">
      No active term — set a current term in Sessions &amp; Terms to see insights.
    </div>
  )

  const k = data.kpis
  const bucketDefs = [
    { key: 'paid_full', label: 'Fully paid',   color: '#10b981', clickable: false },
    { key: 'under_10k', label: 'Owe < ₦10k',   color: '#a3e635', clickable: true },
    { key: 'k10_50',    label: '₦10k – ₦50k',  color: '#f59e0b', clickable: true },
    { key: 'k50_100',   label: '₦50k – ₦100k', color: '#f97316', clickable: true },
    { key: 'over_100k', label: 'Over ₦100k',   color: '#ef4444', clickable: true },
  ]
  const bucketMax = Math.max(...bucketDefs.map(b => data.debtBuckets[b.key] || 0), 1)

  return (
    <div className="space-y-4">
      {/* Hint banner */}
      <div className="flex items-center gap-2 text-[11.5px] text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2">
        <MousePointerClick size={13} className="flex-shrink-0" />
        Everything here is clickable — tap a day, a slice, a bar, a bucket or a cashier to see the exact records behind the number.
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Collected today" value={fmt(k.todayPaid)}
          sub={`week ${fmt(k.weekPaid)} · month ${fmt(k.monthPaid)}`}
          icon={CalendarDays} tone="green"
          onClick={() => setDrill({ type: 'day', key: new Date().toISOString().slice(0, 10), label: "Today's payments" })} />
        <Kpi label="Collected this term" value={fmt(k.totalPaid)}
          sub={`of ${fmt(k.expectedTotal)} expected`} icon={Wallet} tone="blue"
          onClick={() => navigate('/payments')} />
        <Kpi label="Outstanding" value={fmt(k.balance)}
          sub={`${k.debtorCount} student${k.debtorCount !== 1 ? 's' : ''} owing`} icon={AlertTriangle} tone="red"
          onClick={() => navigate('/debtors')} />
        <Kpi label="Collection rate" value={`${k.collectionPct}%`}
          sub={`${k.totalStudents} active students`} icon={TrendingUp}
          tone={k.collectionPct >= 70 ? 'green' : k.collectionPct >= 40 ? 'amber' : 'red'} />
        <Kpi label="Reversals / Discounts" value={`${k.reversals.n} / ${k.discounts.n}`}
          sub={`${fmt(k.reversals.total)} reversed · ${fmt(k.discounts.total)} waived`}
          icon={RotateCcw} tone="violet" />
      </div>

      {/* Trend + Method mix */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700">Daily collections — last 60 days</h3>
            <span className="text-[11px] text-gray-400">click a point for that day's receipts</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={trend}
              onClick={(e) => {
                const p = e?.activePayload?.[0]?.payload
                if (p && p.total > 0) setDrill({ type: 'day', key: p.day, label: `Payments on ${p.label}` })
              }}>
              <defs>
                <linearGradient id="gFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#3b82f6" stopOpacity={0.28}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={9} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1e6 ? (v/1e6)+'m' : v >= 1e3 ? (v/1e3)+'k' : v} tickLine={false} axisLine={false} width={42} />
              <Tooltip formatter={(v, n) => n === 'total' ? [fmt(v), 'Collected'] : [v, 'Receipts']}
                labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2}
                fill="url(#gFill)" activeDot={{ r: 5, cursor: 'pointer' }} style={{ cursor: 'pointer' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700">Payment methods</h3>
            <span className="text-[11px] text-gray-400">click a slice</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.methodMix} dataKey="total" nameKey="method"
                innerRadius={48} outerRadius={72} paddingAngle={3} style={{ cursor: 'pointer' }}
                onClick={(slice) => slice?.method && setDrill({ type: 'method', key: slice.method, label: `${slice.method.toUpperCase()} payments` })}>
                {data.methodMix.map((m, i) => (
                  <Cell key={m.method} fill={METHOD_COLORS[m.method] || PIE_FALLBACK[i % PIE_FALLBACK.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {data.methodMix.map((m, i) => (
              <button key={m.method}
                className="w-full flex items-center gap-2 text-xs px-2 py-1 rounded-lg hover:bg-gray-50"
                onClick={() => setDrill({ type: 'method', key: m.method, label: `${m.method.toUpperCase()} payments` })}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: METHOD_COLORS[m.method] || PIE_FALLBACK[i % PIE_FALLBACK.length] }} />
                <span className="flex-1 text-left text-gray-600 uppercase font-medium">{m.method}</span>
                <span className="text-gray-400">{m.n}×</span>
                <span className="font-semibold text-gray-700">{fmt(m.total)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Class collection + segments */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700">Collection by class — billed vs collected</h3>
            <span className="text-[11px] text-gray-400">click a bar to see every student in that class</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.classCollection} barGap={3}
              onClick={(e) => {
                const p = e?.activePayload?.[0]?.payload
                if (p) setDrill({ type: 'class', key: p.class_id, label: `${p.class_name} — fee status` })
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="class_name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1e6 ? (v/1e6)+'m' : v >= 1e3 ? (v/1e3)+'k' : v} tickLine={false} axisLine={false} width={42} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="billed" name="Billed"    fill="#cbd5e1" radius={[4,4,0,0]} style={{ cursor: 'pointer' }} />
              <Bar dataKey="paid"   name="Collected" fill="#3b82f6" radius={[4,4,0,0]} style={{ cursor: 'pointer' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Who pays best?</h3>
          <div className="space-y-3">
            {data.segments.map(seg => (
              <button key={seg.label} className="w-full text-left group"
                onClick={() => setDrill({ type: 'segment', key: seg.label, label: `${seg.label} — fee status` })}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600 group-hover:text-blue-600 transition">{seg.label} <span className="text-gray-300">· {seg.students}</span></span>
                  <span className="font-bold text-gray-700">{seg.pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${seg.pct >= 70 ? 'bg-emerald-500' : seg.pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(seg.pct, 100)}%` }} />
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mt-5 mb-2">Cashier performance</h3>
          <div className="space-y-1">
            {data.cashierStats.map(cs => (
              <button key={cs.cashier}
                className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50"
                onClick={() => setDrill({ type: 'cashier', key: cs.cashier, label: `Posted by ${cs.cashier}` })}>
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px] uppercase flex-shrink-0">
                  {(cs.cashier || '?').slice(0, 2)}
                </span>
                <span className="flex-1 text-left text-gray-600 font-medium truncate">{cs.cashier}</span>
                <span className="text-gray-400">{cs.n}×</span>
                <span className="font-semibold text-gray-700">{fmt(cs.total)}</span>
              </button>
            ))}
            {!data.cashierStats.length && <p className="text-xs text-gray-300 px-2">No payments yet this term.</p>}
          </div>
        </div>
      </div>

      {/* Debt distribution + top debtors */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">Debt distribution</h3>
            <span className="text-[11px] text-gray-400">click a band</span>
          </div>
          <div className="space-y-2.5">
            {bucketDefs.map(b => {
              const n = data.debtBuckets[b.key] || 0
              return (
                <button key={b.key} disabled={!b.clickable || n === 0}
                  className={`w-full text-left ${b.clickable && n > 0 ? 'cursor-pointer group' : 'cursor-default'}`}
                  onClick={() => b.clickable && n > 0 && setDrill({ type: 'bucket', key: b.key, label: `Students owing ${b.label.replace('Owe ', '')}` })}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-600 group-hover:text-blue-600 transition">{b.label}</span>
                    <span className="font-bold text-gray-700">{n}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(n / bucketMax) * 100}%`, background: b.color }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700">Top outstanding balances</h3>
            <button className="text-[11px] text-blue-500 hover:underline" onClick={() => navigate('/debtors')}>
              full debtors report →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {data.topDebtors.map((d, i) => (
              <button key={d.id}
                className="w-full flex items-center gap-3 py-2 px-1 hover:bg-gray-50 rounded-lg transition text-left"
                onClick={() => navigate(`/billing/student/${d.id}`)}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i < 3 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{d.last_name} {d.first_name}</p>
                  <p className="text-[11px] text-gray-400">{d.reg_number} · {d.class_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-red-500">{fmt(d.balance)}</p>
                  <p className="text-[10px] text-gray-400">paid {fmt(d.paid)} of {fmt(d.expected)}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              </button>
            ))}
            {!data.topDebtors.length && (
              <p className="text-center text-sm text-emerald-500 py-6 font-medium">🎉 No outstanding balances — everyone has paid!</p>
            )}
          </div>
        </div>
      </div>

      <DrillPanel drill={drill} fmt={fmt} navigate={navigate} onClose={() => setDrill(null)} />
    </div>
  )
}
