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
| Email | nodemailer (SMTP) |
| Cloud backup | googleapis (Google Drive OAuth2) |
| Scheduler | node-cron |

**Critical constraint:** `node-sqlite3-wasm` — NOT `better-sqlite3`.
All DB calls are **synchronous** (`.get()`, `.all()`, `.run()`).
Always pass params as arrays: `.run([param1, param2])` NOT `.run(param1, param2)`.

---

## 4. PROJECT STRUCTURE

```
schoolfees-manager/
├── electron/
│   ├── main.js                    # Entry point — loads all handlers + starts scheduler
│   ├── preload.js                 # window.api bridge (115+ methods)
│   ├── lib/
│   │   ├── database.js            # DB connection, schema, migrations, seed
│   │   ├── defaults.js            # Editable default classes/fees/accounts
│   │   ├── scheduler.js           # node-cron nightly auto-backup
│   │   └── network.config.js      # Edit to point to another PC's DB
│   └── handlers/                  # One file per domain
│       ├── activation.js          # License keys + dev bypass
│       ├── auth.js                # Login, users, passwords
│       ├── settings.js            # School settings, currency, SMS/email
│       ├── core.js                # Sessions, terms, classes, students
│       ├── fees.js                # Fee items, bill config, copy/preview
│       ├── billing.js             # Generate bills, adjustments, carryover
│       ├── payments.js            # Post payments, reversal, receipts
│       ├── accounting.js          # Accounts, journal, invoices, ledger
│       ├── communications.js      # SMS (Termii/BulkSMS/Twilio) + email (SMTP)
│       ├── backup.js              # Local backup/restore with reload
│       └── gdrive.js              # Google Drive backup + scheduler IPC + update checker
├── src/
│   └── pages/
│       ├── BackupPage.jsx         # Local + Google Drive + scheduler UI (all 3 in one)
│       ├── settings/
│       │   └── DevSettingsPage.jsx # Now includes update checker
│       └── payments/
│           └── PaymentsPage.jsx   # Receipt modal now has Email button
├── build-resources/               # electron-builder assets
│   ├── icon.ico                   # NOT in git — add manually before building
│   ├── license.txt                # Shown in Windows installer
│   ├── generate-icon.js           # Helper to convert PNG → ICO
│   └── README.md                  # Build instructions
├── demo/
│   ├── demo.db                    # 25 students, ₦1.8M billed, ₦608K paid
│   └── README.md
├── seed_demo.js                   # Regenerate demo database
├── DESIGN.dm                      # Full platform design document
└── README.md
```

---

## 5. AUTH GATE FLOW

```
App launch
    │
    ├─ activation.is_active == false → ActivationScreen
    ├─ setup_complete == '0' → SetupWizard
    ├─ user == null → LoginScreen
    └─ authenticated → MainApp (all routes)
```

**Dev mode bypass:** Activation is auto-set to unlimited in `npm run dev`.

---

## 6. IPC PATTERN (Critical — must follow exactly)

```javascript
// preload.js pattern:
contextBridge.exposeInMainWorld('api', {
  listStudents: (f) => ipcRenderer.invoke('students:list', f),
})

// handler pattern:
ipcMain.handle('students:list', (_, filters) => {
  return getDb().prepare('SELECT * FROM students').all()
})

// React usage:
const students = await window.api.listStudents({ status: 'active' })
```

**Rules:**
- ALL `.run()` `.get()` `.all()` use array params: `.run([a, b, c])`
- Never use `better-sqlite3` — only `node-sqlite3-wasm`
- Handlers never throw unhandled — wrap in try/catch, return `{ ok, error }`

---

## 7. CURRENCY FORMATTING

**Always use `useAuth().fmt()` — never define local fmt:**

```javascript
import { useAuth } from '../../context/AuthContext'
const { fmt } = useAuth()
// fmt(45000) → '₦45,000.00'
```

---

## 8. CSS COMPONENT CLASSES

```css
.card, .card-sm                    /* white rounded cards */
.btn, .btn-sm, .btn-primary, .btn-secondary
.form-input, .form-select, .form-label
.badge, .badge-blue/green/red/yellow/gray/purple
.nav-item, .nav-item.active, .nav-section
.data-table (thead th, tbody tr, tbody td)
.page-title, .page-subtitle, .page-header
@media print — no @apply inside (Tailwind circular dep)
```

---

## 9. GOOGLE DRIVE BACKUP — Setup Guide for Schools

The Google Drive backup requires a one-time OAuth2 setup:

1. Go to https://console.cloud.google.com
2. Create a project → Enable **Google Drive API**
3. Create **OAuth 2.0 credentials** → Desktop App type
4. Copy Client ID + Client Secret into BackupPage → OAuth Credentials section
5. Click **Connect Google Account** → browser opens → sign in → done
6. All backups go into a "SchoolFees Manager Backups" folder in their Drive
7. Last 10 backups are kept, older ones auto-deleted

**Scheduler:** Nightly at 11 PM by default. Configurable in BackupPage.
**Auto-backup location:** `database/auto_backups/auto_YYYY-MM-DD_*.db`

---

## 10. EMAIL RECEIPTS — Setup

Configure SMTP in Settings → Email tab:
- **Gmail:** host=smtp.gmail.com, port=587, use App Password (not main password)
- **Outlook:** host=smtp.office365.com, port=587
- **Custom server:** any SMTP host

After setup, the "Email" button appears on every payment receipt modal.
It sends a styled HTML receipt to the student's parent_email.

---

## 11. SMS PROVIDERS — Now Live

All three providers are fully implemented (no more "coming soon"):

| Provider | Fields needed | Notes |
|---|---|---|
| **Termii** | api_key, sender_id | Best for Nigeria |
| **BulkSMS Nigeria** | api_token | Cheap local rates |
| **Twilio** | account_sid, auth_token, from_number | International |

Nigerian numbers are auto-normalized to +234 format.

---

## 12. BUILDING THE .EXE

```bash
# Prerequisites:
# 1. Add build-resources/icon.ico (see build-resources/README.md)
# 2. Make sure you're on Windows or use a Windows CI

# Build installer:
npm run build:win
# Output: dist-electron/SchoolFees Manager Setup 1.0.0.exe

# Build unpacked (for testing, no installer):
npm run build:dir
# Output: dist-electron/win-unpacked/SchoolFees Manager.exe
```

**asar:** Enabled. `node-sqlite3-wasm` is unpacked from asar (required for WASM).
**Icon:** Must be a real multi-size `.ico` file. See `build-resources/generate-icon.js`.

---

## 13. UPDATE CHECKER

Available in **Dev Settings** page (devmaster login).
- Checks GitHub releases API for the latest tag
- Shows version, release notes, and download link
- Compares semver automatically
- Works over internet; fails gracefully offline

To publish an update: create a GitHub release with tag `v1.0.1`, attach the installer `.exe` as a release asset.

---

## 14. COMPLETED FEATURES ✅

**Phase 1–6** (all previously completed — see DESIGN.dm for details)
- Sessions, terms, classes, students, promotion
- Fee items, bill config, copy, preview
- Billing, adjustments, carryover, waive, regenerate
- Payments, receipts (A4 + thermal), reversal, debtors
- Reports: dashboard, account report, class bill print
- Auth: activation (offline HMAC), setup wizard, login, users, roles
- Accounting module (toggle): accounts, journal, ledger, trial balance, invoices
- Backup & restore (local), network config, Excel import, Bulk SMS page

**Phase 7 — Infrastructure (just completed)**
- ✅ Google Drive backup (OAuth2, versioned, auto-prune to 10)
- ✅ Auto-backup scheduler (node-cron, nightly, configurable time + keep count)
- ✅ Email receipts (nodemailer SMTP, styled HTML, sent from receipt modal)
- ✅ SMS fully live (Termii, BulkSMS Nigeria, Twilio — all real API calls)
- ✅ Update checker (GitHub releases API, semver compare, download link)
- ✅ Packaging config (electron-builder, NSIS installer, asar, build-resources/)

---

## 15. WHAT STILL NEEDS BUILDING ⬜

**Desktop app remaining:**
- [ ] icon.ico file (must be created manually — see build-resources/README.md)
- [ ] Auto-backup toggle in nightly Drive backup (scheduler gdriveEnabled flag wired, UI done)
- [ ] Report PDF export (generate and email monthly summary to admin)
- [ ] SMS receipt on payment post (optional: send SMS when payment is posted)

**Platform (separate web apps):**
- [ ] Activation server (Node.js + PostgreSQL + Express)
- [ ] Agent portal (Next.js web app)
- [ ] Admin dashboard (Next.js web app)
- [ ] Marketing landing page (schoolfeesmanager.com)

---

## 16. KNOWN ISSUES & CONSTRAINTS

| Issue | Status | Notes |
|---|---|---|
| webSecurity: false warning | ✅ Dev only | Disappears in packaged .exe |
| DB lock on dev restart | ✅ Fixed | Auto-cleans stale lock files |
| currency undefined on first load | ✅ Fixed | Safe fallback ₦ |
| @apply in @media print | ✅ Fixed | Plain CSS only |
| Google Drive needs OAuth setup | ⚠️ By design | One-time setup per school |
| icon.ico not in repo | ⚠️ Required | Must add before building .exe |

---

## 17. HOW TO START A NEW CLAUDE SESSION

```
I'm continuing development of SchoolFees Manager, a desktop Electron+React app.

GitHub: https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
Token:  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

Please:
1. Clone the repo
2. Read HANDOFF.md and DESIGN.dm for full context
3. Check the last few git commits to see what was just done
4. Then ask what I want to work on next
```

---

## 18. LAST COMMITS (May 2026)

```
[current] feat: Google Drive backup, auto-scheduler, email receipts, SMS live, update checker, .exe packaging
12ec90e  fix: replace all local fmt() with useAuth().fmt() across 5 remaining pages
be06228  docs: add HANDOFF.md - comprehensive new session context document
cece937  fix: PaymentsPage useAuth crash, payment reversal, bill regeneration, DB lock cleanup
```

---

*End of HANDOFF.md — keep this file updated as development continues*
