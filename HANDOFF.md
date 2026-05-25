# SchoolFees Manager — New Session Handoff Document
**For Claude AI — Paste this entire file at the start of a new conversation**

---

## 1. WHAT THIS PROJECT IS

A **desktop school fees management application** for Nigerian secondary schools.
Built as a Windows `.exe` using Electron + React + SQLite.
Sold as a **one-time licensed product** distributed through sales agents.

**GitHub:** https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager  
**Token:** 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  
**Owner:** Ojuoye Moshood Olawale

**Developer login:** `devmaster` / `SF@Dev#2025!secure`  
**Demo login:** `admin` / `admin123`  
**Master activation key:** `A84F-6D73-0E74-BFF2`

---

## 2. HOW TO WORK WITH THE REPO

```bash
# ALWAYS start a session by cloning fresh
git clone https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager.git
cd schoolfees-manager

# Make changes, then push
git add -A
git commit -m "fix: description of what changed"
git push
```

**The remote is pre-configured with the token in the URL.**  
After user runs `git pull` on their machine, changes appear instantly.

**To load demo data:**
```bash
mkdir -p database
cp demo/demo.db database/schoolfees.db
npm run dev
```

---

## 3. TECH STACK

| Layer | Technology |
|---|---|
| Desktop shell | Electron (main process) |
| UI framework | React 18 + Vite |
| Styling | Tailwind CSS + custom @layer components |
| Database | SQLite via `node-sqlite3-wasm` (no native build needed) |
| Forms | react-hook-form |
| Routing | React Router v6 (HashRouter) |
| Icons | lucide-react |
| Notifications | react-toastify |
| Excel | SheetJS (xlsx) |
| Charts | recharts (if needed) |

**Critical constraint:** `node-sqlite3-wasm` — NOT `better-sqlite3`.
All DB calls are **synchronous** (`.get()`, `.all()`, `.run()`).
Always pass params as arrays: `.run([param1, param2])` NOT `.run(param1, param2)`.

---

## 4. PROJECT STRUCTURE

```
schoolfees-manager/
├── electron/
│   ├── main.js                    # Entry point — loads all handlers
│   ├── preload.js                 # window.api bridge (102 methods)
│   ├── lib/
│   │   ├── database.js            # DB connection, schema, migrations, seed
│   │   ├── defaults.js            # Editable default classes/fees/accounts
│   │   └── network.config.js     # Edit to point to another PC's DB
│   └── handlers/                  # One file per domain (10 files)
│       ├── activation.js          # License keys + dev bypass
│       ├── auth.js                # Login, users, passwords
│       ├── settings.js            # School settings, currency, SMS/email
│       ├── core.js                # Sessions, terms, classes, students
│       ├── fees.js                # Fee items, bill config, copy/preview
│       ├── billing.js             # Generate bills, adjustments, carryover
│       ├── payments.js            # Post payments, reversal, receipts
│       ├── accounting.js          # Accounts, journal, invoices, ledger
│       ├── communications.js      # SMS/email structure (providers TBD)
│       └── backup.js              # Local backup/restore with reload
├── src/
│   ├── main.jsx                   # React entry + AuthProvider + HashRouter
│   ├── App.jsx                    # Auth gate + all 33 routes
│   ├── index.css                  # Tailwind + custom component classes
│   ├── context/
│   │   └── AuthContext.jsx        # User, currency fmt(), accounting flag
│   ├── lib/
│   │   └── utils.js               # fmt(), fmtDate(), normaliseImportRow()
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx         # Page wrapper with sidebar
│   │   │   └── Sidebar.jsx        # Nav with collapsible groups, school logo
│   │   └── ui/
│   │       └── index.jsx          # Modal, DataTable, Field, Badge,
│   │                              # Spinner, Confirm, SearchInput,
│   │                              # PageHeader, exportToExcel
│   └── pages/
│       ├── auth/
│       │   ├── ActivationScreen.jsx  # License key entry (offline HMAC)
│       │   ├── LoginScreen.jsx       # Username/password login
│       │   └── SetupWizard.jsx       # First-time school info + admin setup
│       ├── Dashboard.jsx             # Real metrics, collection bars
│       ├── students/
│       │   ├── StudentsPage.jsx      # List, search, filter, export
│       │   ├── StudentForm.jsx       # Register/edit + photo + demo limit
│       │   └── PromotePage.jsx       # Promote class / change term
│       ├── fees/
│       │   ├── FeeItemsPage.jsx      # CRUD fee items
│       │   ├── BillConfigPage.jsx    # Configure fees per class/term
│       │   ├── CopyConfigPage.jsx    # Copy config between terms
│       │   └── BillPreviewPage.jsx   # Preview bills for 8 student profiles
│       ├── billing/
│       │   ├── GenerateBillsPage.jsx # Bulk generate bills for a class
│       │   ├── StudentBillPage.jsx   # Per-student bills + adjustments
│       │   │                         # + payment history + regenerate
│       │   ├── CarryoverPage.jsx     # Previous term balance carry-over
│       │   └── ClassBillPrintPage.jsx # Print all student bills for a class
│       ├── payments/
│       │   ├── PostPaymentPage.jsx   # Post payment with student search
│       │   ├── PaymentsPage.jsx      # History + receipt + reversal
│       │   └── DebtorsPage.jsx       # Outstanding balances + export
│       ├── accounting/
│       │   ├── AccountsPage.jsx      # Chart of accounts
│       │   ├── JournalPage.jsx       # Double-entry journal
│       │   ├── LedgerPage.jsx        # General ledger by account
│       │   ├── TrialBalancePage.jsx  # Trial balance
│       │   ├── InvoicesPage.jsx      # Create/manage invoices
│       │   └── AccountStatementPage.jsx # Account statement + print
│       ├── reports/
│       │   ├── AccountReportPage.jsx # Income by fee item/class/method
│       │   └── BulkSmsPage.jsx       # Send SMS to parents (structure ready)
│       ├── users/
│       │   └── UsersPage.jsx         # User management (admin/bursar/viewer)
│       ├── import/
│       │   └── ImportStudentsPage.jsx # Excel student import
│       ├── settings/
│       │   ├── SettingsPage.jsx      # 6 tabs: school/currency/receipt/SMS/email/backup
│       │   └── DevSettingsPage.jsx   # Developer-only: accounting toggle, DB path
│       ├── sessions/
│       │   └── SessionsPage.jsx      # Academic sessions + terms
│       ├── classes/
│       │   └── ClassesPage.jsx       # Class management
│       └── BackupPage.jsx            # DB backup/restore/switch
├── demo/
│   ├── demo.db                    # 25 students, ₦1.8M billed, ₦608K paid
│   └── README.md
├── seed_demo.js                   # Regenerate demo database
├── DESIGN.dm                      # Full platform design document
└── README.md                      # Keys, logins, structure
```

---

## 5. AUTH GATE FLOW

```
App launch
    │
    ├─ activation.is_active == false → ActivationScreen
    │         Enter key → offline HMAC validate → activate
    │
    ├─ setup_complete == '0' → SetupWizard
    │         School info + admin account creation
    │
    ├─ user == null → LoginScreen
    │         username + password → auth:login IPC
    │
    └─ authenticated → MainApp (all routes)
```

**Dev mode bypass:** In development (`npm run dev`), activation is auto-set
to unlimited so you never need a real key during testing.

---

## 6. IPC PATTERN (Critical — must follow exactly)

Every frontend API call goes through `window.api.*` defined in `preload.js`.

```javascript
// preload.js pattern:
contextBridge.exposeInMainWorld('api', {
  listStudents: (f) => ipcRenderer.invoke('students:list', f),
})

// handler pattern (e.g. handlers/core.js):
module.exports = function registerCoreHandlers() {
  ipcMain.handle('students:list', (_, filters) => {
    const db = getDb()
    return db.prepare('SELECT * FROM students').all()
  })
}

// React usage:
const students = await window.api.listStudents({ status: 'active' })
```

**Rules:**
- ALL `.run()` `.get()` `.all()` calls use array params: `.run([a, b, c])`
- Never use `better-sqlite3` — only `node-sqlite3-wasm`
- Handlers never throw unhandled — wrap in try/catch, return `{ ok, error }`
- IPC handler names: `domain:action` (e.g. `payments:post`, `bills:generate-class`)

---

## 7. CURRENCY FORMATTING

**Always use `useAuth().fmt()` — never define local fmt:**

```javascript
import { useAuth } from '../../context/AuthContext'

export default function MyPage() {
  const { fmt } = useAuth()
  // fmt(45000) → '₦45,000.00'
  // Currency symbol comes from school settings, defaults to ₦
}
```

**Never do this:**
```javascript
const fmt = n => `₦${n}...` // ❌ breaks when school uses GHS or USD
```

---

## 8. CSS COMPONENT CLASSES (defined in index.css @layer components)

```css
/* Cards */
.card         { bg-white rounded-xl border border-gray-200 p-5 shadow-sm }
.card-sm      { bg-white rounded-xl border border-gray-200 p-4 shadow-sm }

/* Buttons */
.btn          { inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm }
.btn-sm       { px-3 py-1.5 text-xs }
.btn-primary  { bg-blue-600 text-white hover:bg-blue-700 }
.btn-secondary{ bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 }

/* Forms */
.form-input   { w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 }
.form-select  { same as form-input + appearance-none }
.form-label   { block text-sm font-medium text-gray-700 mb-1 }

/* Badges */
.badge        { inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium }
.badge-blue   { bg-blue-100 text-blue-700 }
.badge-green  { bg-emerald-100 text-emerald-700 }
.badge-red    { bg-red-100 text-red-700 }
.badge-yellow { bg-amber-100 text-amber-700 }
.badge-gray   { bg-gray-100 text-gray-600 }
.badge-purple { bg-purple-100 text-purple-700 }

/* Navigation */
.nav-item     { flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 }
.nav-item.active { bg-blue-600 text-white }
.nav-section  { text-xs text-slate-500 uppercase tracking-wider px-3 pt-3 pb-1 }

/* Tables */
.data-table   { w-full border-collapse }
.data-table thead th { bg-gray-50 text-xs uppercase text-gray-500 font-medium px-4 py-3 }
.data-table tbody tr { border-b border-gray-100 hover:bg-gray-50 }
.data-table tbody td { px-4 py-3 text-gray-800 text-sm }

/* Page layout */
.page-title   { text-2xl font-bold text-gray-900 }
.page-subtitle{ text-sm text-gray-500 mt-0.5 }
.page-header  { flex items-center justify-between mb-6 }

/* Print — no @apply inside @media (causes Tailwind circular dep error) */
@media print {
  .sidebar, nav, .no-print, button:not(.print-show) { display: none !important }
  .receipt-content { padding: 20mm; font-size: 11pt }
}
```

---

## 9. REUSABLE UI COMPONENTS (src/components/ui/index.jsx)

```javascript
import {
  PageHeader,    // title, subtitle, actions prop
  Modal,         // open, onClose, title, footer, size ('sm'|'lg'|'xl')
  Confirm,       // open, onClose, onConfirm, title, message, danger
  Field,         // label, required, error, hint, children
  DataTable,     // columns, data, onRowClick, emptyMessage
  SearchInput,   // value, onChange, placeholder, className
  Spinner,       // full-page loading
  exportToExcel, // (rows[], filename) — uses SheetJS
} from '../../components/ui'
```

---

## 10. DATABASE SCHEMA OVERVIEW

**Key tables:**
```
sessions          → Academic years (e.g. 2024/2025)
terms             → First/Second/Third Term per session
classes           → JSS 1, JSS 2... SS 3
students          → All student records + parent info
student_status    → Which class/term each student is in
fee_items         → Tuition Fee, PTA Levy, etc.
bill_config       → Amount per fee item per class/term with rules:
                    gender_rule (all/male/female)
                    student_type_rule (all/new/returning)
                    boarding_rule (all/day/boarding)
student_bills     → Generated bill lines per student per term
bill_adjustments  → Discounts/additions applied to student bills
previous_term_balance → Carry-over from last term
payments          → Payment receipts (can be reversed)
activation        → License info (tier, max_students, machine_id)
users             → Staff logins (admin/bursar/viewer)
school_settings   → School name, logo, bank, currency, SMS/email config
accounts          → Chart of accounts (asset/liability/equity/income/expense)
journal_entries   → Double-entry accounting entries
journal_lines     → Debit/credit lines per journal entry
invoices          → School invoices to vendors
```

**Bill calculation:**
```
total_expected = SUM(bill lines) + prev_balance + adjustments(additions) - adjustments(discounts)
balance        = total_expected - SUM(payments where is_reversed=0)
```

---

## 11. ACTIVATION SYSTEM

**Current (offline HMAC keys — working):**
```javascript
// Key derived from: SHA256("SF_MASTER_SECRET_2025_OJUOYE:SEED")
// First 16 hex chars formatted as XXXX-XXXX-XXXX-XXXX

Master key:  A84F-6D73-0E74-BFF2  (unlimited students)
Demo keys:   9A74-A306-A704-BED5  (5 students each, reusable)
             F6E3-8FB1-E8C3-39A1
             ... (15 total demo keys)
Standard:    3F30-A570-E2F7-9B2F  (500 students, 10 keys)
Unlimited:   4126-C22C-8EAC-AFFF  (unlimited, 10 keys)
```

**Target (online PIN system — to be built):**
```
Agent generates 6-digit PIN in Agent Portal
School enters PIN → app calls api.schoolfeesmanager.com/v1/activate
Server validates (one-time, 7-day expiry, machine binding)
Server returns permanent license key stored in app DB
App works fully offline thereafter
```

---

## 12. COMPLETED FEATURES ✅

**Phase 1 — Foundation**
- Sessions, terms, classes CRUD
- Student registration (photo, parent email, boarding type)
- Promote students / change term
- Student status history

**Phase 2 — Billing Config**
- Fee items CRUD (with defaults)
- Bill config per class/term with 4 rules
- Copy config between terms
- Bill preview for 8 student profiles

**Phase 3 — Student Billing**
- Auto-generate bills (idempotent)
- Bill adjustments (fixed/percent/flat, addition/discount)
- Carry-over balance
- Regenerate bills when student profile changes
- Waive individual bill items

**Phase 4 — Payments**
- Post payment (with student search, auto-fill balance)
- Receipt modal (A4 + 80mm/58mm thermal toggle, school logo)
- Payment history with filters
- Payment reversal (creates REV- entry, audit trail)
- Debtors list with Excel export

**Phase 5 — Reports**
- Dashboard (real metrics, collection bars by class, recent payments)
- Account report (by fee item / class / payment method)
- Bulk SMS page (structure ready, providers TBD)
- Class bill print (all students in a class, one A4 per student)

**Phase 6 — Auth & Activation**
- Activation screen (offline HMAC keys, no server needed)
- Setup wizard (school info + first admin creation)
- Login screen (school logo, password toggle)
- User management (admin/bursar/viewer roles)
- Developer settings page (accounting toggle, DB path)

**Accounting Module (toggle via dev settings)**
- Chart of accounts
- Journal entries (double-entry with balance validation)
- General ledger
- Trial balance
- Invoices (create, status management)
- Account statement

**Infrastructure**
- Custom scrollbar matching sidebar slate-900 theme
- Currency context (₦ default, configurable in settings)
- Demo DB with 25 students, ₦1.8M billed, ₦608K collected
- DB lock auto-cleanup on Windows (stale .lock files)
- Backup & Restore with proper Windows file handle release
- Network config file for multi-PC LAN setup
- Excel import (students from spreadsheet)
- DESIGN.dm platform design document

---

## 13. WHAT STILL NEEDS BUILDING ⬜

**Desktop app remaining:**
- [ ] Google Drive backup (like WhatsApp auto-backup)
- [ ] Auto-backup scheduler (node-cron nightly)
- [ ] Email receipts via SMTP (nodemailer — structure exists)
- [ ] SMS receipts via Termii/BulkSMS (API keys needed)
- [ ] Report email to admin (send PDF report via email)
- [ ] Update checker (check GitHub releases)
- [ ] Packaging to .exe (electron-builder config)

**Platform (separate web apps):**
- [ ] Activation server (Node.js + PostgreSQL + Express)
- [ ] Agent portal (Next.js web app)
- [ ] Admin dashboard (Next.js web app)
- [ ] Marketing landing page (schoolfeesmanager.com)
- [ ] Careers/agent application page

---

## 14. KNOWN ISSUES & CONSTRAINTS

| Issue | Status | Notes |
|---|---|---|
| webSecurity: false warning | ✅ Dev only | Disappears in packaged .exe |
| DB lock on dev restart | ✅ Fixed | Auto-cleans stale lock files |
| currency undefined on first load | ✅ Fixed | Safe fallback ₦ in AuthContext |
| useAuth missing in PaymentsPage | ✅ Fixed | Complete rewrite pushed |
| @apply in @media print | ✅ Fixed | All print styles use plain CSS |
| git push from Claude | ❌ Blocked | api.github.com blocked, but github.com push works |
| activation server | ⬜ Planned | Phase B in DESIGN.dm |

---

## 15. HOW TO START A NEW CLAUDE SESSION

**Paste this prompt:**

```
I'm continuing development of SchoolFees Manager, a desktop Electron+React app.

GitHub: https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
Token:  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

Please:
1. Clone the repo
2. Read HANDOFF.md and DESIGN.dm for full context
3. Check the last few git commits to see what was just done
4. Then ask what I want to work on next

Key facts:
- Stack: Electron + React + Vite + Tailwind + node-sqlite3-wasm (NOT better-sqlite3)
- All DB params must be arrays: .run([a, b, c])
- Currency: always use useAuth().fmt() — never local fmt
- Push directly with git push after every change
- Demo login: admin/admin123, Dev login: devmaster/SF@Dev#2025!secure
- Master activation key: A84F-6D73-0E74-BFF2
```

---

## 16. LAST COMMITS (May 2026)

```
cece937 fix: PaymentsPage useAuth crash, payment reversal, bill regen, DB lock
13611bf docs: add DESIGN.dm - full platform design document
78056b6 feat: class bill print, bill history fix, network config, DB lock
0c10d0c fix: currency undefined bug, backup page demo DB switching
bf5e476 feat: offline activation keys - no server needed
1710d3e docs: update README with activation keys and project structure
b976bc7 fix: activation key error - remove conflicting onChange
8c65d9f fix: database locked error - Windows file lock handling
e121c4d fix: remove @apply from @media print (Tailwind circular dep)
14766eb demo: add demo database with 25 students, bills, payments
239f311 fix: remove stray window code from activation.js, dev bypass
```

---

*End of HANDOFF.md — keep this file updated as development continues*
