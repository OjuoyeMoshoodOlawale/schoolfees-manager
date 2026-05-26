# SchoolFees Manager — Product Roadmap, Module Pricing & ERP Strategy

> **Version:** 1.0 — May 2026  
> **Prepared for:** Codeware Nigeria / Internal Development Use  
> **Methodology:** Agile sprints, modular unlockable features  
> **Target market:** Nigerian private and public secondary schools (600,000+ schools nationally)

---


## Decisions Locked (Do Not Re-ask)

| Decision | Choice |
|---|---|
| Payroll statutory deductions | PAYE + Pension only. NHF/NSITF deferred to v2 |
| Parent Portal | POSTPONED — not in Version 1 |
| Multi-user LAN sync | YES — real-time sync between PCs on same network |
| Biometric attendance hardware | YES — sell hardware + provide software bridge |
| WhatsApp integration | POSTPONED — not in current roadmap |
| USD pricing | NO — currency via Settings only |

---
## Executive Summary

SchoolFees Manager is a desktop-first (Electron + React) school financial management system targeting Nigerian secondary schools. The system currently covers student billing, fee collection, receipts, reporting, and a double-entry accounting module. This document defines the full expansion roadmap using ERP best practices, agile sprint planning, competitive analysis, legal requirements, and a tiered pricing model.

---

## Competitive Analysis

### Direct Competitors in Nigerian Market

| Product | Strength | Weakness | Price Range |
|---|---|---|---|
| **SAFSMS** | Established, large school base | Expensive, complex, slow support | ₦200k–₦1m/year |
| **SchoolPro Nigeria** | Web-based, mobile app | Online-only, poor offline support | ₦50k–₦300k/year |
| **Edumatics** | Attendance + fees integration | Limited accounting depth | ₦80k–₦400k/year |
| **Classter** | International standard, feature-rich | Not localised for Nigeria, USD pricing | $300–$1,500/year |
| **Excel + Manual** | Free, familiar | No audit trail, error-prone, not scalable | Free but costly in errors |

### Our Competitive Advantages

| Advantage | Detail |
|---|---|
| **Offline-first** | Works without internet — critical for Nigerian infrastructure reality |
| **One-time payment** | No subscription anxiety. Schools budget once and own it forever |
| **Naira-native** | Built for ₦, Nigerian banks, Nigerian phone numbers, Nigerian school terms |
| **Modular unlocking** | Pay only for what you need — scalable from small to large schools |
| **Accounting integration** | Fees → journal entries automatically — most competitors don't do this |
| **Open receipt format** | Fully branded receipts by SMS, email, print |
| **Local support** | Nigerian-based team with agent network |

### SWOT Analysis

**Strengths**
- Offline-first Electron app — no server costs, works with NEPA power cuts
- One-time pricing removes budget objection for school proprietors
- Already has billing, accounting, SMS, email, Google Drive backup, multi-user
- Built by a Nigerian developer who understands the market firsthand

**Weaknesses**
- No mobile companion app yet
- No multi-branch support currently
- No payroll module yet
- Print preview not yet fully standardised across all report types

**Opportunities**
- 600,000+ schools in Nigeria, <5% use proper school management software
- Government push for digital record-keeping in education
- Hardware upsell: attendance machines, POS terminals, receipt printers
- Agent/reseller network in each state

**Threats**
- Free alternatives (Google Sheets, Excel) for price-sensitive schools
- SaaS competitors if internet infrastructure improves significantly
- WhatsApp-based competitors building lightweight tools

---

## Legal & Compliance Requirements (Nigeria)

### Data Protection
- **NDPR (Nigeria Data Protection Regulation) 2019** — schools storing student PII (names, DOB, parent contacts) must:
  - Maintain a data register
  - Have a privacy policy
  - Obtain consent before sharing data with third parties
  - Implement access controls (role-based, already implemented)
- Recommendation: Add a NDPR compliance notice in the setup wizard and data export

### Financial Record-Keeping
- **CAMA 2020 (Companies and Allied Matters Act)** — for registered schools, financial records must be kept for minimum 6 years
- **FIRS requirements** — schools with taxable income need proper books of accounts
- Our double-entry accounting module satisfies this if used correctly
- Recommendation: Add a "Year-end lock" to prevent historical record modification

### Tax
- **VAT** (7.5% in Nigeria) — applicable on school services in some cases; system should support optional VAT on invoices
- **PAYE** — payroll module must deduct and track correctly when implemented
- **WHT (Withholding Tax)** — applicable to contractor payments; expense module should flag

### SMS/WhatsApp
- **NCC (Nigerian Communications Commission)** requires sender IDs to be registered for bulk SMS
- Termii and BulkSMS Nigeria handle this compliance for approved sender IDs

---

## Module Architecture & Pricing

All prices are **one-time payments**. No subscriptions. Updates within the major version are free.

---

### MODULE 0 — Core (Included Free)
**What's included:**
- School settings, logo, currency
- Sessions & terms management
- Class management
- User accounts (Admin, Bursar, Viewer roles)
- Student registration (up to 50 students)
- Basic dashboard
- Local auto-backup

**Price:** Free (bundled with any paid module)

---

### MODULE 1 — Fee Management ₦35,000
**Unlocks:**
- Unlimited students
- Fee item configuration
- Bill config per class/term/gender/boarding
- Auto bill generation on student register/promote/term change
- Payment-triggered bill config lock
- Fee waivers, adjustments
- Bill statements
- Carry-over balances between terms
- Overpayment credit carry-forward
- Class bill print
- Fee statement print

**Target users:** Any school collecting fees

---

### MODULE 2 — Payments & Receipts ₦25,000
**Unlocks:**
- Post payments (cash, bank transfer, POS, cheque)
- Receipt generation and print
- Payment history with full audit trail
- Payment reversal (with reason and alert)
- Partial payment tracking
- Debtors list
- Auto SMS receipt on payment
- Auto email receipt on payment (with school logo, balance shown)
- Reversal alert to parent

**Requires:** Module 1

---

### MODULE 3 — Reports & Analytics ₦20,000
**Unlocks:**
- Account Report (billed vs collected)
- Term End Report (class-by-class summary, printable)
- Collection Summary (daily trends, top payers)
- Class Fee Status (every student per class — paid/partial/unpaid)
- Student Ledger (full history across all terms)
- Payment Audit Trail
- Communications Log (failed SMS/email with resend)
- Export to Excel for all reports
- Print all reports with school logo

**Requires:** Module 1, 2

---

### MODULE 4 — Communications ₦15,000
**Unlocks:**
- Bulk SMS to class, year group, all parents
- Bulk email to class or all
- SMS/email templates
- Delivery status tracking
- Failed message log with resend and contact edit
- Scheduled message sending

**Requires:** Module 2

---

### MODULE 5 — Double-Entry Accounting ₦45,000
**Unlocks:**
- Chart of Accounts (Assets, Liabilities, Equity, Income, Expenses)
- Journal Entries (manual double-entry)
- Auto-journal on payment posting
- General Ledger
- Trial Balance
- Account Statement
- Invoice generation
- Financial reporting (P&L, Balance Sheet basis)

**Requires:** Module 1, 2

---

### MODULE 6 — Payroll ₦40,000
**Unlocks:**
- Staff records
- Salary structure (basic, allowances, deductions)
- PAYE tax calculation
- Pension deductions
- Monthly payroll run
- Payslip generation and print/email
- Payroll reports
- Bank transfer schedule export

**Independent module** (does not require fee modules)

---

### MODULE 7 — Expense & Procurement ₦30,000
**Unlocks:**
- Expense categories
- Expense recording with receipt upload
- Petty cash management
- Expense approval workflow
- Purchase orders
- Supplier management
- Expense reports

**Requires:** Module 5

---

### MODULE 8 — Inventory ₦25,000
**Unlocks:**
- Stock items (books, uniforms, stationery)
- Stock in/out recording
- Low stock alerts
- Inventory valuation
- Sale of items (integrated with receipts)

**Independent module**

---

### MODULE 9 — Attendance ₦30,000
**Unlocks:**
- Student daily attendance (manual entry)
- Class attendance register
- Attendance reports and term summary
- Parent notification on absence
- Staff attendance (clock in/out)
- Integration with payroll for deductions
- Biometric device connection (RFID/fingerprint) — hardware extra

**Independent module**

---

### MODULE 10 — Parent Portal ₦35,000
**Unlocks:**
- Parent login web interface (lightweight hosted)
- View child's fee balance
- Download receipts
- View payment history
- Receive in-app notifications

**Requires:** Module 1, 2, hosting setup

---

### MODULE 11 — Multi-Branch ₦60,000
**Unlocks:**
- Multiple school branches under one license
- Consolidated reporting across branches
- Branch-level user access control
- Centralised chart of accounts with branch segments

**Requires:** All other modules on each branch

---

### BUNDLE PACKAGES

| Bundle | Modules Included | Normal Price | Bundle Price | Saving |
|---|---|---|---|---|
| **Starter** | 0 + 1 + 2 | ₦60,000 | ₦50,000 | ₦10,000 |
| **Standard** | 0 + 1 + 2 + 3 + 4 | ₦95,000 | ₦75,000 | ₦20,000 |
| **Professional** | 0 + 1 + 2 + 3 + 4 + 5 | ₦140,000 | ₦105,000 | ₦35,000 |
| **Complete School** | 0–8 | ₦235,000 | ₦175,000 | ₦60,000 |
| **Enterprise** | All 11 modules | ₦360,000 | ₦260,000 | ₦100,000 |

---

## Agile Development Phases

### Phase 1 — Foundation (COMPLETED ✅)
- Student registration, classes, sessions/terms
- Fee items, bill config, auto-generation
- Payment posting, receipts
- Basic dashboard
- Local backup

### Phase 2 — Financial Intelligence (COMPLETED ✅)
- Double-entry accounting (Chart of Accounts, Journal, Ledger, Trial Balance)
- Account report, debtors list
- SMS and email notifications
- Google Drive backup
- Multi-user roles

### Phase 3 — Reports & Polish (COMPLETED ✅)
- 6 new report pages (Term End, Collection Summary, Class Status, Ledger, Audit, Comms Log)
- Dashboard 3-mode toggle (Operations / Accounting / Executive)
- Failed communications log with resend + contact edit
- Payment-triggered bill config lock
- Configurable registration number format
- Auto-send receipt with balance and logo on payment
- Reversal alerts
- Overpayment credit carry-forward

### Phase 4 — Print & Preview (IN PROGRESS)
Sprint tasks:
- [ ] Unified print preview modal (paper size: A4, A5, Letter, Thermal 80mm, 58mm)
- [ ] School logo on all print outputs
- [ ] Email address header on bill/statement prints
- [ ] Dedicated preview before every print job
- [ ] Receipt print from payment history
- [ ] Clean print for Account Report, Term End Report

### Phase 5 — Payroll Module
**Decisions locked:** PAYE + Pension only. NHF/NSITF/NSITF deferred to v2.

Sprint tasks:
- [ ] Staff records (name, role, department, bank account, salary structure)
- [ ] Salary components: basic salary, housing allowance, transport allowance
- [ ] Deductions: PAYE tax (using Nigeria tax bands), pension (8% employee + 10% employer CRA 2011)
- [ ] Monthly payroll run — approve → post → lock
- [ ] Payslip generation (print + email to staff)
- [ ] Payroll summary report and bank transfer schedule export
- [ ] Integration with accounting module (salary posting = debit Salary Expense, credit Bank/Cash)
- [ ] Leave management (basic — annual, sick, maternity)
- [ ] NHF / NSITF — deferred to Version 2

### Phase 6 — Expense & Procurement Module
Sprint tasks:
- [ ] Expense categories and recording
- [ ] Petty cash with voucher tracking
- [ ] Supplier management
- [ ] Purchase orders
- [ ] Expense approval workflow (multi-level)
- [ ] Expense reports

### Phase 7 — Attendance Module
Sprint tasks:
- [ ] Student daily attendance entry (per class)
- [ ] Attendance term report
- [ ] Parent SMS on unexplained absence
- [ ] Staff attendance (in/out)
- [ ] Payroll deduction for absent days
- [ ] RFID/biometric device bridge (optional hardware)

### Phase 8 — Inventory Module
Sprint tasks:
- [ ] Stock catalogue (items, categories, units)
- [ ] Stock in (purchase) and out (sale/issue)
- [ ] Low stock threshold alerts
- [ ] School store POS integration
- [ ] Inventory valuation reports

### ~~Phase 9 — Parent Portal~~
**POSTPONED** — not in Version 1 roadmap.

### Phase 10 — Multi-Branch & Enterprise
Sprint tasks:
- [ ] Branch management screen
- [ ] Branch-level data partitioning
- [ ] Consolidated reports across all branches
- [ ] Centralised user management
- [ ] Single activation key for all branches

---

## Security Requirements

| Area | Requirement | Status |
|---|---|---|
| Authentication | Username + password for all users | ✅ |
| Role-based access | Admin, Bursar, Accountant, Viewer, Auditor | ✅ |
| Accounting module key | Cryptographic unlock key per school | ✅ |
| Screenshot protection | `setContentProtection` on sensitive screens | ✅ |
| Audit trail | All payments, reversals, journal entries logged | ✅ |
| DB encryption | SQLite WAL mode, backup encryption (planned) | Planned |
| NDPR compliance | Data consent notice, export capability | Planned |
| Session timeout | Auto-logout after inactivity | Planned |
| Password policy | Minimum complexity requirements | Planned |

---

## Hardware Upsell Opportunities

| Hardware | Integration | Suggested Margin |
|---|---|---|
| Thermal receipt printer | Module 2 — print receipts directly | ₦25,000–₦45,000 |
| POS terminal | Module 2 — record POS payments | ₦80,000–₦150,000 |
| Fingerprint attendance device | Module 9 — auto attendance | ₦60,000–₦120,000 |
| RFID card reader + student cards | Module 9 — tap-in attendance | ₦40,000–₦80,000 |
| Network switch for LAN multi-user | All modules | ₦15,000–₦30,000 |

---

## Agent/Reseller Model

| Tier | Commission | Requirements |
|---|---|---|
| Reseller | 20% of sale | Register, complete product training |
| Gold Partner | 30% of sale | 5+ sales/year, provide Level 1 support |
| State Partner | 35% + territory rights | Exclusive state, 20+ schools |

Agents receive: installer USB, demo licence, marketing materials, training certificate.

---

## Questions Needing Your Decision

1. **Payroll — pension calculation**: Should we implement NHF (National Housing Fund) and NSITF contributions, or just PAYE for now?

2. **Parent Portal**: Self-hosted (school runs their own server) or cloud-hosted (you host for all schools)? Cloud hosting changes pricing model.

3. **Multi-user LAN sync**: Do you want real-time sync between computers on the same school network, or just single-device with user switching?

4. **Biometric attendance**: Are you planning to sell the hardware yourself, or just provide the software bridge for any compatible device?

5. **WhatsApp Business API**: POSTPONED — not in current roadmap.

6. **USD Pricing**: NO — currency is set via Settings only. No separate USD pricing tier.

---

*Document maintained by the SchoolFees Manager development team. Update with each sprint completion.*
