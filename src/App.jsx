import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import { Spinner } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'

// Auth screens
import ActivationScreen from './pages/auth/ActivationScreen'
import LoginScreen      from './pages/auth/LoginScreen'
import SetupWizard      from './pages/auth/SetupWizard'

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <circle cx="32" cy="32" r="28" stroke="#1e40af" strokeWidth="4" strokeOpacity="0.2"/>
              <path d="M32 4 A28 28 0 0 1 60 32" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"
                className="animate-spin origin-center" style={{transformOrigin:'32px 32px',animation:'spin 1s linear infinite'}}/>
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-lg">SchoolFees Manager</p>
            <p className="text-slate-400 text-sm mt-1">Starting up, please wait…</p>
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
        </>}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
    </ErrorBoundary>
  )
}

export default AuthGate
