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
git clone https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager.git
cd schoolfees-manager
# Load demo data:
mkdir -p database && cp demo/demo.db database/schoolfees.db
npm run dev
# Push changes:
git add -A && git commit -m "fix: ..." && git push
```

---

## 3. TECH STACK

| Layer | Technology |
|---|---|
| Desktop shell | Electron (main process) |
| UI framework | React 18 + Vite |
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

**Critical:** All DB `.run()` `.get()` `.all()` calls use array params: `.run([a, b, c])`  
**Currency:** Always `useAuth().fmt()` — never hardcode ₦  
**Print styles:** Never use `@apply` inside `@media print` (Tailwind circular dep)

---

## 4. PROJECT STRUCTURE

```
electron/
  main.js                — Entry, loads handlers, starts scheduler
  preload.js             — window.api bridge (120+ methods)
  lib/
    database.js          — Schema, migrations, seed
    scheduler.js         — node-cron nightly auto-backup
    network.config.js    — LAN multi-PC DB path
  handlers/
    activation.js        — License + accounting unlock key + student import
    auth.js              — Login, users, passwords
    settings.js          — School settings
    core.js              — Sessions, terms, classes, students (fixed imports + class update)
    fees.js              — Fee items, bill config
    billing.js           — Bills, adjustments, carryover, opening balances import
    payments.js          — Payments, receipts, reversal + auto-journal
    accounting.js        — Journal, ledger, trial balance, invoices
    communications.js    — SMS (Termii/BulkSMS/Twilio) + email (nodemailer SMTP)
    backup.js            — Local + cloud folder sync backup
    gdrive.js            — Google Drive OAuth + scheduler IPC + update checker
src/
  App.jsx                — All routes (34 routes)
  context/AuthContext.jsx — User, fmt(), canEdit, canAdmin, isViewer
  pages/
    BackupPage.jsx        — Local + cloud folder sync + GDrive OAuth + scheduler
    billing/
      StudentBillPage.jsx  — Bills + adjustments (role-guarded) + Statement button
      FeeStatementPage.jsx — Full fee statement with school header (NEW)
      GenerateBillsPage.jsx — Kept but removed from sidebar nav
    students/
      StudentsPage.jsx    — Now has View Bill button per row
      StudentForm.jsx     — Fixed class_id loading in edit mode
    import/
      ImportStudentsPage.jsx
      OpeningBalancesPage.jsx — (NEW) Import prior balances from Excel
    settings/
      SettingsPage.jsx    — Added Accounting tab + test SMS/email + test print
      DevSettingsPage.jsx — Added update checker + accounting key generator
    sessions/SessionsPage.jsx — Fixed Set Current button (was empty function)
build-resources/         — icon.ico goes here before npm run build:win
```

---

## 5. ROLE SYSTEM

| Role | Capabilities |
|---|---|
| developer (devmaster) | Everything + Dev Settings |
| admin | Everything except Dev Settings |
| bursar | Post payments, view all |
| viewer | Read-only — cannot post, adjust, waive, or generate |

`useAuth()` exposes: `canEdit`, `canAdmin`, `isViewer`, `isDeveloper`, `isAdmin`

---

## 6. ACCOUNTING MODULE

**Default:** Hidden. Two ways to unlock:
1. **devmaster toggle** — Dev Settings page → accounting toggle
2. **Accounting unlock key** — Settings → Accounting tab → enter `ACCT-XXXX-XXXX`
   - Generate keys in Dev Settings → "Generate Accounting Unlock Key"
   - Key is school-name-specific (HMAC-SHA256)
   - Master key works for any school

**Auto-journal:** Every payment now auto-creates a journal entry (Dr bank, Cr income) if accounting is enabled. Reversals create the opposite entry.

**Default chart of accounts:** Seeded in database.js (1000-5060 range)

---

## 7. BILLING LOGIC (Hybrid Architecture)

Bills stored in `student_bills` for audit. Recalculate on:
- Student criteria change (class, gender, boarding, entry_type)
- Bill config change
- Waive/reinstate

**Bill total formula:**
```
billTotal      = SUM(student_bills.amount WHERE status != 'waived')
totalExpected  = billTotal + prev_balance + adjustments
balance        = totalExpected - SUM(payments.amount_paid WHERE is_reversed=0 AND amount_paid > 0)
```

**Single source of truth for payments:** `payments.amount_paid WHERE is_reversed=0`  
**Never use:** `payment_items` table for balance calculations (causes mismatch)

---

## 8. KEY FIXES APPLIED (Phase 8)

| Fix | File |
|---|---|
| DevSettingsPage syntax error (await in non-async) | DevSettingsPage.jsx |
| Photo upload — missing dialog/path/fs/dbDir imports | core.js |
| Class dropdown blank in edit mode | StudentForm.jsx + core.js:students:update |
| students:update params bug (.run mixed array) | core.js |
| New→returning not updating on promotion | core.js:promote + change-term |
| Waived bills still counted in total | billing.js:student-summary |
| Payment total mismatch (MAX hack removed) | billing.js |
| Session Set Current button was empty function | SessionsPage.jsx |
| Viewer role could post/adjust bills | AuthContext + PostPaymentPage + StudentBillPage |
| Email field name mismatch (email_host vs email_smtp_host) | communications.js |

---

## 9. WHAT STILL NEEDS BUILDING

From `school-feesmgt_cont.md`:
- [ ] Auto-recalculate bills when student profile changes (B1) — trigger from students:update
- [ ] Adjustment reversal (soft-delete with is_reversed flag) 
- [ ] Report PDF export / email summary to admin
- [ ] Packaging: add `build-resources/icon.ico` then `npm run build:win`
- [ ] Platform web apps (activation server, agent portal, admin dashboard, landing page)

---

## 10. HOW TO START A NEW SESSION

```
I'm continuing development of SchoolFees Manager, a desktop Electron+React app.

GitHub: https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
Token:  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

Please:
1. Clone the repo
2. Read HANDOFF.md and school-feesmgt_cont.md for full context
3. Check the last 5 git commits
4. Then ask what I want to work on next
```

---

## 11. LAST COMMITS

```
[current] feat: settings test SMS/email/print, accounting unlock key, cloud folder sync, fee statement, opening balances, fixes
412bbf9  feat: fee statement, view bill, opening balances import, cloud folder sync, auto-journal, duplicate validation
764cfe0  fix: 9 critical bugs - photo, class dropdown, waive calc, payment total, session current, viewer roles
7bcc89d  docs: update school-feesmgt_cont.md with final decisions
3ac9209  docs: add school-feesmgt_cont.md Phase 8 analysis
```

---

*End of HANDOFF.md*
