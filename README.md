# SchoolFees Manager

Desktop school fees management application for Nigerian secondary schools.
Built with Electron + React + SQLite (node-sqlite3-wasm).

---

## Quick Start

```bash
git clone https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager.git
cd schoolfees-manager
npm install
npm run dev
```

### Load Demo Database
```bash
mkdir -p database
cp demo/demo.db database/schoolfees.db
npm run dev
```
Demo login: `admin` / `admin123`

---

## Activation Keys

> ⚠️ **PRIVATE — Do not share this file publicly. Set repo to Private on GitHub.**

Keys are validated offline (no internet required). When the activation server
is ready, online keys will also be supported automatically.

---

### 🔑 Master Keys — Developer Only (Unlimited Students)

| Key | Purpose |
|-----|---------|
| `A84F-6D73-0E74-BFF2` | Primary master key (Ojuoye) |
| `61C3-84C9-EF8B-D3CC` | Backup master key |

---

### 🟡 Demo Keys — For Agent Demos (5 Students, Reusable)

Agents use these to demonstrate the software to prospects.
The same key can be reused by different schools.

```
9A74-A306-A704-BED5
F6E3-8FB1-E8C3-39A1
A836-51E7-90E4-515C
E705-844C-E311-DB2A
7E9D-E790-FE21-1323
4930-3454-AE4B-8414
07D9-DEEC-927D-208E
FCFA-A7B6-50C2-FA85
04C2-FC2E-5A09-1949
2901-8A46-DA09-D114
F952-9C33-4528-A422
02BA-601C-E5D3-5570
C281-967B-8984-D703
F06D-CDBE-5CCA-5997
5BB1-E43B-9764-2468
```

---

### 🔵 Standard Keys — 500 Students (One-time Payment)

Each key is for one school installation.

```
3F30-A570-E2F7-9B2F
C2DD-99F7-2AA2-4119
0387-9761-C7F6-DFEA
44F8-D2DA-AA34-6932
18B0-8A23-CF3F-98FA
09CA-5AFB-2718-CCF0
5669-2DBE-AC0A-ED0F
A25B-2B55-0719-97EE
295F-02C2-4B19-EBA7
60A8-3872-D2C9-02AA
```

---

### 🟢 Unlimited Keys — Full License (One-time Payment)

```
4126-C22C-8EAC-AFFF
897D-6B81-AE3D-8BBC
409D-3413-0C0D-7155
BD89-21CB-1F43-730F
FB50-A13D-84EB-698B
7245-5DEA-FD72-0C90
3E4F-D2AD-E103-283D
E0D2-8B88-7FF5-4A4B
85C9-3CEE-2858-C09D
D3D9-3D22-E363-5103
```

---

## Key Generation

Keys are HMAC-SHA256 derived from a secret seed. To generate more keys:

```bash
node -e "
const crypto = require('crypto')
const SECRET = 'SF_MASTER_SECRET_2025_OJUOYE'
function makeKey(seed) {
  const h = crypto.createHash('sha256').update(SECRET+':'+seed).digest('hex').toUpperCase()
  return h.slice(0,4)+'-'+h.slice(4,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)
}
// Change seed to generate new keys
console.log(makeKey('STD_500STUDENTS_011'))
console.log(makeKey('FULL_UNLIMITED_011'))
console.log(makeKey('DEMO_5STUDENTS_016'))
"
```

---

## Project Structure

```
electron/
  main.js                  ← Entry point, loads all handlers
  preload.js               ← Secure IPC bridge (window.api)
  lib/
    database.js            ← SQLite connection, full schema, seed defaults
    defaults.js            ← Editable default classes, fee items, accounts
  handlers/
    activation.js          ← License key validation (offline + online)
    auth.js                ← Login, users, password management
    settings.js            ← School settings, currency, SMS/email config
    core.js                ← Sessions, terms, classes, students
    fees.js                ← Fee items, bill config, copy config
    billing.js             ← Generate bills, adjustments, carry-over
    payments.js            ← Post payments, receipts, debtors
    accounting.js          ← Accounts, journal, invoices, ledger
    communications.js      ← SMS and email (provider-ready structure)
    backup.js              ← Local backup and restore

src/
  main.jsx                 ← React entry + AuthProvider
  App.jsx                  ← Auth gate + all routes
  context/
    AuthContext.jsx        ← User session, currency formatter
  lib/
    utils.js               ← fmt(), fmtDate(), import helpers
  components/
    layout/
      Sidebar.jsx          ← Navigation with collapsible groups
      Layout.jsx           ← Page wrapper
    ui/
      index.jsx            ← Modal, DataTable, Field, Badge, Spinner...
  pages/
    auth/                  ← ActivationScreen, LoginScreen, SetupWizard
    dashboard/             ← Dashboard with real metrics
    students/              ← List, form, promote, import
    fees/                  ← Fee items, bill config, copy, preview
    billing/               ← Generate bills, adjustments, carry-over
    payments/              ← Post payment, history, receipts, debtors
    accounting/            ← Accounts, journal, ledger, trial balance, invoices
    reports/               ← Account report, bulk SMS
    settings/              ← School settings, dev settings
    users/                 ← User management
    import/                ← Excel student import

demo/
  demo.db                  ← Demo database (Bright Future Academy)
  README.md                ← Demo data details

seed_demo.js               ← Regenerate demo database
```

---

## Demo Data (demo/demo.db)

| | |
|---|---|
| School | Bright Future Academy, Lagos |
| Session | 2024/2025 First Term |
| Students | 25 across JSS 1 – SS 3 |
| Total Billed | ₦1,858,000 |
| Collected | ₦608,000 (33%) |
| Debtors | 13 students |
| Admin login | `admin` / `admin123` |
| Bursar login | `bursar` / `bursar123` |

---

## Developer Login (always available)

Username: `devmaster`
Password: `SF@Dev#2025!secure`

Access: Full access to all pages including Dev Settings.
This login is hardcoded and does not appear in the users list.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| UI | React + Vite + Tailwind CSS |
| Database | SQLite via node-sqlite3-wasm (no build tools) |
| PDF / Print | Browser print API with thermal CSS |
| Excel export | SheetJS (xlsx) |
| Forms | react-hook-form |
| Icons | lucide-react |
| Notifications | react-toastify |
