import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import { Spinner } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'
import SystemErrorsPage from './pages/settings/SystemErrorsPage'
import HelpPage from './pages/HelpPage'
import ImportDataPage from './pages/settings/ImportDataPage'

// Auth screens
import ActivationScreen from './pages/auth/ActivationScreen'
import LoginScreen      from './pages/auth/LoginScreen'
import SetupWizard      from './pages/auth/SetupWizard'
import { WebAutomateMark } from './components/WebAutomateMark'

// Main pages
import Dashboard          from './pages/Dashboard'
import SessionsPage       from './pages/sessions/SessionsPage'
import ClassesPage        from './pages/classes/ClassesPage'
import StudentsPage       from './pages/students/StudentsPage'
import StudentForm        from './pages/students/StudentForm'
import PromotePage        from './pages/students/PromotePage'
import SettingsPage       from './pages/settings/SettingsPage'
import DevSettingsPage    from './pages/settings/DevSettingsPage'
import BackupPage         from './pages/BackupPage'
import FeeItemsPage       from './pages/fees/FeeItemsPage'
import BillConfigPage     from './pages/fees/BillConfigPage'
import BillPreviewPage    from './pages/fees/BillPreviewPage'
import CopyConfigPage     from './pages/fees/CopyConfigPage'
import GenerateBillsPage  from './pages/billing/GenerateBillsPage'
import StudentBillPage    from './pages/billing/StudentBillPage'
import FeeStatementPage   from './pages/billing/FeeStatementPage'
import CarryoverPage      from './pages/billing/CarryoverPage'
import ClassBillPrintPage from './pages/billing/ClassBillPrintPage'
import PostPaymentPage    from './pages/payments/PostPaymentPage'
import PaymentsPage       from './pages/payments/PaymentsPage'
import DebtorsPage        from './pages/payments/DebtorsPage'
import AccountReportPage   from './pages/reports/AccountReportPage'
import BulkSmsPage         from './pages/reports/BulkSmsPage'
import CollectionSummaryPage from './pages/reports/CollectionSummaryPage'
import ClassFeeStatusPage  from './pages/reports/ClassFeeStatusPage'
import StudentLedgerPage   from './pages/reports/StudentLedgerPage'
import TermEndReportPage   from './pages/reports/TermEndReportPage'
import PaymentAuditPage    from './pages/reports/PaymentAuditPage'
import CommunicationsLogPage from './pages/reports/CommunicationsLogPage'
import UsersPage          from './pages/users/UsersPage'
import ImportStudentsPage    from './pages/import/ImportStudentsPage'
import OpeningBalancesPage   from './pages/import/OpeningBalancesPage'

// Accounting
import AccountsPage      from './pages/accounting/AccountsPage'
import JournalPage       from './pages/accounting/JournalPage'
import InvoicesPage      from './pages/accounting/InvoicesPage'
import LedgerPage        from './pages/accounting/LedgerPage'
import TrialBalancePage  from './pages/accounting/TrialBalancePage'
import AccountStatementPage from './pages/accounting/AccountStatementPage'
import StaffPage             from './pages/payroll/StaffPage'
import SalaryGradesPage      from './pages/payroll/SalaryGradesPage'
import RunPayrollPage         from './pages/payroll/RunPayrollPage'
import PayrollDeductionsPage  from './pages/payroll/PayrollDeductionsPage'
import ExpensesPage            from './pages/expenses/ExpensesPage'
import ExpenseCategoriesPage   from './pages/expenses/ExpenseCategoriesPage'
import SuppliersPage           from './pages/expenses/SuppliersPage'
import ExpenseReportPage       from './pages/expenses/ExpenseReportPage'
import InventoryPage           from './pages/inventory/InventoryPage'
import InventoryReportPage     from './pages/inventory/InventoryReportPage'

// ─── Auth Gate ───────────────────────────────────────────────────────────────
function AuthGate() {
  const { user, login, activation, setupDone, loading, checkStatus } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center">
        <div className="text-center space-y-5">
          {/* Branded app mark */}
          <div className="w-20 h-20 mx-auto flex items-center justify-center relative">
            <WebAutomateMark size={80} className="rounded-2xl shadow-2xl" />
            {/* Spinning ring around the mark */}
            <svg viewBox="0 0 80 80" className="absolute -inset-1 w-[92px] h-[92px]">
              <circle cx="40" cy="40" r="38" stroke="#3b82f6" strokeWidth="3" strokeOpacity="0.15" fill="none"/>
              <path d="M40 2 A38 38 0 0 1 78 40" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" fill="none"
                style={{ transformOrigin: '40px 40px', animation: 'spin 1s linear infinite' }}/>
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-xl tracking-tight">SchoolFees Manager</p>
            <p className="text-slate-400 text-sm mt-1">Starting up, please wait…</p>
          </div>
        </div>

        {/* Powered-by footer */}
        <div className="absolute bottom-8 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <span>Powered by</span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <WebAutomateMark size={14} />
              webAutomate Nigeria
            </span>
          </div>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // 1. Not activated yet — show activation screen
  if (!activation?.is_active) {
    return <ActivationScreen onActivated={() => checkStatus()} />
  }

  // 2. Activated but first-time setup not done (no admin user exists)
  if (!setupDone) {
    return <SetupWizard activation={activation} onComplete={() => checkStatus()} />
  }

  // 3. Setup done but not logged in — show login
  if (!user) {
    return <LoginScreenWrapper onLogin={login} />
  }

  // 4. Fully authenticated — show main app
  return <MainApp />
}

function LoginScreenWrapper({ onLogin }) {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])
  return (
    <LoginScreen
      schoolName={settings?.school_name}
      logoPath={settings?.logo_path}
      onLogin={onLogin}
    />
  )
}

// ─── Main App (authenticated) ─────────────────────────────────────────────────
function MainApp() {
  const { accounting } = useAuth()

  // Notify when the nightly auto-backup completes
  useEffect(() => {
    if (!window.api?.onAutoBackupDone) return
    const off = window.api.onAutoBackupDone((data) => {
      if (data.ok) {
        toast.success(
          `Automatic backup completed${data.syncCopied ? ' and synced to your cloud folder' : ''}.`,
          { autoClose: 6000 }
        )
      } else {
        toast.error(`Automatic backup failed: ${data.error || 'unknown error'}`, { autoClose: 8000 })
      }
    })
    return off
  }, [])

  // Notify when an auto-sent receipt (SMS/Email) succeeds or fails after posting
  useEffect(() => {
    if (!window.api?.onReceiptAutoSent) return
    const off = window.api.onReceiptAutoSent(({ receipt_number, sms, email }) => {
      const ok = [], failed = []
      if (sms)   (sms.ok   ? ok : failed).push('SMS')
      if (email) (email.ok ? ok : failed).push('Email')
      if (ok.length && !failed.length) {
        toast.success(`${ok.join(' & ')} receipt sent for ${receipt_number}.`, { autoClose: 4000 })
      } else if (ok.length && failed.length) {
        toast.warn(`${receipt_number}: ${ok.join(' & ')} sent, but ${failed.join(' & ')} failed. You can resend from Payment History.`, { autoClose: 7000 })
      } else if (failed.length) {
        const reason = (email && !email.ok && email.error) || (sms && !sms.ok && sms.error) || 'check settings'
        toast.error(`${receipt_number}: ${failed.join(' & ')} not sent (${reason}). Resend from Payment History.`, { autoClose: 7000 })
      }
    })
    return off
  }, [])

  return (
    <ErrorBoundary>
      <Layout>
      <Routes>
        <Route path="/"                       element={<Dashboard />} />
        <Route path="/sessions"               element={<SessionsPage />} />
        <Route path="/classes"                element={<ClassesPage />} />
        <Route path="/students"               element={<StudentsPage />} />
        <Route path="/students/new"           element={<StudentForm />} />
        <Route path="/students/:id/edit"      element={<StudentForm />} />
        <Route path="/promote"                element={<PromotePage />} />
        <Route path="/import/students"          element={<ImportStudentsPage />} />
        <Route path="/import/opening-balances"  element={<OpeningBalancesPage />} />
        <Route path="/fees/items"             element={<FeeItemsPage />} />
        <Route path="/fees/config"            element={<BillConfigPage />} />
        <Route path="/fees/copy"              element={<CopyConfigPage />} />
        <Route path="/fees/preview"           element={<BillPreviewPage />} />
        <Route path="/billing/generate"       element={<GenerateBillsPage />} />
        <Route path="/billing/student/:id"          element={<StudentBillPage />} />
        <Route path="/billing/student/:id/statement" element={<FeeStatementPage />} />
        <Route path="/billing/carryover"      element={<CarryoverPage />} />
        <Route path="/billing/class-print"    element={<ClassBillPrintPage />} />
        <Route path="/payments"               element={<PaymentsPage />} />
        <Route path="/payments/new"           element={<PostPaymentPage />} />
        <Route path="/payments/receipt/:receiptId" element={<PaymentsPage />} />
        <Route path="/debtors"                element={<DebtorsPage />} />
        <Route path="/reports/account"        element={<AccountReportPage />} />
        <Route path="/reports/sms"            element={<BulkSmsPage />} />
        <Route path="/reports/collection"     element={<CollectionSummaryPage />} />
        <Route path="/reports/class-status"   element={<ClassFeeStatusPage />} />
        <Route path="/reports/student-ledger" element={<StudentLedgerPage />} />
        <Route path="/reports/term-end"       element={<TermEndReportPage />} />
        <Route path="/reports/audit"          element={<PaymentAuditPage />} />
        <Route path="/reports/comms-log"      element={<CommunicationsLogPage />} />
        <Route path="/users"                  element={<UsersPage />} />
        <Route path="/settings"               element={<SettingsPage />} />
        <Route path="/dev-settings"           element={<DevSettingsPage />} />
        <Route path="/backup"                 element={<BackupPage />} />

        {/* Accounting — only if enabled */}
        {accounting && <>
          <Route path="/accounting/accounts"      element={<AccountsPage />} />
          <Route path="/accounting/journal"        element={<JournalPage />} />
          <Route path="/accounting/invoices"       element={<InvoicesPage />} />
          <Route path="/accounting/ledger"         element={<LedgerPage />} />
          <Route path="/accounting/trial-balance"  element={<TrialBalancePage />} />
          <Route path="/accounting/statement"      element={<AccountStatementPage />} />
          <Route path="/payroll/staff"             element={<StaffPage />} />
          <Route path="/payroll/grades"            element={<SalaryGradesPage />} />
          <Route path="/payroll/run"               element={<RunPayrollPage />} />
          <Route path="/payroll/deductions"        element={<PayrollDeductionsPage />} />
          <Route path="/expenses"                  element={<ExpensesPage />} />
          <Route path="/expenses/categories"       element={<ExpenseCategoriesPage />} />
          <Route path="/expenses/suppliers"        element={<SuppliersPage />} />
          <Route path="/expenses/report"           element={<ExpenseReportPage />} />
          <Route path="/inventory"                 element={<InventoryPage />} />
          <Route path="/inventory/report"           element={<InventoryReportPage />} />
          <Route path="/system-errors"               element={<SystemErrorsPage />} />
          <Route path="/help"                        element={<HelpPage />} />
          <Route path="/import-data"                 element={<ImportDataPage />} />
        </>}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
    </ErrorBoundary>
  )
}

export default AuthGate
