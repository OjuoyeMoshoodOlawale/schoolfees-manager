# SchoolFees Manager — Continuation & Bug Fix Document
**Session:** Phase 8 — Stability, Architecture Fixes, UX Improvements  
**Prerequisite:** Read HANDOFF.md first for full project context  
**This document:** Covers everything that needs fixing/building next

---

## DECISIONS CAPTURED (From Developer)

| Question | Decision |
|---|---|
| Bill architecture | **Hybrid** — store bill rows for audit, auto-recalculate on every criteria change |
| Accounting module lock | **devmaster login only** — flip per installation via Dev Settings |
| Reversals scope | **Payments + bill adjustments + carryover** |
| Inactive student mid-term | **Freeze immediately** — hide from active, bills stay frozen |
| Google Drive backup | **Both options** — keep OAuth AND add simple folder-path option |
| Fee statement | **Both as separate print options** — receipt stays, new Fee Statement added |

---

## SECTION A — CRITICAL BUG FIXES (Do these first)

### A1. DB Lock on App Start — Already fixed but verify
Current code cleans lock files in `getDb()`. **Confirm it covers all 4 patterns:**
```
schoolfees.db.lock
schoolfees.db-journal
schoolfees.db-wal
schoolfees.db-shm
```
All four are already cleared in `database.js` `getDb()`. ✅ No change needed.

---

### A2. New Students Auto-Becoming "Returning" When Changing Terms

**Bug:** When promoting students or changing terms, `entry_type` on the `students` table stays 'new' forever. It should become 'returning' once the student has completed one term.

**Root cause:** `entry_type` lives on the `students` table (permanent), not `student_status`. Promotion never updates it.

**Fix — in `handlers/core.js`:**
- In `students:promote` handler: after inserting new `student_status` rows, run:
  ```sql
  UPDATE students SET entry_type='returning'
  WHERE id IN (SELECT student_id FROM student_status WHERE term_id = :new_term_id)
  AND entry_type = 'new'
  ```
- In `students:change-term` handler: same update after inserting new status row.
- Also in `students:promote`: update ALL students being promoted (not just new ones).

**Test scenario:** Register student as 'new' in Term 1. Promote to Term 2. Confirm entry_type changes to 'returning' in students table.

---

### A3. Class Dropdown Unselected When Editing a Student

**Bug:** When editing an existing student, `reset(student)` is called with the flat student object, but `class_id` is stored in `student_status`, not on the `students` table. So the class dropdown has no value and form won't save.

**Fix — in `src/pages/students/StudentForm.jsx`:**
1. After loading student, also fetch their current class:
   ```javascript
   if (isEdit && currentTerm) {
     const status = await window.api.getStudentStatus(Number(id))
     const currentStatus = status?.find(s => s.term_id === currentTerm.id)
     if (currentStatus) {
       reset({ ...student, class_id: String(currentStatus.class_id) })
     } else {
       reset(student) // no status for current term
     }
   }
   ```
2. The `<select>` value must be a string — `class_id` from DB is an integer, but `<select>` values are strings. Ensure `value={String(c.id)}` on options.
3. When submitting in edit mode, also update `student_status` for current term with new `class_id`.

**Critical:** Add `student_status` update to `students:update` handler in `core.js`:
```javascript
// In students:update handler, after updating students table:
if (data.class_id && currentTerm) {
  db.prepare(`INSERT INTO student_status (student_id, session_id, term_id, class_id, status, is_new_student)
    VALUES (?,?,?,?,'active',0)
    ON CONFLICT(student_id, term_id) DO UPDATE SET class_id=excluded.class_id`)
    .run([data.id, currentTerm.session_id, currentTerm.id, data.class_id])
}
```

---

### A4. Student Photo Upload Not Working

**Bug:** `pickPhoto` calls `window.api.pickPhoto()` but the handler in `core.js` may not have a file filter or the path returned may be an array vs string.

**Fix — verify `handlers/core.js` `students:pick-photo`:**
```javascript
ipcMain.handle('students:pick-photo', async () => {
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog({
    title: 'Select Student Photo',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]  // ← must return string, not array
})
```
Also verify `preload.js` maps `pickPhoto` to `students:pick-photo`.

**Additional fix:** Photos need to be COPIED to app's `database/photos/` folder on save, not just referenced by the original path (which may be on USB or elsewhere):
```javascript
// In students:create and students:update handlers:
if (data.photo_path && !data.photo_path.startsWith(dbDir)) {
  const ext  = path.extname(data.photo_path)
  const dest = path.join(dbDir, 'photos', `student_${data.id || Date.now()}${ext}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(data.photo_path, dest)
  data.photo_path = dest
}
```

---

### A5. Bill Waiver Not Recalculating Total

**Bug:** When a bill is waived, the total at the bottom of StudentBillPage stays the same instead of reducing.

**Root cause:** The waive handler updates `student_bills.status = 'waived'` but `bills:student-summary` includes waived bills in `billTotal`:
```javascript
const billTotal = bills.reduce((s, b) => s + Number(b.amount), 0) // ← includes waived!
```

**Fix — in `billing.js` `bills:student-summary`:**
```javascript
const billTotal = bills.reduce((s, b) => 
  b.status === 'waived' ? s : s + Number(b.amount), 0)
```
This single-line fix makes waived items excluded from total, affecting:
- `bill_total`
- `total_expected`  
- `balance`
- Account report (since it queries student_bills excluding waived)

**Also fix in Account Report query** — filter `AND sb.status != 'waived'` wherever `student_bills` is summed.

---

### A6. Adjustment Removed from Sidebar Menu

**Bug:** The sidebar in `Sidebar.jsx` only shows `Generate Bills` and `Carry-over` under Billing. There's no link to adjustments.

**Fix — in `src/components/layout/Sidebar.jsx`:**
Adjustments are per-student (accessed from StudentBillPage), not a standalone page. The real issue is that users can't find adjustments. Two solutions:
1. Add a "Student Bills" menu item linking to `/students` with a note it's accessed per student.
2. Better: Add a shortcut to `/billing/adjustments` as a standalone list view showing all adjustments for the current term.

**Recommended:** Add `/billing/adjustments` route — a page showing all adjustments across all students for current term, with ability to add/remove per student. Add it to sidebar under Billing.

---

### A7. Account Report Not Balanced / Payment Total Mismatch

**Root cause (Critical):** Two payment total calculations exist and diverge:
- `payment_items.amount_applied` (allocated to specific bill lines)  
- `payments.amount_paid` (the actual cash received)

The system uses both in different places. `bills:student-summary` takes `MAX(paid, directPaid)` which is wrong when partial allocations exist.

**Fix strategy:**
1. **Single source of truth for "amount collected":** Always use `SUM(payments.amount_paid) WHERE is_reversed=0` — this is actual cash.
2. **Bill balance calculation:**
   ```
   balance = total_expected - SUM(payments.amount_paid WHERE is_reversed=0)
   ```
3. **Account report** must use the same source — never `payment_items`.
4. Remove `MAX(paid, directPaid)` — use only `directPaid` from `payments` table.
5. The `payment_items` table exists for future allocation tracking but is currently creating confusion. **Ignore it for all balance calculations.** Only use it if you add payment allocation UI later.

---

### A8. New Session — Terms Not Getting "Set as Current" Button

**Bug:** After inserting a new session, its terms show but the "Set as Current" button doesn't appear or clicking it doesn't work.

**Fix — in `handlers/core.js` `sessions:set-current`:**
```javascript
ipcMain.handle('sessions:set-current', (_, sessionId, termId) => {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE sessions SET is_current=0').run([])
    db.prepare('UPDATE terms SET is_current=0').run([])
    db.prepare('UPDATE sessions SET is_current=1 WHERE id=?').run([sessionId])
    db.prepare('UPDATE terms SET is_current=1 WHERE id=?').run([termId])
    db.exec('COMMIT')
    return { ok: true }
  } catch (e) {
    db.exec('ROLLBACK')
    return { ok: false, error: e.message }
  }
})
```
Also verify `SessionsPage.jsx` calls `window.api.setCurrentSession(sessionId, termId)` with both arguments.

---

### A9. Viewer Role Can Post/Adjust Bills — Role Enforcement Broken

**Bug:** A user with role 'viewer' should be read-only but can currently post payments and modify bills.

**Fix:** Add role guard in the React context and IPC handlers.

**Frontend guard — in `src/context/AuthContext.jsx`:**
```javascript
const canEdit = user?.role !== 'viewer'
const canAdmin = user?.role === 'admin'
// expose in context
```

**Use in pages:**
```javascript
const { canEdit, canAdmin } = useAuth()
// Disable/hide buttons:
{canEdit && <button onClick={handlePost}>Post Payment</button>}
```

**Pages that need the guard (viewer must not access):**
- PostPaymentPage — hide entirely, redirect to /payments
- StudentBillPage — hide Add Adjustment, Waive, Regenerate buttons
- GenerateBillsPage — hide entirely
- CarryoverPage — hide entirely  
- UsersPage — admin only
- DevSettingsPage — devmaster only (already gated)

**Backend guard (belt + suspenders) — in each write handler:**
```javascript
// Not needed for SQLite since auth is in-process, but validate at handler level:
ipcMain.handle('payments:post', (_, data) => {
  // data.posted_by comes from frontend user context — if role is viewer, reject
  // This is enforced by the UI; backend trust is acceptable for offline desktop app
})
```

---

## SECTION B — ARCHITECTURAL IMPROVEMENTS

### B1. Dynamic Bill Calculation (Hybrid Approach — Developer Decision)

**Current problem:** Bills are generated once manually. Changing student criteria (class, gender, boarding, entry_type) after generation leaves stale bills.

**Agreed solution: Hybrid** — keep `student_bills` rows for audit history, but auto-recalculate on every relevant change.

**Trigger auto-recalculate on:**
1. Student profile change (class, gender, boarding_type, entry_type)
2. Bill config change (amount updated for class/term)
3. Fee item activated/deactivated
4. Waive/reinstate bill item
5. Add/remove adjustment
6. Term change or promotion

**Implementation — `bills:auto-recalculate-student` handler:**
```javascript
// Recalculates bills for a single student in their current term
// Called after any student profile or config change
ipcMain.handle('bills:auto-recalculate-student', (_, { student_id, term_id }) => {
  const db = getDb()
  // Get student's current status (class, entry_type etc.)
  // Re-run the same eligibility logic as generate-class
  // INSERT OR REPLACE bill rows
  // Return updated summary
})
```

**When to call this:**
- After `students:update` → call `bills:auto-recalculate-student`
- After `bill-config:upsert` → call for all students in that class/term
- After `bills:waive` → summary already recalculates, no stored change needed

**Keep Generate Bills for first-time generation** (bulk seeding a new term). Don't remove it — just make it idempotent and trigger auto-recalc instead of raw insert.

---

### B2. What Happens to Bill When Student Criteria Changes

**Decision matrix (implement all):**

| Change | Effect |
|---|---|
| Class changes | Remove bills that don't apply to new class, add new ones |
| Gender changes (rare) | Recalculate gender-specific fee items |
| boarding_type changes | Recalculate boarding-specific fees |
| entry_type new→returning | Remove "new student only" fees, add "returning only" fees |
| Student becomes inactive | Freeze all current bills, no changes |
| Student reactivated | Unfreeze, recalculate from current config |
| Fee item amount changes | Update all student_bills for that fee_item in that term |

**Important edge case:** If a student has already paid for a fee item that's now being removed from their bill (e.g. they moved class), do NOT remove the payment. Mark the old bill as `status='superseded'` and keep the payment. The balance calculation adjusts accordingly.

Add `'superseded'` to `student_bills.status` CHECK constraint via migration.

---

### B3. Remove "Generate Bills" from the UI — Keep Backend

**Sidebar change:** Remove "Generate Bills" menu item. The page can remain accessible at `/billing/generate` for developer use but not shown in nav.

**Instead:** Bills auto-generate when:
- A student is added to a class for a term → generate their bills immediately
- Bills are fully auto-seeded on `students:change-term` and `students:promote`

**Safety:** The generate endpoint remains idempotent (`INSERT OR IGNORE`) so running it twice never duplicates.

---

### B4. View Bill Button on Students Table

**Add to `StudentsPage.jsx`:**
- In the actions column of each student row, add a "Bill" button (or icon) linking to `/billing/student/:id`
- Also show a quick balance chip: `₦12,500 due` in red or `✓ Paid` in green

---

## SECTION C — PRINTING & FEE STATEMENT

### C1. Fee Statement — New Document (Separate from Receipt)

Create `/billing/student/:id/statement` or render as a modal print.

**Fee Statement contains:**
- School name + logo + address + phone
- School bank name + account number + account name
- Student name, reg number, class
- Term and session
- Table of all fee items with amounts
- Adjustments (discounts/additions)
- Previous term balance
- Total expected
- Total paid (with list of payment receipts)
- Balance outstanding
- Statement date

**Print separately from receipt.** Add "Statement" button on StudentBillPage alongside existing buttons.

**Printer settings compliance:** Use CSS `@page` rule with dynamic size based on settings:
```css
@page { size: A4 portrait; margin: 15mm; }
/* For thermal: */
@page { size: 80mm auto; margin: 3mm; }
```
Read `school_settings.thermal_width` and apply dynamically via JS before printing:
```javascript
const style = document.createElement('style')
style.textContent = `@page { size: ${width} auto; margin: 3mm; }`
document.head.appendChild(style)
window.print()
document.head.removeChild(style)
```

---

### C2. Printer Settings Page + Test Print

**Add to `SettingsPage.jsx` — new "Printer" tab:**
- Default print size: A4 / Thermal 80mm / Thermal 58mm
- Number of copies (for receipt auto-print)
- Receipt footer text
- **Test Print button** → opens a sample receipt in the print dialog

---

## SECTION D — ACCOUNTING MODULE

### D1. Default State: Hidden Until Devmaster Activates

**Current:** `accounting_enabled` in `app_state`. Already gated by devmaster in Dev Settings.

**Clarify for next session:** The accounting module is currently accessible only when `accounting_enabled = 1` in `app_state`. This is flipped by devmaster login in Dev Settings. This is the correct behavior — no change needed to the gate. What needs fixing:

1. The default chart of accounts is already seeded in `database.js seedDefaults()`. Verify it matches the structure below.
2. Auto-generate journal entries when payments are posted (currently missing).

### D2. Standard Chart of Accounts (D365 F&O Style)

Seed these by default (already partially done — verify and complete):

```
ASSETS
  1000 - Cash on Hand
  1010 - Bank Account (Main)
  1020 - Bank Account (Secondary)
  1100 - Accounts Receivable (School Fees)
  1200 - Prepaid Expenses

LIABILITIES
  2000 - Accounts Payable
  2100 - Accrued Expenses

EQUITY
  3000 - School Capital/Fund

INCOME
  4000 - School Fees Income
  4010 - PTA Levy Income
  4020 - Uniform/Books Income
  4030 - Other Income

EXPENSES
  5000 - Staff Salaries
  5010 - Utilities (NEPA, Generator)
  5020 - Maintenance & Repairs
  5030 - Teaching Materials
  5040 - Administrative Expenses
  5050 - Bank Charges
  5060 - Other Expenses
```

### D3. Auto-Journal on Payment Post (Critical for Balance)

**Root cause of account report not balancing:** Payments are posted to `payments` table but no journal entry is automatically created. The accounting module and fee collection report are two separate systems that never talk to each other.

**Fix:** When a payment is posted, automatically create a journal entry:
```
Dr: 1010 Bank Account (Main)          amount_paid
  Cr: 4000 School Fees Income          amount_paid
```

**In `handlers/payments.js` `payments:post` handler**, after INSERT:
```javascript
// Auto-journal only if accounting is enabled
const acctEnabled = db.prepare("SELECT value FROM app_state WHERE key='accounting_enabled'").get()?.value
if (acctEnabled === '1') {
  const bankAcc = db.prepare("SELECT id FROM accounts WHERE code='1010'").get()
  const feeAcc  = db.prepare("SELECT id FROM accounts WHERE code='4000'").get()
  if (bankAcc && feeAcc) {
    const ref = 'AUTO-PMT-' + receiptNumber
    const entryId = db.prepare(`INSERT INTO journal_entries (reference, description, entry_date, entry_type, posted_by)
      VALUES (?,?,date('now'),'payment',?)`).run([ref, `Payment received: ${receiptNumber}`, data.posted_by]).lastInsertRowid
    db.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit, credit)
      VALUES (?,?,?,0)`).run([entryId, bankAcc.id, data.amount_paid])
    db.prepare(`INSERT INTO journal_lines (entry_id, account_id, debit, credit)
      VALUES (?,?,0,?)`).run([entryId, feeAcc.id, data.amount_paid])
  }
}
```

**On payment reversal:** Reverse the journal entry (Cr bank, Dr income).

---

## SECTION E — REVERSAL SYSTEM

### E1. What Can Be Reversed

| Item | Reversal method | Effect |
|---|---|---|
| Payment | Already works (REV- entry) | Reduces total paid, increases balance |
| Bill adjustment | Delete (soft delete — add `is_reversed` flag) | Re-calculate bill total |
| Carryover | Delete with confirmation | Removes carry-over balance |
| Waived bill | Already works (Reinstate button) | Re-adds item to total |
| Student status | Not reversible — use Change Term instead | — |
| Journal entry | Reverse entry (standard accounting) | Creates equal/opposite entry |

**Add `is_reversed` + `reversal_reason` + `reversed_by` columns to `bill_adjustments`** via migration.

---

## SECTION F — INACTIVE STUDENTS

### F1. Behavior When Student Goes Inactive

**Agreed decision:** Freeze immediately.

**Implementation:**
1. `student_status.status = 'inactive'` — already exists.
2. When status becomes inactive:
   - Bills remain in `student_bills` (frozen — no recalculation)
   - Student hidden from active class lists
   - Student still appears in debtors list if they have outstanding balance
   - Student still appears in payments history
   - Cannot post new payments (block at PostPaymentPage level)
3. If reactivated: recalculate bills from current config.
4. **Never delete bill rows** for inactive students — bills are historical records.

---

## SECTION G — IMPORT & OPENING BALANCES

### G1. Excel Import Validation (Duplicate Prevention)

**Fix in `handlers/core.js` `import:students`:**
Check for duplicates before inserting:
```javascript
// Before insert, check reg_number + name combo
const existing = db.prepare('SELECT id FROM students WHERE reg_number=?').get([row.reg_number])
if (existing) {
  errors.push({ row: i+1, reason: `Reg number ${row.reg_number} already exists` })
  skipped++
  continue
}
```

Also validate:
- Required fields (first_name, last_name, gender, reg_number)
- Gender must be M or F
- Class name must match an existing class
- Duplicate reg numbers within the import file itself

Return detailed error report: `{ imported: N, skipped: N, errors: [{row, reason}] }`

Show errors in UI as a collapsible error list after import.

### G2. Opening Balances Import (First-Time Setup)

**New page: `/import/opening-balances`**

For schools switching from manual records, they need to import current outstanding balances without re-entering all historical payments.

**Excel template columns:**
```
Reg Number | Student Name | Opening Balance (₦)
```

**Handler `import:opening-balances`:**
- For each row, insert into `previous_term_balance`:
  ```
  from_term_id = NULL (or a special "Opening Balance" sentinel term)
  to_term_id   = current term
  balance_amount = amount from Excel
  ```
- Use `INSERT OR REPLACE` so re-importing updates values
- Log as audit event

**UI:** Add to Import section in sidebar. Simple: upload Excel, preview table, confirm import.

---

## SECTION H — GOOGLE DRIVE BACKUP (BOTH OPTIONS)

### H1. Simple Folder-Path Option (Easier for Most Schools)

Schools likely already have Google Drive or OneDrive desktop app installed which syncs a local folder. Simplest approach:

**In BackupPage, add a "Cloud Folder Sync" card:**
1. User picks a local folder path (e.g. `C:\Users\Admin\Google Drive\SchoolFees Backups`)
2. Every backup also copies to that folder
3. Since Google Drive/OneDrive desktop apps sync that folder automatically → it's in the cloud

**Handler `backup:set-sync-folder`:** Saves folder path to `scheduler_config.json`.
**Modify `scheduler.js`:** After local backup, also copy to sync folder if configured.

This is simpler than OAuth and requires zero Google Cloud setup.

### H2. OAuth Option — What's Needed

The OAuth Google Drive backup built in the last session requires:
1. Developer creates a Google Cloud project at console.cloud.google.com
2. Enables Google Drive API
3. Creates OAuth 2.0 credentials (Desktop App)
4. Embeds Client ID + Client Secret in the app (or lets user enter them)

**Recommendation:** Ship with the folder-sync option working out of the box. OAuth option stays but is optional/advanced. The existing `BackupPage.jsx` already has both UI sections.

---

## SECTION I — SMS RECEIPT ON PAYMENT POST

### I1. Auto-SMS After Payment

**In `handlers/payments.js` `payments:post`:**
After successful insert, if `settings.sms_enabled`:
```javascript
const message = `Dear ${parentName}, payment of ${currency}${amount} received for ${studentName}. Receipt: ${receiptNumber}. Balance: ${currency}${balance}. ${schoolName}`
// Call SMS provider (already implemented in communications.js)
```

Add checkbox on `PostPaymentPage.jsx`: "Send SMS to parent" (default: on if SMS enabled).

---

## SECTION J — TESTING TOOLS

### J1. Test Print, SMS, and Email in Settings

**In `SettingsPage.jsx`:**

**Email tab** — already has test email button. Verify it works with the nodemailer implementation.

**SMS tab** — add "Send Test SMS" button:
- Input field for test phone number
- Button calls `window.api.testSms({ phone, provider_key })`
- Shows success/fail with provider response

**Printer tab (new)** — add "Test Print" button:
- Generates a sample receipt with dummy data
- Opens print dialog
- User can verify the layout, margins, and thermal width

---

## KNOWN BUGS SUMMARY TABLE

| # | Bug | File to fix | Priority |
|---|---|---|---|
| A2 | New→Returning not auto-updating | handlers/core.js | HIGH |
| A3 | Class dropdown blank in edit mode | StudentForm.jsx + core.js | HIGH |
| A4 | Photo upload broken | core.js pick-photo handler | HIGH |
| A5 | Waive not recalculating total | billing.js student-summary | HIGH |
| A6 | Adjustments missing from sidebar | Sidebar.jsx | MEDIUM |
| A7 | Payment total mismatch in reports | billing.js + AccountReportPage | HIGH |
| A8 | New session terms no Set Current | core.js + SessionsPage | HIGH |
| A9 | Viewer role can post/adjust | AuthContext + page guards | HIGH |

---

## DEVELOPMENT ORDER FOR NEXT SESSION

```
1. Fix A3 (class dropdown in edit) — blocks all editing
2. Fix A4 (photo upload)
3. Fix A2 (new→returning on term change)
4. Fix A5 (waive recalculation)
5. Fix A7 (payment total source of truth)
6. Fix A8 (session current term button)
7. Fix A9 (role guards)
8. Fix A6 (adjustments in sidebar)
9. B4 (view bill on students table)
10. C1 (fee statement with school header)
11. C2 (printer settings + test print)
12. D3 (auto-journal on payment)
13. G1 (Excel import duplicate validation)
14. G2 (opening balances import)
15. H1 (folder-path cloud sync)
16. I1 (auto-SMS on payment)
17. J1 (test SMS in settings)
```

---

## FILES TO READ AT SESSION START

Always clone fresh and read:
1. `HANDOFF.md` — full project context
2. `DESIGN.dm` — platform design
3. `school-feesmgt_cont.md` — this file
4. `git log --oneline -5` — last commits
5. Key files depending on task:
   - `electron/handlers/core.js` — student, class, term handlers
   - `electron/handlers/billing.js` — bill logic
   - `electron/handlers/payments.js` — payment + reversal
   - `electron/lib/database.js` — schema
   - `src/pages/students/StudentForm.jsx` — student edit
   - `src/pages/billing/StudentBillPage.jsx` — bill UI

---

## CRITICAL RULES (Never Violate)

- DB params always arrays: `.run([a, b, c])` not `.run(a, b, c)`
- Currency always `useAuth().fmt()` — never hardcode ₦
- Never use `better-sqlite3` — only `node-sqlite3-wasm`
- No `@apply` inside `@media print` blocks
- All IPC handlers return `{ ok, error }` — never throw uncaught
- `node-sqlite3-wasm` calls are synchronous — no `await` on them
- Push after every significant change: `git add -A && git commit -m "..." && git push`

