import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import SessionsPage from './pages/sessions/SessionsPage'
import ClassesPage from './pages/classes/ClassesPage'
import StudentsPage from './pages/students/StudentsPage'
import StudentForm from './pages/students/StudentForm'
import PromotePage from './pages/students/PromotePage'
import SettingsPage from './pages/settings/SettingsPage'
import BackupPage from './pages/BackupPage'
import FeeItemsPage from './pages/fees/FeeItemsPage'
import BillConfigPage from './pages/fees/BillConfigPage'
import BillPreviewPage from './pages/fees/BillPreviewPage'
import CopyConfigPage from './pages/fees/CopyConfigPage'
import GenerateBillsPage from './pages/billing/GenerateBillsPage'
import StudentBillPage from './pages/billing/StudentBillPage'
import CarryoverPage from './pages/billing/CarryoverPage'
import PostPaymentPage from './pages/payments/PostPaymentPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import DebtorsPage from './pages/payments/DebtorsPage'
import AccountReportPage from './pages/reports/AccountReportPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentForm />} />
        <Route path="/students/:id/edit" element={<StudentForm />} />
        <Route path="/promote" element={<PromotePage />} />
        <Route path="/fees/items" element={<FeeItemsPage />} />
        <Route path="/fees/config" element={<BillConfigPage />} />
        <Route path="/fees/copy" element={<CopyConfigPage />} />
        <Route path="/fees/preview" element={<BillPreviewPage />} />
        <Route path="/billing/generate" element={<GenerateBillsPage />} />
        <Route path="/billing/student/:id" element={<StudentBillPage />} />
        <Route path="/billing/carryover" element={<CarryoverPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/new" element={<PostPaymentPage />} />
        <Route path="/payments/receipt/:receiptId" element={<PaymentsPage />} />
        <Route path="/debtors" element={<DebtorsPage />} />
        <Route path="/reports/account" element={<AccountReportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}
