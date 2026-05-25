# SchoolFees Manager — Platform Design Document
**Version:** 2.0  
**Owner:** Ojuoye Moshood Olawale  
**Status:** Active Development  
**Last Updated:** May 2026

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Activation System — Correct Algorithm](#2-activation-system--correct-algorithm)
3. [Agent Portal](#3-agent-portal)
4. [Admin Management Dashboard](#4-admin-management-dashboard)
5. [Activation Server Backend](#5-activation-server-backend)
6. [Landing Page & Marketing Site](#6-landing-page--marketing-site)
7. [Careers & Agent Application Page](#7-careers--agent-application-page)
8. [Licensing Tiers & Pricing](#8-licensing-tiers--pricing)
9. [Technology Stack — Full Platform](#9-technology-stack--full-platform)
10. [Roadmap](#10-roadmap)

---

## 1. Product Vision

SchoolFees Manager is an **offline-first Windows desktop application** for Nigerian secondary schools.  
It is sold as a **one-time licensed .exe** per school, distributed through a network of **sales agents**.

The platform has four parts:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Desktop App (Electron)          — Schools use daily         │
│  2. Activation Server (Node.js API) — Validates license keys    │
│  3. Agent Portal (Web App)          — Agents manage prospects   │
│  4. Admin Dashboard (Web App)       — You manage everything     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Activation System — Correct Algorithm

### 2.1 Current State (Offline Keys)

The current implementation uses **HMAC-SHA256 derived offline keys**.  
These work without a server but have limitations — keys cannot be revoked,  
and demo keys can be shared without tracking.

**Current flow:**
```
User enters key → App computes HMAC locally → Matches = Activated
```

### 2.2 Target Algorithm (Online with Offline Fallback)

The correct production algorithm uses **server-validated one-time PIN codes**  
with machine binding and offline grace period.

#### Activation Flow (Step by Step)

```
STEP 1 — Agent generates a PIN
  Agent logs into Agent Portal
  Agent selects school (prospect) from their list
  Agent clicks "Generate Activation PIN"
  Server creates a record:
    {
      pin:          "847291",           // 6-digit one-time code
      school_name:  "Bright Future Academy",
      agent_id:     "AGT-0042",
      tier:         "standard",
      max_students: 500,
      status:       "unused",           // unused | active | revoked
      created_at:   "2025-01-15",
      expires_at:   "2025-01-22",       // PIN valid for 7 days
      machine_id:   null                // set on first activation
    }
  
STEP 2 — School downloads and installs the app
  School downloads installer from schoolfeesmanager.com
  Installs on their Windows PC
  App opens to Activation Screen

STEP 3 — School enters PIN + School Name
  Input: School Name + 6-digit PIN (simpler than XXXX-XXXX-XXXX-XXXX)
  App collects:
    - school_name (entered by user)
    - pin (entered by user)
    - machine_id (SHA256 of hostname + CPU + MAC address)
    - app_version

STEP 4 — App calls activation server
  POST https://api.schoolfeesmanager.com/v1/activate
  Body: { pin, school_name, machine_id, app_version }

STEP 5 — Server validates
  Checks:
    ✓ PIN exists in database
    ✓ PIN status == 'unused'
    ✓ PIN not expired (created_at + 7 days)
    ✓ school_name fuzzy matches stored school_name (Levenshtein distance < 5)
  
  If valid:
    Update record:
      status = 'active'
      machine_id = <from request>
      activated_at = now()
    
    Return:
      {
        ok: true,
        license_key: "LK-2025-A84F6D73",   // permanent key stored in app
        school_name: "Bright Future Academy",
        tier: "standard",
        max_students: 500,
        accounting_enabled: false,
        expires_at: null,                   // one-time payment = no expiry
        agent_id: "AGT-0042"
      }
  
  If invalid:
    Return: { ok: false, error: "Invalid or expired PIN" }

STEP 6 — App stores activation locally
  Saves to SQLite activation table:
    license_key, school_name, tier, max_students,
    machine_id, activated_at, accounting_enabled

STEP 7 — App works fully offline after this point
  No further server calls needed for normal operation
  School uses the app daily without internet

STEP 8 — Periodic silent re-verification (optional)
  Once per week, if internet available:
  GET https://api.schoolfeesmanager.com/v1/verify
  Body: { license_key, machine_id }
  
  Server checks:
    ✓ License not revoked
    ✓ machine_id matches (prevents key sharing)
  
  If revoked:
    App shows warning but continues for 30-day grace period
    After grace period: read-only mode (can view, cannot add students/payments)
```

#### Machine ID Algorithm (Correct Implementation)

```javascript
// Combine multiple hardware identifiers for stronger binding
const crypto = require('crypto')
const os = require('os')

function getMachineId() {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    // Primary network interface MAC address
    Object.values(os.networkInterfaces())
      .flat()
      .find(i => !i.internal && i.mac !== '00:00:00:00:00:00')?.mac || '',
    // CPU model
    os.cpus()[0]?.model || '',
  ]
  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .slice(0, 32)  // 32 chars is enough
}
```

#### License Key Format (Permanent Key)

After activation, the server issues a permanent license key stored in the DB:

```
Format:  LK-YYYY-XXXXXXXX
Example: LK-2025-A84F6D73

Where:
  LK    = SchoolFees License
  YYYY  = Year of issue
  XXXX  = 8 hex chars from HMAC(school_name + machine_id + secret)
```

This key is what the app uses for periodic re-verification — not the PIN.  
The PIN is one-time only and cannot be reused.

#### Security Rules

| Rule | Implementation |
|---|---|
| PIN is one-time only | Status set to 'active' on first use, rejected on reuse |
| PIN expires in 7 days | Server checks created_at + 7 days |
| Key bound to one machine | machine_id stored on first activation, validated on re-verify |
| Revocation | Server sets status = 'revoked', app enters read-only after grace |
| Transfer to new PC | Agent can reset machine_id from portal (one transfer per year) |
| Demo keys | 5-student limit enforced server-side, not just client-side |

### 2.3 Offline Key Validation (Current — Keep as Fallback)

The current HMAC offline keys remain as a **fallback** for:
- Developer testing without internet
- Schools in areas with no internet during initial setup
- Emergency reactivation if server is down

Offline keys are hardcoded in `activation.js` and should never be shared  
beyond trusted developers and a small stock of emergency keys.

### 2.4 Validation Logic (Priority Order)

```javascript
async function validateActivation(pin, school_name, machine_id) {
  // Priority 1: Try online server first
  try {
    const result = await callActivationServer(pin, school_name, machine_id)
    if (result.ok) return result
    if (result.error) return { ok: false, error: result.error }
  } catch (networkError) {
    // Server unreachable — fall through to offline check
  }

  // Priority 2: Check offline/emergency keys
  const offlineResult = checkOfflineKeys(pin)
  if (offlineResult) {
    return { ...offlineResult, ok: true, offline: true }
  }

  // Priority 3: Meaningful error message
  return {
    ok: false,
    error: 'Invalid activation code. If you have no internet, contact your sales agent for an offline key.'
  }
}
```

---

## 3. Agent Portal

The Agent Portal is a **separate web application** (React + Node.js API)  
hosted online. Agents log in here to manage their prospects and generate activation PINs.

### 3.1 Agent Roles & Permissions

| Role | Access |
|---|---|
| Super Admin (you) | Full access — all agents, all schools, revenue, payouts |
| Agent | Own prospects only, generate PINs, view commissions |
| Support | View all schools, reset machines, cannot generate PINs |

### 3.2 Agent Portal Pages

#### Dashboard
- Total prospects in pipeline
- Activated schools (paying clients)
- Pending demos (demo key issued, not yet converted)
- Commission earned this month / total
- Recent activity feed

#### Prospects List
- School name, contact, location, state
- Status: `contacted` → `demo_given` → `activated` → `paying`
- Filter by status, state, date
- Search by school name

#### Add Prospect
- School name (required)
- Principal name, phone, email
- School address, state, LGA
- School type (public/private), level (JSS/SS/both)
- Estimated student count
- Notes

#### Generate Activation PIN
- Select prospect from list
- Select tier (demo / standard / unlimited)
- Select add-ons (accounting module: +₦X,000)
- Set max students
- Click Generate → Server creates PIN
- PIN displayed once, agent sends to school via WhatsApp/SMS
- PIN auto-expires in 7 days (configurable)

#### My Schools (Activated)
- All schools activated under this agent
- School name, tier, activation date, student count
- Actions: Reset machine (PC transfer), view statement

#### Commission Tracker
- Per-sale commission (e.g. 20% of sale price)
- Pending payout / paid out
- Sales history with dates
- Bank account for payout (agent fills in)

#### Machine Reset (Support)
- Agent can request machine reset for their school
- Super Admin approves or auto-approves based on rules
- One free reset per year per school

### 3.3 Agent Onboarding Flow

```
1. Agent applies at careers page (schoolfeesmanager.com/careers)
2. Admin reviews application and approves
3. System sends agent login credentials
4. Agent completes profile (bank details, region, photo ID)
5. Agent receives onboarding kit:
   - Demo installer download link
   - Demo key (to show prospects)
   - Sales guide PDF
   - WhatsApp group invite
6. Agent starts adding prospects
```

---

## 4. Admin Management Dashboard

You (the developer/owner) have a separate admin web app to manage everything.

### 4.1 Admin Pages

#### Overview Dashboard
- Total activated schools
- Revenue this month / all time
- Active agents, new agents this month
- Pending machine reset requests
- Server health status

#### Schools Management
- All activated schools (searchable)
- School details: name, agent, tier, activation date, last active
- Actions: revoke, upgrade tier, enable accounting, reset machine
- Export to Excel

#### Agents Management
- All agents (approved, pending, suspended)
- Per-agent: schools count, revenue, commission owed
- Approve/reject new agent applications
- Suspend agent (their PINs stop working)
- Process commission payouts

#### License Key Management
- All PINs generated: used, unused, expired, revoked
- Generate batch of offline emergency keys
- Revoke any key instantly
- See which machine a key is bound to

#### Revenue & Payouts
- Total revenue by month, tier, agent, state
- Commission calculations
- Mark commissions as paid
- Bank transfer records

#### Feature Flags (Per School)
- Toggle accounting module on/off per school
- Increase student limit
- Set custom expiry
- Add-on modules (future: SMS, Google Drive, etc.)

#### Server Settings
- Activation server endpoint URL
- PIN expiry duration (default 7 days)
- Grace period for revoked keys (default 30 days)
- Commission rate per tier
- Offline key secret (rotate periodically)

---

## 5. Activation Server Backend

### 5.1 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express.js |
| Database | PostgreSQL (Supabase free tier to start) |
| Auth | JWT for agent/admin portals |
| Hosting | Railway.app or Render.com (free tier available) |
| Domain | api.schoolfeesmanager.com |

### 5.2 API Endpoints

```
POST   /v1/activate              — School activates with PIN
GET    /v1/verify                — Silent background re-verify
POST   /v1/agent/login           — Agent portal login
POST   /v1/agent/prospect        — Add new prospect
POST   /v1/agent/generate-pin    — Generate activation PIN
GET    /v1/agent/prospects       — List agent's prospects
GET    /v1/agent/schools         — List activated schools
POST   /v1/agent/reset-machine   — Request machine transfer
POST   /v1/admin/login           — Admin portal login
GET    /v1/admin/schools         — All schools
GET    /v1/admin/agents          — All agents
PUT    /v1/admin/school/:id      — Update school (revoke, upgrade)
PUT    /v1/admin/agent/:id       — Approve/suspend agent
GET    /v1/admin/revenue         — Revenue reports
POST   /v1/admin/generate-keys   — Generate emergency offline keys
```

### 5.3 Database Schema (PostgreSQL — Server Side)

```sql
-- Agents
CREATE TABLE agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  state       TEXT,
  bank_name   TEXT,
  account_number TEXT,
  status      TEXT DEFAULT 'pending',  -- pending|active|suspended
  commission_rate DECIMAL DEFAULT 20.00,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Prospects
CREATE TABLE prospects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID REFERENCES agents(id),
  school_name TEXT NOT NULL,
  principal   TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  state       TEXT,
  lga         TEXT,
  est_students INTEGER,
  status      TEXT DEFAULT 'contacted',
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Activation PINs
CREATE TABLE activation_pins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin          TEXT UNIQUE NOT NULL,         -- 6-digit code
  prospect_id  UUID REFERENCES prospects(id),
  agent_id     UUID REFERENCES agents(id),
  tier         TEXT NOT NULL DEFAULT 'demo',
  max_students INTEGER NOT NULL DEFAULT 5,
  accounting   BOOLEAN DEFAULT FALSE,
  status       TEXT DEFAULT 'unused',        -- unused|active|revoked|expired
  machine_id   TEXT,                         -- bound on first use
  license_key  TEXT,                         -- issued on activation
  sale_amount  DECIMAL DEFAULT 0,
  commission   DECIMAL DEFAULT 0,
  commission_paid BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW(),
  expires_at   TIMESTAMP,                    -- PIN validity window
  activated_at TIMESTAMP
);

-- Schools (activated installations)
CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id        UUID REFERENCES activation_pins(id),
  agent_id      UUID REFERENCES agents(id),
  school_name   TEXT NOT NULL,
  license_key   TEXT UNIQUE NOT NULL,
  machine_id    TEXT NOT NULL,
  tier          TEXT NOT NULL,
  max_students  INTEGER NOT NULL,
  accounting    BOOLEAN DEFAULT FALSE,
  status        TEXT DEFAULT 'active',       -- active|revoked|suspended
  machine_resets INTEGER DEFAULT 0,
  last_verified  TIMESTAMP,
  activated_at  TIMESTAMP DEFAULT NOW()
);

-- Machine reset requests
CREATE TABLE machine_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id),
  agent_id    UUID REFERENCES agents(id),
  reason      TEXT,
  old_machine TEXT,
  new_machine TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

---

## 6. Landing Page & Marketing Site

**URL:** schoolfeesmanager.com  
**Tech:** Next.js 14 + Tailwind CSS (deployed on Vercel)

### 6.1 Pages

#### Home (/)
- Hero: "The simplest school fees management software for Nigerian secondary schools"
- Sub: "Works offline. No monthly subscription. Pay once, use forever."
- CTA buttons: [Download Demo] [Get Full License]
- Feature highlights (6 cards):
  - Works 100% offline
  - Receipt printing (A4 + thermal)
  - Debtors tracking
  - Class billing in one click
  - Excel export
  - Mini accounting module
- How it works (3 steps): Install → Activate → Start collecting fees
- Testimonials (placeholder for now)
- Pricing section (links to /pricing)
- Footer: contact, links

#### Features (/features)
- Detailed feature breakdown by module
- Screenshots of each page
- Comparison table vs manual (Excel/paper)

#### Pricing (/pricing)
- Three tiers (see section 8)
- One-time payment emphasis
- FAQ section

#### Download (/download)
- Download latest installer (.exe)
- System requirements
- Installation guide video embed
- "Already have a key? Download and enter it on first launch"

#### Activate (/activate)
- Short guide on how to use the activation key/PIN
- Contact sales agent link

#### Contact (/contact)
- WhatsApp button
- Email form
- Agent finder (by state)

### 6.2 Design Direction

```
Color palette:
  Primary:    #1a56db  (blue — trust, professional)
  Secondary:  #059669  (emerald — money, success)
  Accent:     #f59e0b  (amber — attention, Nigerian warmth)
  Dark:       #0f172a  (slate-900 — headers, sidebar)
  Background: #f8fafc  (light gray)

Typography:
  Headings: Inter 700
  Body:     Inter 400
  Code:     JetBrains Mono

Tone:
  Professional but warm
  Nigerian context (₦ signs, local school names in examples)
  Emphasize: offline-first, one-time payment, no hidden fees
```

---

## 7. Careers & Agent Application Page

**URL:** schoolfeesmanager.com/careers

### 7.1 Agent Position

**Title:** Sales Agent — SchoolFees Manager

**What agents do:**
- Visit secondary schools in their area
- Demonstrate the software to principals/bursars
- Get schools to buy a license
- Collect payment and generate activation PIN
- Provide basic after-sales support

**Earning potential:**
- 20% commission on every sale
- Standard license (₦60,000) → Agent earns ₦12,000 per school
- Unlimited license (₦100,000) → Agent earns ₦20,000 per school
- No cap — sell to 10 schools = ₦120,000–₦200,000/month

**Requirements:**
- Android smartphone (to access agent portal)
- Basic understanding of school administration
- Ability to travel within their state
- No tech background required — demo key provided

### 7.2 Application Form Fields

```
Personal Information:
  - Full name
  - Email address
  - Phone number (WhatsApp)
  - State of residence
  - LGA
  - City

Experience:
  - Do you currently work in education? (Yes/No)
  - Previous sales experience? (Yes/No/Describe)
  - How many secondary schools do you know personally? (0-5 / 5-20 / 20+)
  - Do you own a smartphone? (Yes/No)
  - Do you have a means of transport? (Yes/No/Describe)

Motivation:
  - Why do you want to become an agent? (textarea)
  - Which states/areas do you plan to cover? (textarea)
  - How did you hear about us?

Bank Details (for commission payment):
  - Bank name
  - Account number
  - Account name

Submit → Application reviewed within 48 hours
```

### 7.3 Open Positions (Other Roles)

```
1. Senior React Developer (Remote)
   - Build agent portal and admin dashboard
   - Experience: React, Node.js, PostgreSQL
   - Type: Contract / Part-time
   - Pay: Negotiable

2. Customer Support Officer (Remote/Lagos)
   - Handle school support requests via WhatsApp
   - Train new schools on the app
   - Type: Part-time
   - Pay: ₦40,000–₦60,000/month

3. Marketing Officer (Lagos)
   - Social media management
   - School outreach campaigns
   - Type: Full-time
   - Pay: ₦60,000–₦80,000/month
```

---

## 8. Licensing Tiers & Pricing

### One-Time Payment Model

| Tier | Max Students | Price | Accounting | Notes |
|---|---|---|---|---|
| Demo | 5 | Free | No | Agent demo use only |
| Starter | 200 | ₦30,000 | No | Small schools |
| Standard | 500 | ₦60,000 | No | Most schools |
| Unlimited | Unlimited | ₦100,000 | No | Large schools |
| + Accounting | Any | +₦20,000 | Yes | Add-on to any tier |

### Commission Structure

| Tier | Sale Price | Agent Commission (20%) |
|---|---|---|
| Starter | ₦30,000 | ₦6,000 |
| Standard | ₦60,000 | ₦12,000 |
| Unlimited | ₦100,000 | ₦20,000 |
| + Accounting add-on | ₦20,000 | ₦4,000 |

### What "One-Time" means for schools
- Pay once, own forever
- Free updates for 1 year
- After 1 year: optional annual support/update fee (₦10,000–₦15,000)
- No monthly fees, no subscriptions
- If PC dies: one free machine transfer per year

---

## 9. Technology Stack — Full Platform

```
Desktop App (existing):
  Electron + React + Vite + Tailwind
  SQLite via node-sqlite3-wasm
  node-machine-id for hardware fingerprint

Activation Server (to build):
  Node.js 20 + Express
  PostgreSQL (Supabase)
  JWT auth
  Deployed: Railway.app or Render.com

Agent Portal (to build):
  Next.js 14 + Tailwind
  React Query for data fetching
  Deployed: Vercel

Admin Dashboard (to build):
  Next.js 14 + Tailwind + Recharts
  Same API as Agent Portal
  Deployed: Vercel

Marketing Site (to build):
  Next.js 14 + Tailwind
  Deployed: Vercel
  Domain: schoolfeesmanager.com

All web apps share one API:
  api.schoolfeesmanager.com
```

---

## 10. Roadmap

### Phase A — Desktop App (Current) ✅
- [x] Full fees management (sessions, classes, students, billing, payments)
- [x] Receipt printing (A4 + thermal)
- [x] Debtors tracking
- [x] Excel export
- [x] Mini accounting module
- [x] Offline activation with HMAC keys
- [x] Backup and restore
- [x] Demo database
- [ ] Google Drive backup (in progress)
- [ ] Email receipts via SMTP
- [ ] SMS receipts via Termii/BulkSMS

### Phase B — Activation Server ⬜
- [ ] PostgreSQL schema (agents, prospects, pins, schools)
- [ ] POST /v1/activate endpoint
- [ ] GET /v1/verify endpoint
- [ ] PIN generation logic
- [ ] Machine binding & revocation
- [ ] Deploy to Railway.app

### Phase C — Agent Portal ⬜
- [ ] Login / auth
- [ ] Prospect management
- [ ] PIN generation
- [ ] Commission tracker
- [ ] Machine reset requests

### Phase D — Admin Dashboard ⬜
- [ ] All schools view
- [ ] All agents view
- [ ] Revenue reports
- [ ] Feature flag management
- [ ] Payout processing

### Phase E — Marketing Site ⬜
- [ ] Landing page
- [ ] Pricing page
- [ ] Download page
- [ ] Careers / agent application
- [ ] Contact page

### Phase F — Growth ⬜
- [ ] WhatsApp bot for payment reminders
- [ ] Parent portal (web — read-only balance check)
- [ ] Mobile app for bursars (React Native)
- [ ] Multi-school / chain school support
- [ ] Paystack integration for online payments

---

## Appendix A — Current Offline Keys

> ⚠️ Keep private. Rotate the secret annually.

```
Secret seed: SF_MASTER_SECRET_2025_OJUOYE

Master (unlimited):   A84F-6D73-0E74-BFF2
Backup master:        61C3-84C9-EF8B-D3CC

Demo (5 students):
  9A74-A306-A704-BED5    F6E3-8FB1-E8C3-39A1
  A836-51E7-90E4-515C    E705-844C-E311-DB2A
  7E9D-E790-FE21-1323    4930-3454-AE4B-8414
  07D9-DEEC-927D-208E    FCFA-A7B6-50C2-FA85
  04C2-FC2E-5A09-1949    2901-8A46-DA09-D114

Standard (500 students):
  3F30-A570-E2F7-9B2F    C2DD-99F7-2AA2-4119
  0387-9761-C7F6-DFEA    44F8-D2DA-AA34-6932
  18B0-8A23-CF3F-98FA    09CA-5AFB-2718-CCF0

Unlimited:
  4126-C22C-8EAC-AFFF    897D-6B81-AE3D-8BBC
  409D-3413-0C0D-7155    BD89-21CB-1F43-730F
```

## Appendix B — Developer Notes for Next Session

When continuing on a **new Claude session**, provide this context:

```
Project: SchoolFees Manager desktop app (Electron + React + SQLite)
GitHub:  https://github.com/OjuoyeMoshoodOlawale/schoolfees-manager
Status:  Desktop app complete (Phases 1-5). Building web platform next.
Next:    [Choose one]
  A. Build activation server (Node.js + PostgreSQL + Express)
  B. Build agent portal (Next.js web app)
  C. Build marketing landing page
  D. Continue desktop app improvements
Design doc: DESIGN.dm (in repo root)
```

---

*End of Design Document — schoolfeesmanager.com*
