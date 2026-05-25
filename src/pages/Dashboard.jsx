import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, AlertTriangle, DollarSign,
  ArrowRight, CheckCircle2, Receipt, BarChart2,
  Clock, GraduationCap, BookOpen, Zap
} from 'lucide-react'
import { Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'

function MetricCard({ label, value, sub, icon: Icon, color = 'blue', onClick }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-700',    border: 'border-blue-100' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700', border: 'border-emerald-100' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-600',     val: 'text-red-700',     border: 'border-red-100' },
    amber:  { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700',   border: 'border-amber-100' },
    purple: { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700',  border: 'border-purple-100' },
  }
  const c = colors[color] || colors.blue
  return (
    <div
      className={`bg-white rounded-xl p-4 border ${c.border} flex items-start gap-4
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${c.val}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function CollectionBar({ label, paid, billed, pct }) {
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3 group">
      <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-10 text-right flex-shrink-0">{pct}%</span>
    </div>
  )
}

function RecentPaymentRow({ payment, fmt }) {
  const initials = `${payment.first_name?.[0] || ''}${payment.last_name?.[0] || ''}`.toUpperCase()
  const methodColors = { cash: 'bg-emerald-100 text-emerald-700', transfer: 'bg-blue-100 text-blue-700', pos: 'bg-purple-100 text-purple-700', cheque: 'bg-gray-100 text-gray-600' }
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{payment.last_name} {payment.first_name}</p>
        <p className="text-xs text-gray-400">{payment.class_name || '—'}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-emerald-600">{fmt(payment.amount_paid)}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${methodColors[payment.payment_method] || 'bg-gray-100 text-gray-600'}`}>
          {payment.payment_method}
        </span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData]       = useState(null)
  const [setup, setSetup]     = useState({})
  const [loading, setLoading] = useState(true)
  const { fmt, activation }   = useAuth()
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
          students:    students.length,
        })
      } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <Spinner />

  const hasTerm   = !!data?.term
  const hasData   = hasTerm && (data.totalBilled > 0 || data.totalStudents > 0)
  const isDemo    = activation?.tier === 'demo'
  const maxStudents = activation?.max_students || 5

  return (
    <div>
      {/* Header */}
      <div className="page-header mb-5">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {hasTerm
              ? `${data.term.session_name} · ${data.term.name}`
              : 'No active term — set one in Sessions & Terms'}
          </p>
        </div>
        <div className="flex gap-2">
          {isDemo && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle size={12} />
              Demo — {setup.students || 0}/{maxStudents} students
            </div>
          )}
          {!hasTerm && (
            <button className="btn-primary btn btn-sm" onClick={() => navigate('/sessions')}>
              Set Active Term <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Collected"
          value={hasTerm ? fmt(data.totalPaid) : fmt(0)}
          sub="this term"
          icon={DollarSign} color="green"
          onClick={() => navigate('/payments')}
        />
        <MetricCard
          label="Outstanding"
          value={hasTerm ? fmt(data.balance) : fmt(0)}
          sub={hasTerm ? `${data.debtorCount} debtor${data.debtorCount !== 1 ? 's' : ''}` : 'no active term'}
          icon={AlertTriangle} color="red"
          onClick={() => navigate('/debtors')}
        />
        <MetricCard
          label="Active Students"
          value={hasTerm ? data.totalStudents : setup.students || 0}
          sub={hasTerm ? 'enrolled this term' : 'total registered'}
          icon={Users} color="blue"
          onClick={() => navigate('/students')}
        />
        <MetricCard
          label="Collection Rate"
          value={hasTerm ? `${data.collectionPct}%` : '0%'}
          sub={hasTerm ? `of ${fmt(data.totalBilled)} billed` : 'no bills yet'}
          icon={TrendingUp}
          color={!hasTerm ? 'blue' : data.collectionPct >= 70 ? 'green' : data.collectionPct >= 40 ? 'amber' : 'red'}
        />
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Collection by class — shown when there's data */}
        {hasData && data.classStats?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Collection by Class</h2>
                <p className="text-xs text-gray-400 mt-0.5">% of billed amount collected</p>
              </div>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/reports/account')}>
                Full report →
              </button>
            </div>
            <div className="space-y-3">
              {data.classStats.map(c => (
                <CollectionBar key={c.class_name} label={c.class_name}
                  paid={c.paid} billed={c.billed} pct={c.pct} />
              ))}
            </div>

            {/* Summary totals */}
            <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100">
              {[
                { label: 'Total Billed',    value: fmt(data.totalBilled),  color: 'text-gray-900' },
                { label: 'Total Collected', value: fmt(data.totalPaid),    color: 'text-emerald-600' },
                { label: 'Outstanding',     value: fmt(data.balance),      color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-base font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent payments */}
        {hasData && data.recentPayments?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Recent Payments</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/payments')}>
                View all →
              </button>
            </div>
            <div>
              {data.recentPayments.map(p => (
                <RecentPaymentRow key={p.id} payment={p} fmt={fmt} />
              ))}
            </div>
          </div>
        )}

        {/* Quick actions — always shown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="space-y-1">
            {[
              { label: 'Post a payment',        path: '/payments/new',      icon: Receipt,       color: 'text-emerald-600 bg-emerald-50' },
              { label: 'View debtors',           path: '/debtors',           icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
              { label: 'Generate bills',         path: '/billing/generate',  icon: Zap,           color: 'text-blue-600 bg-blue-50' },
              { label: 'Register student',       path: '/students/new',      icon: Users,         color: 'text-purple-600 bg-purple-50' },
              { label: 'Account report',         path: '/reports/account',   icon: BarChart2,     color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Import from Excel',      path: '/import/students',   icon: GraduationCap, color: 'text-teal-600 bg-teal-50' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}>
                  <a.icon size={14} />
                </span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">{a.label}</span>
                <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500" />
              </button>
            ))}
          </div>
        </div>

        {/* Getting started — shown when incomplete */}
        {(!hasTerm || !setup.hasStudents) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Getting Started</h2>
            <p className="text-xs text-gray-400 mb-4">Complete these steps to set up your school</p>
            <div className="space-y-2">
              {[
                { label: 'Configure school name, address and logo',   path: '/settings',        done: false },
                { label: 'Create the current academic session',        path: '/sessions',        done: hasTerm },
                { label: 'Set the active session and term',            path: '/sessions',        done: hasTerm },
                { label: 'Add your classes (JSS1–SS3)',                path: '/classes',         done: setup.hasClasses },
                { label: 'Register or import students',                path: '/students/new',    done: setup.hasStudents },
                { label: 'Configure fee items',                        path: '/fees/items',      done: false, phase: 2 },
                { label: 'Set bill config per class and term',         path: '/fees/config',     done: false, phase: 2 },
                { label: 'Generate bills for current term',            path: '/billing/generate',done: false, phase: 3 },
                { label: 'Post first payment',                         path: '/payments/new',    done: false, phase: 4 },
              ].map((step, i) => (
                <div key={i}
                  onClick={() => !step.phase && navigate(step.path)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors
                    ${step.done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}
                    ${!step.phase ? 'cursor-pointer hover:border-blue-300' : 'opacity-50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm flex-1 ${step.done ? 'text-emerald-700 line-through' : 'text-gray-700'}`}>
                    {step.label}
                  </span>
                  {step.phase && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">
                      Phase {step.phase}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
