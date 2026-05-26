# SchoolFees Manager — Handoff Document
**For Claude AI — Read this at the start of every new session**

---

## 1. WHAT THIS PROJECT IS

A **desktop school fees management application** for Nigerian secondary schools.
Built as a Windows `.exe` using Electron + React + SQLite.
Sold as a **one-time licensed product** distributed through sales agents in Nigeria.

**GitHub:** https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
**Token:** 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
**Owner:** Ojuoye Moshood Olawale (developer at Codeware Nigeria, intern targeting D365 F&O)

**Dev login:** `devmaster` / `SF@Dev#2025!secure`
**Demo login:** `admin` / `admin123`
**Master activation key:** `A84F-6D73-0E74-BFF2`
**Master accounting unlock key:** `ACCT-91FD-7DCD` (works for any school name)

---

## 2. HOW TO START A NEW SESSION

```
I'm continuing development of SchoolFees Manager, a desktop Electron+React app.

GitHub: https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
Token:  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

Please:
1. Clone the repo
2. Read HANDOFF.md for full context
3. Check the last 5 git commits
4. Then ask what I want to work on next
```

**Dev startup command (do this instead of npm run dev):**
```bash
npm start   # git pull + clear DB locks + npm run dev — all in one
```

---

## 3. TECH STACK

| Layer | Technology |
|---|---|
| Desktop shell | Electron (main process) |
| UI | React 18 + Vite |
| Styling | Tailwind CSS + custom @layer components |
| Database | SQLite via `node-sqlite3-wasm` (NOT better-sqlite3) |
| Forms | react-hook-form |
| Routing | React Router v6 (HashRouter) |
| Icons | lucide-react |
| Notifications | react-toastify |
| Excel | SheetJS (xlsx) |
| Email | nodemailer (SMTP) |
| Cloud backup | googleapis (Google Drive OAuth2) |
| Scheduler | node-cron |

**Critical rules:**
- All DB calls use array params: `.run([a, b])` `.get([a])` `.all([a])`
- Currency: always `useAuth().fmt()` — never hardcode ₦
- Never use `@apply` inside `@media print` (Tailwind circular dep bug)
- `node-sqlite3-wasm` keeps DB in memory, only flushes on `db.close()` — always handle SIGINT/SIGTERM

---

## 4. PROJECT STRUCTURE

```
electron/
  main.js                    — Entry, IPC handlers, print IPC, signal handlers, content protection
  preload.js                 — window.api bridge (150+ methods)
  lib/
    database.js              — Schema, migrations, seed defaults
    scheduler.js             — node-cron nightly auto-backup
  handlers/
    activation.js            — License, dev auto-activate, accounting unlock, setup_complete seed
    auth.js                  — Login, users, roles
    settings.js              — School settings get/save (120+ fields)
    core.js                  — Sessions, terms, classes, students, promote, change-term
    fees.js                  — Fee items, bill config (payment-triggered lock)
    billing.js               — Bills, adjustments, carryover, auto-regen engine
    payments.js              — Payments, receipts, reversal, dashboard, all reports
    accounting.js            — Journal, ledger, trial balance, invoices
    communications.js        — SMS (Termii/BulkSMS/Twilio) + email (nodemailer)
    communications_helper.js — Shared sendSmsMessage / sendEmailReceipt helpers
    backup.js                — Local + cloud folder sync backup
    gdrive.js                — Google Drive OAuth2, backup, restore, scheduler
  scripts/
    dev-start.js             — npm start entry: pull + clear locks + dev
src/
  App.jsx                    — All routes
  context/AuthContext.jsx    — User, fmt(), canEdit, canAdmin, isViewer
  components/layout/
    Sidebar.jsx              — Full navigation
  pages/
    Dashboard.jsx            — 3-mode toggle: Operations / Accounting / Executive
    billing/
      StudentBillPage.jsx    — Bills, isolated AdjustmentModal, clean print
      ClassBillPrintPage.jsx — Class-wide bill print via clean IPC
      FeeStatementPage.jsx   — Full fee statement
    reports/
      AccountReportPage.jsx
      CollectionSummaryPage.jsx   — Daily collection trends
      ClassFeeStatusPage.jsx      — All students per class (paid/partial/unpaid)
      StudentLedgerPage.jsx       — Full history across all terms
      TermEndReportPage.jsx       — Complete term summary, printable
      PaymentAuditPage.jsx        — Every payment with poster, reversals
      CommunicationsLogPage.jsx   — Failed SMS/email + resend + edit contact
      BulkSmsPage.jsx
    settings/
      SettingsPage.jsx       — Tabs: School, Registration, Currency, Receipt, SMS, Email, Accounting, Backup
      RegNumberTab.jsx       — Live preview reg number format builder
      AccountingTab.jsx      — Secure unlock key (no paste, screenshot blocked)
```

---

## 5. ROLE SYSTEM

| Role | Can do |
|---|---|
| developer (devmaster) | Everything + Dev Settings |
| admin | Everything except Dev Settings |
| bursar | Post payments, generate bills, view all |
| accountant | Accounting module only |
| viewer | Read-only — cannot post, adjust, waive |

`useAuth()` exposes: `canEdit`, `canAdmin`, `isViewer`, `isDeveloper`, `fmt()`

---

## 6. BILLING ARCHITECTURE (critical to understand)

### Core principle
Bills are **point-in-time records** generated once before term starts. They are NOT recalculated dynamically from config — they are a historical ledger entry.

### Auto-generation triggers (fully automatic — bursar never needs to manually generate)
- New student registered → bills generated immediately
- Term set as current → bulk generate for ALL active students
- Student promoted / change-term → bills generated for new term
- Student profile changed (class, gender, boarding, entry) → bills recalculated
- Student marked inactive → pending bills frozen (❄ status, excluded from balance)
- Student reactivated → bills unfrozen and re-evaluated
- Fee config saved (before any payment) → amounts synced on all pending bills
- Bill page opened → safety net auto-generate if somehow still missing

### Bill config lock (payment-triggered, not date-triggered)
- **Past term** → always locked (read-only)
- **Current/future term, no payments yet** → fully editable, amount changes sync to bills
- **Current/future term, first payment posted** → locked, use adjustments only
- This means: typo in fee amount before anyone pays? Fix the config → all bills update. After payments start? Only adjustments.

### Bill total formula
```
billTotal      = SUM(student_bills.amount WHERE status NOT IN ('waived','frozen'))
totalExpected  = billTotal + prev_balance + adjustments
balance        = totalExpected - SUM(payments.amount_paid WHERE is_reversed=0 AND amount_paid>0)
```

### Overpayment
When paid > billed, the surplus can be carried to next term as a negative `previous_term_balance` (credit). Use `payments:carry-credit` IPC.

---

## 7. PRINT SYSTEM

All printing uses Electron's clean IPC (`app:print-html`) which opens a hidden BrowserWindow, renders pure HTML, prints, then destroys the window. **No `window.print()` anywhere** — that captured the app sidebar.

```js
// Frontend usage
import { printCleanHtml, buildBillSlipHtml } from '../../lib/utils'
await printCleanHtml(html)
```

**⚠ PHASE 4 (NEXT PRIORITY):** Print preview modal with paper size selector (A4, A5, Letter, Thermal 80mm, 58mm) is NOT yet built. This is the next major task.

---

## 8. COMMUNICATIONS SYSTEM

### Receipt auto-send
When a payment is posted and `auto_send_receipt = 1` in settings:
1. Builds full HTML receipt with school logo (embedded inline), amount paid, **balance due**, term, class
2. Sends email via SMTP using `communications_helper.sendEmailReceipt()`
3. Sends SMS with balance using `communications_helper.sendSmsMessage()`
4. Logs result in `sms_log` / `email_log` with `error_reason` column

### Reversal alerts
When a payment is reversed, parent receives SMS + email with reversal notice automatically.

### Failed message recovery
`/reports/comms-log` — shows all sent/failed/pending. Per row:
- **Resend** — retry same contact
- **Edit & Resend** — fix wrong phone/email, updates student record, retries

### Email log columns
`id, email, student_id, subject, body, status, error_reason, sent_at, created_at`

### SMS log columns
`id, phone, student_id, message, status, provider_ref, error_reason, sent_at, created_at`

---

## 9. GOOGLE DRIVE BACKUP

**Critical fix applied:** Credentials stored in `app.getPath('userData')/gdrive/` NOT next to the DB file. This means credentials survive when the DB is copied to another PC.

**OAuth flow fix:** Token exchange now happens BEFORE the success page is sent — previously the success page was shown but the token was never saved.

**If DB is moved to another PC:** The credentials stay on the original machine. User must reconnect on the new machine (Settings → Backup → Connect Google Account). The backup folder in Drive is reused automatically.

---

## 10. ACCOUNT REPORT — HOW IT WORKS CORRECTLY

The account report has been fixed three times. The correct algorithm:

```js
// 1. Bills by class (exclude waived/frozen)
SELECT ss.class_id, SUM(sb.amount) FROM student_bills sb
JOIN student_status ss ON ss.student_id=sb.student_id AND ss.term_id=sb.term_id
WHERE sb.status NOT IN ('waived','frozen') AND sb.term_id=?

// 2. Student→class map: USE STUDENT_STATUS as primary (catches students with
//    payments but no bills), OVERRIDE with bills-derived for students who have bills
const studentClassMap = new Map(student_status rows)
billsClassRows.forEach(r => studentClassMap.set(r.student_id, r.class_id)) // override

// 3. Payments by student (exclude reversed)
SELECT student_id, SUM(amount_paid) FROM payments
WHERE is_reversed=0 AND amount_paid>0 AND term_id=?

// 4. Assign each payment to a class via studentClassMap

// 5. Class total must equal method total — if not, there's a data problem
```

**Root cause of historical mismatches:** Students with payments in a term but no bills for that term (missing bill config). The current fix catches them via `student_status`.

---

## 11. DEV ENVIRONMENT

**Activation in dev:** Uses `!app.isPackaged` check (NOT `NODE_ENV`). Always forces `setup_complete='1'` and `is_active=1` on every DB open in dev. Never shows activation screen in dev.

**Signal handlers:** `SIGINT`, `SIGTERM`, `SIGUSR2` all call `closeDb()` before exiting, ensuring WASM DB flushes to disk on Ctrl+C.

**Screenshot protection:** `app:set-content-protection` IPC. Accounting tab enables it on mount, disables on unmount.

---

## 12. REGISTRATION NUMBER FORMAT

Configured in Settings → Registration tab. Live preview builder with 8 tokens:
- `{PREFIX}` → school initials (configurable)
- `{YEAR}` → 2025, `{YY}` → 25
- `{SESSION}` → compact session code (2024/2025 → 2425)
- `{SEQ3}` `{SEQ4}` `{SEQ5}` → auto-incrementing sequence

Sequence reset options: per year (default), per session, or never.
8 preset templates available. Manual override always allowed in student form.

---

## 13. DASHBOARD MODES

Three modes, persisted in `localStorage`:
- **Operations** — daily fees, collections, debtors, recent payments, quick actions
- **Accounting** — revenue vs receivables, accounting module quick links
- **Executive** — one-page KPI summary, class performance bars, key reports

---

## 14. PENDING — NEXT SESSION PRIORITIES

### Phase 4 — Print Preview (IMMEDIATE NEXT TASK)
- [ ] `PrintPreviewModal` component — iframe preview, paper size selector, margin options
- [ ] Update `app:print-html` IPC to accept `paperSize` and `margins`
- [ ] Apply to: StudentBillPage, ClassBillPrintPage, FeeStatementPage, TermEndReportPage, PaymentReceipt
- [ ] School logo on ALL print outputs
- [ ] Email address in header of bill prints and statements

### Phase 5 — Payroll Module
### Phase 6 — Expense & Procurement
### Phase 7 — Attendance
### Phase 8 — Inventory
### Phase 9 — Parent Portal
### Phase 10 — Multi-Branch

See `PRODUCT_ROADMAP.md` for full details, pricing, and agile breakdown.

---

## 15. OPEN QUESTIONS (answer at start of next session)

1. **Payroll — pension:** Include NHF + NSITF contributions or just PAYE for now?
2. **Parent Portal:** Self-hosted per school or cloud-hosted by you?
3. **Multi-user LAN sync:** Real-time between PCs on same network, or just user switching on one PC?
4. **Biometric attendance:** Do you plan to sell the hardware yourself?
5. **WhatsApp:** Proceed with Termii WhatsApp Business API now, or wait?
6. **USD pricing:** Should international/diaspora schools get USD pricing option?

---

## 16. LAST 10 COMMITS

```
7057e19  docs: PRODUCT_ROADMAP.md — module pricing, SWOT, legal, phases, hardware
f106f25  fix: Google Drive reconnect, email auto-send with balance+logo, reversal
         alerts, failed comms log with resend+edit, overpayment credit carry,
         dashboard 3-mode toggle, 6 new report pages
6a9cea3  fix: account report — student_status fallback, drop orphaned table
7142255  dev: npm start script — pull + clear locks + dev in one command
e023dd3  fix: account report class vs method total mismatch
a644aef  fix: activation screen on lock delete, accounting key screenshot protection
d8c9a65  feat: configurable reg number format with live preview builder
f25d806  fix: account report — exclude waived/frozen, reversed payments
b6c8db6  fix: set-current on new sessions, payment-triggered bill config lock
4969ffb  feat: complete dynamic billing — frozen inactive, new-term bulk, amount sync
```

---

*Last updated: May 2026 — end of Session 2*
