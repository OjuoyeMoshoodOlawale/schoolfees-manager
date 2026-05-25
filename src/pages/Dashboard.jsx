import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, AlertCircle, DollarSign,
  GraduationCap, ArrowRight, Clock, CheckCircle2,
  Receipt, AlertTriangle, BarChart2
} from 'lucide-react'
import { Spinner } from '../components/ui'

const fmt = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
const fmtD = d => d ? new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short' }) : '—'

function MetricCard({ label, value, sub, icon: Icon, color = 'blue', onClick }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-700' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-600',     val: 'text-red-700' },
    amber:  { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700' },
    purple: { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`card-sm flex items-start gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}>
      <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className={`text-2xl font-semibold mt-0.5 ${c.val}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function CollectionBar({ label, paid, billed, pct }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-14 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-9 text-right flex-shrink-0">{pct}%</span>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData]     = useState(null)
  const [setup, setSetup]   = useState({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      try {
        const [dash, students, classes] = await Promise.all([
          window.api.getDashboardData(),
          window.api.listStudents({}),
          window.api.listClasses(),
        ])
        setData(dash)
        setSetup({
          hasStudents: students.length > 0,
          hasClasses:  classes.filter(c => c.is_active).length > 0,
          classes:     classes.filter(c => c.is_active).length,
        })
      } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <Spinner />

  const hasTerm = !!data?.term

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {hasTerm ? `${data.term.session_name} · ${data.term.name}` : 'No active term — go to Sessions & Terms to set one'}
          </p>
        </div>
        {!hasTerm && (
          <button className="btn-primary btn btn-sm" onClick={() => navigate('/sessions')}>
            Set Active Term <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* No term warning */}
      {!hasTerm && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No active term set</p>
            <p className="text-xs text-amber-700 mt-0.5">Create a session and set the current term before managing fees and payments.</p>
          </div>
        </div>
      )}

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Collected"  value={hasTerm ? fmt(data.totalPaid)     : '₦0'}   sub="this term"              icon={DollarSign}   color="green"  onClick={() => navigate('/payments')} />
        <MetricCard label="Outstanding"      value={hasTerm ? fmt(data.balance)       : '₦0'}   sub={`${data?.debtorCount || 0} debtors`} icon={AlertTriangle} color="red" onClick={() => navigate('/debtors')} />
        <MetricCard label="Active Students"  value={hasTerm ? data.totalStudents      : 0}       sub="enrolled this term"    icon={Users}        color="blue"   onClick={() => navigate('/students')} />
        <MetricCard label="Collection Rate"  value={hasTerm ? `${data.collectionPct}%` : '0%'}  sub={`of ${fmt(data?.totalBilled || 0)} billed`} icon={TrendingUp} color={data?.collectionPct >= 70 ? 'green' : 'amber'} />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Collection by class */}
        {hasTerm && data.classStats?.length > 0 && (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Collection by Class</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/reports/account')}>
                Full report →
              </button>
            </div>
            <div className="space-y-2.5">
              {data.classStats.map(c => (
                <CollectionBar key={c.class_name} label={c.class_name} paid={c.paid} billed={c.billed} pct={c.pct} />
              ))}
            </div>
          </div>
        )}

        {/* Recent payments */}
        {hasTerm && data.recentPayments?.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Recent Payments</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/payments')}>
                View all →
              </button>
            </div>
            <div className="space-y-2">
              {data.recentPayments.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700 flex-shrink-0">
                    {p.first_name?.[0]}{p.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.last_name} {p.first_name}</p>
                    <p className="text-xs text-gray-400">{p.class_name || '—'} · {fmtD(p.payment_date)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{fmt(p.amount_paid)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Actions</h2>
          <div className="space-y-1.5">
            {[
              { label: 'Post a payment',          path: '/payments/new',  icon: Receipt,      color: 'text-emerald-600 bg-emerald-50' },
              { label: 'View debtors',             path: '/debtors',       icon: AlertTriangle,color: 'text-red-600 bg-red-50' },
              { label: 'Generate bills',           path: '/billing/generate', icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
              { label: 'Register student',         path: '/students/new',  icon: Users,        color: 'text-purple-600 bg-purple-50' },
              { label: 'Account report',           path: '/reports/account', icon: BarChart2,  color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Sessions & terms',         path: '/sessions',      icon: Clock,        color: 'text-gray-600 bg-gray-100' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}>
                  <a.icon size={14} />
                </span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{a.label}</span>
                <ArrowRight size={12} className="ml-auto text-gray-300 group-hover:text-gray-500" />
              </button>
            ))}
          </div>
        </div>

        {/* Getting started (shown when no data yet) */}
        {(!hasTerm || !setup.hasStudents) && (
          <div className="card lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Getting Started</h2>
            <p className="text-xs text-gray-400 mb-4">Complete these steps to set up your school</p>
            <div className="space-y-2.5">
              {[
                { label: 'Configure school name, address and logo',  path: '/settings',         done: false },
                { label: 'Create the current academic session',      path: '/sessions',          done: hasTerm },
                { label: 'Set the active session and term',          path: '/sessions',          done: hasTerm },
                { label: 'Add your classes (JSS1, SS1 etc.)',        path: '/classes',           done: setup.hasClasses },
                { label: 'Register students',                         path: '/students/new',      done: setup.hasStudents },
                { label: 'Configure fee items',                       path: '/fees/items',        done: false, phase: 2 },
                { label: 'Set bill config per class and term',        path: '/fees/config',       done: false, phase: 2 },
                { label: 'Generate bills for the current term',       path: '/billing/generate',  done: false, phase: 3 },
                { label: 'Post first payment',                        path: '/payments/new',      done: false, phase: 4 },
              ].map((step, i) => (
                <div key={i}
                  onClick={() => !step.phase && navigate(step.path)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors
                    ${step.done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}
                    ${!step.phase ? 'cursor-pointer hover:border-blue-300' : 'opacity-50 cursor-default'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold
                    ${step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm flex-1 ${step.done ? 'text-emerald-800 line-through' : 'text-gray-700'}`}>
                    {step.label}
                  </span>
                  {step.phase && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Phase {step.phase}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
