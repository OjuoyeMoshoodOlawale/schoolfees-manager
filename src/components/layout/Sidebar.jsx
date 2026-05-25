import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, UserPlus, ArrowUpCircle, Calendar,
  BookOpen, Settings, CloudUpload, ListChecks, SlidersHorizontal,
  Copy, Eye, Zap, Receipt, AlertTriangle, BarChart2, History,
  DollarSign, FileText, BookMarked, Scale, MessageSquare, Shield,
  ChevronDown, ChevronRight, FileSpreadsheet, Printer
} from 'lucide-react'

const NAV_GROUPS = [
  {
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    ]
  },
  {
    section: 'Students',
    items: [
      { to: '/students',     icon: Users,          label: 'All Students' },
      { to: '/students/new', icon: UserPlus,        label: 'Register Student' },
      { to: '/promote',      icon: ArrowUpCircle,   label: 'Promote / Change Term' },
  { to: '/import/students', icon: FileSpreadsheet, label: 'Import from Excel' },
    ]
  },
  {
    section: 'Fees & Billing',
    items: [
      { to: '/fees/items',          icon: ListChecks,        label: 'Fee Items' },
      { to: '/fees/config',         icon: SlidersHorizontal, label: 'Bill Config' },
      { to: '/fees/copy',           icon: Copy,              label: 'Copy Config' },
      { to: '/fees/preview',        icon: Eye,               label: 'Bill Preview' },
      { to: '/students',            icon: FileText,          label: 'Student Bills' },
      { to: '/billing/carryover',   icon: History,           label: 'Carry-over' },
      { to: '/billing/class-print', icon: Printer,           label: 'Class Bill Print' },
    ]
  },
  {
    section: 'Payments',
    items: [
      { to: '/payments/new', icon: Receipt,       label: 'Post Payment' },
      { to: '/payments',     icon: DollarSign,    label: 'Payment History' },
      { to: '/debtors',      icon: AlertTriangle, label: 'Debtors' },
    ]
  },
  {
    section: 'Reports',
    items: [
      { to: '/reports/account', icon: BarChart2, label: 'Account Report' },
      { to: '/reports/sms',     icon: MessageSquare, label: 'Bulk SMS' },
    ]
  },
  {
    section: 'Accounting',
    accounting: true,
    items: [
      { to: '/accounting/accounts',  icon: BookMarked, label: 'Chart of Accounts' },
      { to: '/accounting/journal',   icon: FileText,   label: 'Journal Entries' },
      { to: '/accounting/invoices',  icon: Receipt,    label: 'Invoices' },
      { to: '/accounting/ledger',    icon: BookMarked, label: 'Ledger' },
      { to: '/accounting/trial-balance',  icon: Scale,        label: 'Trial Balance' },
      { to: '/accounting/statement',    icon: FileText,     label: 'Account Statement' },
    ]
  },
  {
    section: 'Setup',
    items: [
      { to: '/sessions', icon: Calendar, label: 'Sessions & Terms' },
      { to: '/classes',  icon: BookOpen, label: 'Classes' },
      { to: '/users',    icon: Shield,   label: 'Users & Access' },
    ]
  },
]

function NavItem({ to, icon: Icon, label, exact }) {
  return (
    <NavLink to={to} end={exact}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon size={14} className="flex-shrink-0" />{label}
    </NavLink>
  )
}

function NavGroup({ section, items, accounting, accountingEnabled }) {
  const [open, setOpen] = useState(true)
  if (accounting && !accountingEnabled) return null
  return (
    <div className="mb-1">
      {section && (
        <button
          onClick={() => setOpen(o => !o)}
          className="nav-section flex items-center justify-between w-full hover:text-slate-400 transition-colors"
        >
          {section}
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      )}
      {open && items.map(item => <NavItem key={item.to} {...item} />)}
    </div>
  )
}

export default function Sidebar() {
  const [school, setSchool]           = useState('SchoolFees Manager')
  const [currentTerm, setCurrentTerm] = useState(null)
  const [logoPath, setLogoPath]       = useState('')
  const [accounting, setAccounting]   = useState(false)

  useEffect(() => {
    window.api?.getSettings().then(s => {
      if (s?.school_name) setSchool(s.school_name)
      if (s?.logo_path)   setLogoPath(s.logo_path)
      if (s?.accounting_enabled) setAccounting(!!s.accounting_enabled)
    })
    window.api?.getCurrentTerm().then(t => setCurrentTerm(t))
  }, [])

  return (
    <aside className="sidebar flex flex-col h-screen w-56 flex-shrink-0 bg-slate-900">
      {/* ── Logo / School Header ── */}
      <div className="px-3 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* School logo or default icon */}
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
            {logoPath ? (
              <img
                src={`file://${logoPath}`}
                alt="School logo"
                className="w-full h-full object-cover"
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
              />
            ) : null}
            <div className={`w-full h-full flex items-center justify-center ${logoPath ? 'hidden' : 'flex'}`}>
              {/* Custom school icon — two books stacked */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">{school}</p>
            {currentTerm
              ? <p className="text-xs text-slate-400 mt-0.5 truncate">{currentTerm.session_name} · {currentTerm.name}</p>
              : <p className="text-xs text-amber-400 mt-0.5">No active term</p>}
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto min-h-0 space-y-0.5">
        {NAV_GROUPS.map((group, i) => (
          <NavGroup
            key={i}
            section={group.section}
            items={group.items}
            accounting={group.accounting}
            accountingEnabled={accounting}
          />
        ))}
      </nav>

      {/* ── Bottom nav ── */}
      <div className="px-2 py-3 border-t border-slate-800 flex-shrink-0 space-y-0.5">
        <NavItem to="/backup"   icon={CloudUpload} label="Backup & Restore" />
        <NavItem to="/settings" icon={Settings}    label="Settings" />
      </div>
    </aside>
  )
}
