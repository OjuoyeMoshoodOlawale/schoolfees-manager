import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, AlertTriangle, DollarSign,
  ArrowRight, Receipt, BarChart2, Zap,
  GraduationCap, Scale, BookOpen, FileText,
  Activity, Briefcase, LayoutDashboard
} from 'lucide-react'
import { Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'

// ── Shared components ─────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, color = 'blue', onClick }) {
  const colors = {
    blue:   { bg:'bg-blue-50',    icon:'text-blue-600',    val:'text-blue-700',    border:'border-blue-100' },
    green:  { bg:'bg-emerald-50', icon:'text-emerald-600', val:'text-emerald-700', border:'border-emerald-100' },
    red:    { bg:'bg-red-50',     icon:'text-red-600',     val:'text-red-700',     border:'border-red-100' },
    amber:  { bg:'bg-amber-50',   icon:'text-amber-600',   val:'text-amber-700',   border:'border-amber-100' },
    purple: { bg:'bg-purple-50',  icon:'text-purple-600',  val:'text-purple-700',  border:'border-purple-100' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`bg-white rounded-xl p-4 border ${c.border} flex items-start gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
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
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-10 text-right flex-shrink-0">{pct}%</span>
    </div>
  )
}

function RecentPaymentRow({ payment, fmt }) {
  const initials = `${payment.first_name?.[0]||''}${payment.last_name?.[0]||''}`.toUpperCase()
  const mc = { cash:'bg-emerald-100 text-emerald-700', transfer:'bg-blue-100 text-blue-700', pos:'bg-purple-100 text-purple-700', cheque:'bg-gray-100 text-gray-600' }
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{initials}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{payment.last_name} {payment.first_name}</p>
        <p className="text-xs text-gray-400">{payment.class_name || '—'}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-emerald-600">{fmt(payment.amount_paid)}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${mc[payment.payment_method]||'bg-gray-100 text-gray-600'}`}>{payment.payment_method}</span>
      </div>
    </div>
  )
}

// ── Dashboard modes ───────────────────────────────────────────────────────────

function OperationsDashboard({ data, setup, fmt, navigate }) {
  const hasData = !!data?.term && (data.totalBilled > 0 || data.totalStudents > 0)
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Collected" value={data ? fmt(data.totalPaid) : fmt(0)} sub="this term" icon={DollarSign} color="green" onClick={() => navigate('/payments')} />
        <MetricCard label="Outstanding" value={data ? fmt(data.balance) : fmt(0)} sub={data ? `${data.debtorCount} debtor${data.debtorCount!==1?'s':''}` : 'no active term'} icon={AlertTriangle} color="red" onClick={() => navigate('/debtors')} />
        <MetricCard label="Active Students" value={data ? data.totalStudents : setup.students||0} sub={data ? 'enrolled this term' : 'total registered'} icon={Users} color="blue" onClick={() => navigate('/students')} />
        <MetricCard label="Collection Rate" value={data ? `${data.collectionPct}%` : '0%'} sub={data ? `of ${fmt(data.totalBilled)} billed` : 'no bills yet'} icon={TrendingUp} color={!data?'blue':data.collectionPct>=70?'green':data.collectionPct>=40?'amber':'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {hasData && data.classStats?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Collection by Class</h2>
                <p className="text-xs text-gray-400 mt-0.5">% of billed amount collected</p>
              </div>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/reports/account')}>Full report →</button>
            </div>
            <div className="space-y-3">
              {data.classStats.map(c => <CollectionBar key={c.class_name} label={c.class_name} paid={c.paid} billed={c.billed} pct={c.pct}/>)}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100">
              {[
                { label:'Total Billed',    value:fmt(data.totalBilled),  color:'text-gray-900' },
                { label:'Total Collected', value:fmt(data.totalPaid),    color:'text-emerald-600' },
                { label:'Outstanding',     value:fmt(data.balance),      color:'text-red-600' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-base font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasData && data.recentPayments?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Recent Payments</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/payments')}>View all →</button>
            </div>
            {data.recentPayments.map(p => <RecentPaymentRow key={p.id} payment={p} fmt={fmt}/>)}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="space-y-1">
            {[
              { label:'Post a payment',   path:'/payments/new',      icon:Receipt,       color:'text-emerald-600 bg-emerald-50' },
              { label:'View debtors',     path:'/debtors',           icon:AlertTriangle,  color:'text-red-600 bg-red-50' },
              { label:'Register student', path:'/students/new',      icon:Users,          color:'text-purple-600 bg-purple-50' },
              { label:'Account report',   path:'/reports/account',   icon:BarChart2,      color:'text-indigo-600 bg-indigo-50' },
              { label:'Term end report',  path:'/reports/term-end',  icon:FileText,       color:'text-blue-600 bg-blue-50' },
              { label:'Import students',  path:'/import/students',   icon:GraduationCap,  color:'text-teal-600 bg-teal-50' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}><a.icon size={14}/></span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">{a.label}</span>
                <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function AccountingDashboard({ data, fmt, navigate }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Term Revenue" value={data ? fmt(data.totalPaid) : fmt(0)} sub="cash received this term" icon={DollarSign} color="green" onClick={() => navigate('/reports/account')}/>
        <MetricCard label="Receivables" value={data ? fmt(data.balance) : fmt(0)} sub="outstanding fees owed" icon={Scale} color="red" onClick={() => navigate('/debtors')}/>
        <MetricCard label="Billed This Term" value={data ? fmt(data.totalBilled) : fmt(0)} sub="total invoiced" icon={FileText} color="blue"/>
        <MetricCard label="Collection Rate" value={data ? `${data.collectionPct}%` : '0%'} sub="revenue efficiency" icon={TrendingUp} color={!data?'blue':data.collectionPct>=70?'green':data.collectionPct>=40?'amber':'red'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Accounting Quick Links</h2>
          <div className="space-y-1">
            {[
              { label:'Chart of Accounts',  path:'/accounting/accounts',       icon:BookOpen,  color:'text-blue-600 bg-blue-50' },
              { label:'Journal Entries',    path:'/accounting/journal',         icon:FileText,  color:'text-indigo-600 bg-indigo-50' },
              { label:'Ledger',             path:'/accounting/ledger',          icon:BookOpen,  color:'text-purple-600 bg-purple-50' },
              { label:'Trial Balance',      path:'/accounting/trial-balance',   icon:Scale,     color:'text-emerald-600 bg-emerald-50' },
              { label:'Account Statement',  path:'/accounting/statement',       icon:BarChart2, color:'text-gray-600 bg-gray-50' },
              { label:'Invoices',           path:'/accounting/invoices',        icon:Receipt,   color:'text-amber-600 bg-amber-50' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}><a.icon size={14}/></span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">{a.label}</span>
                <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500"/>
              </button>
            ))}
          </div>
        </div>

        {data?.classStats?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Receivables by Class</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/reports/account')}>Full report →</button>
            </div>
            <div className="space-y-3">
              {data.classStats.map(c => (
                <div key={c.class_name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 w-20 flex-shrink-0">{c.class_name}</span>
                  <div className="flex-1 mx-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${c.pct>=80?'bg-emerald-500':c.pct>=50?'bg-amber-400':'bg-red-500'}`} style={{width:`${Math.min(c.pct,100)}%`}}/>
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-10 text-right">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ExecutiveDashboard({ data, fmt, navigate }) {
  const topDefaulters = data?.recentPayments ? [] : []
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Collected" value={data ? fmt(data.totalPaid) : fmt(0)} sub={`of ${data ? fmt(data.totalBilled) : fmt(0)} billed`} icon={DollarSign} color="green"/>
        <MetricCard label="Outstanding" value={data ? fmt(data.balance) : fmt(0)} sub={`${data?.debtorCount||0} students owe fees`} icon={AlertTriangle} color="red" onClick={() => navigate('/debtors')}/>
        <MetricCard label="Enrolled" value={data?.totalStudents||0} sub="active students this term" icon={Users} color="blue" onClick={() => navigate('/students')}/>
        <MetricCard label="Collection" value={data ? `${data.collectionPct}%` : '0%'} sub={data?.collectionPct>=70?'On track':data?.collectionPct>=40?'Needs attention':'Critical'} icon={Activity} color={!data?'blue':data.collectionPct>=70?'green':data.collectionPct>=40?'amber':'red'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {data?.classStats?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Class Performance</h2>
              <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate('/reports/term-end')}>Full report →</button>
            </div>
            <div className="space-y-4">
              {data.classStats.map(c => (
                <div key={c.class_name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-gray-700">{c.class_name}</span>
                    <span className={c.pct>=80?'text-emerald-600':c.pct>=50?'text-amber-600':'text-red-600'}>{fmt(c.paid)} / {fmt(c.billed)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${c.pct>=80?'bg-emerald-500':c.pct>=50?'bg-amber-400':'bg-red-500'}`} style={{width:`${Math.min(c.pct,100)}%`}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Key Reports</h2>
          <div className="space-y-1">
            {[
              { label:'Term End Report',       path:'/reports/term-end',        icon:FileText,    color:'text-blue-600 bg-blue-50' },
              { label:'Collection Summary',    path:'/reports/collection',      icon:TrendingUp,  color:'text-emerald-600 bg-emerald-50' },
              { label:'Class Fee Status',      path:'/reports/class-status',    icon:Users,       color:'text-purple-600 bg-purple-50' },
              { label:'Student Ledger',        path:'/reports/student-ledger',  icon:BookOpen,    color:'text-indigo-600 bg-indigo-50' },
              { label:'Payment Audit',         path:'/reports/audit',           icon:Shield,      color:'text-gray-600 bg-gray-50' },
              { label:'Account Report',        path:'/reports/account',         icon:BarChart2,   color:'text-amber-600 bg-amber-50' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}><a.icon size={14}/></span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">{a.label}</span>
                <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const MODES = [
  { id:'operations', label:'Operations', icon:Zap,             desc:'Daily fees & payments' },
  { id:'accounting', label:'Accounting', icon:Scale,           desc:'Ledger & journals' },
  { id:'executive',  label:'Executive',  icon:Briefcase,       desc:'Summary overview' },
]

export default function Dashboard() {
  const [data,    setData]    = useState(null)
  const [setup,   setSetup]   = useState({})
  const [loading, setLoading] = useState(true)
  const [mode,    setMode]    = useState(() => localStorage.getItem('dashboard_mode') || 'operations')
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
        setSetup({ hasStudents: students.length > 0, hasClasses: classes.filter(c=>c.is_active).length > 0, students: students.length })
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const setModeAndSave = (m) => { setMode(m); localStorage.setItem('dashboard_mode', m) }

  if (loading) return <Spinner/>

  const hasTerm = !!data?.term

  return (
    <div>
      {/* Header with mode toggle */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {hasTerm ? `${data.term.session_name} · ${data.term.name}` : 'No active term — set one in Sessions & Terms'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5 flex-shrink-0">
          {MODES.map(m => (
            <button key={m.id} onClick={() => setModeAndSave(m.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === m.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={m.desc}
            >
              <m.icon size={13}/> {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'operations' && <OperationsDashboard data={data} setup={setup} fmt={fmt} navigate={navigate}/>}
      {mode === 'accounting' && <AccountingDashboard data={data} fmt={fmt} navigate={navigate}/>}
      {mode === 'executive'  && <ExecutiveDashboard  data={data} fmt={fmt} navigate={navigate}/>}
    </div>
  )
}
