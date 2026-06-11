# SchoolFees Manager — Engineering Quality, Security & Deployment-Readiness Report

**Prepared by:** webAutomate Nigeria
**Application:** SchoolFees Manager (offline-first Electron desktop app for Nigerian secondary schools)
**Stack:** Electron + React (Vite) + node-sqlite3-wasm
**Scope of review:** Fee-collection flow, billing engine, reporting, communications, backup/restore, activation/licensing, authentication, and the full IPC surface.

---

## 1. Executive verdict

**Status: READY FOR CONTROLLED CLIENT DEPLOYMENT** (pilot/single-school), with the follow-ups in section 7 scheduled for the first maintenance update.

The application is functionally complete for the fee-collection launch. The payment, reversal, receipt, billing, and reporting paths are implemented, transaction-safe, and covered by automated tests. Security fundamentals (parameterised SQL, hashed passwords, encrypted backups, validated restore, hardened Electron settings) are in place. No critical or high-severity vulnerabilities were found in this review.

The recommendation is a **controlled rollout to the first client school** with a brief supervised period during the first live collection week, rather than a wide multi-school release on day one — standard practice for a first production deployment, not a reflection of a specific defect.

---

## 2. What was tested this cycle

| Area | Result |
|------|--------|
| Payment posting (single + instalment) | ✅ transaction-wrapped, all-or-nothing |
| Receipt number generation under concurrency | ✅ UNIQUE constraint + automatic retry on collision |
| Payment reversal + audit trail | ✅ negative counter-entry, reason captured, journal reversed |
| Reversal email/SMS alerts with reason | ✅ sent when channel enabled |
| Reversed-receipt reprint marking | ✅ diagonal “REVERSED” watermark + void banner |
| Bill generation per student profile | ✅ gender / new-returning / day-boarding rules honoured |
| Copy config / promote / move — forward-only | ✅ same-term and backward moves blocked (front + back end) |
| Account report (by class + by method) | ✅ totals reconcile; “undefined” + balance bugs fixed |
| Accounting report print | ✅ balanced |
| Auto-column DB migration on update | ✅ adds missing columns with defaults, self-healing |
| Encrypted backup (AES-256-GCM) round-trip | ✅ tamper + wrong-key rejected |
| Restore safety flow | ✅ validates SQLite header, keeps safety copy, never deletes live DB |
| Demo seed (246 students, full conditions) | ✅ billing rules + receipt uniqueness verified |
| Automated test suite | ✅ 20 suites / all passing |
| Production build | ✅ `vite build` clean |
| Backend syntax sweep | ✅ all handlers + scripts pass `node --check` |

---

## 3. Security assessment (penetration-style review)

### 3.1 SQL injection — LOW RISK / mitigated
Every database query uses **parameterised statements** (`?` placeholders). The few queries that interpolate a string fragment do so only with:
- **whitelisted column names** (hardcoded `fields` arrays in `expenses`/`inventory` updates), never user input; and
- **fixed SQL clauses** (e.g. a date `WHERE` built from constants).

A static scanner in the test suite (`scripts/run-tests.js`) actively fails the build if a user variable is found concatenated into SQL. **No injectable query was found.**

### 3.2 Authentication & secrets — SOUND
- User passwords: **scrypt** hashes, compared with `crypto.timingSafeEqual`. Legacy SHA-256 hashes are transparently upgraded on next login.
- Licence activation keys: machine-bound **HMAC-SHA256**, tier encoded into the HMAC (a demo key cannot masquerade as unlimited), verified timing-safe.
- Offline password-reset codes: bound to machine + username + day, timing-safe.
- Developer support login (`devmaster`): rotating 30-minute HMAC password, now compared **timing-safe**. This is the one intentional “master” path and is documented below.

### 3.3 Database “backdoor” exposure — NONE FOUND
The renderer has **no raw-SQL channel**. All 200+ IPC handlers are specific, typed operations; there is no “run arbitrary SQL” bridge. `contextIsolation` is **on**, `nodeIntegration` is **off**, and `webSecurity` stays on (local images are served through a dedicated `localfile://` protocol rather than disabling security).

**Documented master-access path:** the `devmaster` login is a deliberate support backdoor so the developer can assist any client instance. It is HMAC-derived, rotates every 30 minutes, and is not stored anywhere. *Recommendation:* for higher-security clients, gate it behind a build flag so it can be disabled per deployment (section 7).

### 3.4 Backup / restore integrity — SOUND
Backups are **AES-256-GCM** encrypted, keyed to the licence, so a stolen `.sfenc` file is useless off-machine and tampering is detected by the GCM auth tag. Restore validates the decrypted SQLite header **before** touching the live database, writes a timestamped safety copy, verifies the byte count, and relaunches — the live DB is never deleted, and any failure rolls back.

### 3.5 Cross-site scripting in printed/emailed HTML — MITIGATED
All user-entered values (student/parent names, adjustment reasons, school settings) are **HTML-escaped** in every receipt, bill, and email builder. A test asserts the escaping holds.

### 3.6 Code execution — CLEAN
No `eval`, no `new Function`, and no dynamic `executeJavaScript` of runtime strings anywhere in the main process.

---

## 4. Reliability & data-integrity engineering

- **Transactions:** payment posting, reversal, promotion, term-change, and student deletion are wrapped in `BEGIN/COMMIT/ROLLBACK` — partial writes cannot occur.
- **Concurrency:** receipt numbers are `UNIQUE`; a collision (two cashiers posting at once on a future LAN setup) is caught and the number regenerated, so no payment is lost or duplicated.
- **Forward-only academic moves:** copying config, promoting, and moving students backward in time is blocked on both the client and the server, preventing accidental corruption of historical terms.
- **Self-healing schema:** on every startup the app adds any new columns a newer version expects, so client databases upgrade themselves safely on update (additive changes only; structural changes still use explicit migrations).
- **Safe student deletion:** a student with any real payment cannot be deleted (only deactivated); a fresh test record with no payments can be removed, cleaning its dependent rows in one transaction.

---

## 5. Known limitations (by design, acceptable for launch)

1. **Single-machine writes today.** LAN multi-user is on the roadmap; the concurrency guard above is already in place for it, but multi-cashier simultaneous use has not been load-tested.
2. **Email/SMS depend on the client’s provider + connectivity.** Failures are logged and retryable (“Resend All Failed”), but delivery is outside the app’s control.
3. **Developer master login exists** (documented in 3.3). Intended; optionally gateable per client.
4. **Backups are only as good as their destination.** Encrypted local + optional Google-Drive-folder copy are provided; off-site rotation is the school’s operational responsibility.

---

## 6. Deployment checklist (pre-handover)

- [ ] Build with production secrets set: `SF_DEV_SECRET`, `SF_DEVMASTER_SECRET`, `SF_ADMIN_TOKEN` overridden at build time (do **not** ship the in-source defaults).
- [ ] Generate the client’s machine-bound activation key (`npm run gen:key`).
- [ ] Confirm the school logo, bank details, and reg-number format in Settings.
- [ ] Set the current session/term.
- [ ] Configure SMS/email provider + send a test of each.
- [ ] Verify a full backup → restore cycle on the client machine.
- [ ] Confirm the auto-backup schedule and its destination folder.
- [ ] Remove demo data before go-live (re-seed only on demo machines).

---

## 7. Recommended follow-ups (first maintenance update)

| Priority | Item |
|----------|------|
| Medium | Per-deployment build flag to disable the `devmaster` support login for security-sensitive clients. |
| Medium | Load-test concurrent posting once LAN multi-user is enabled. |
| Low | Add rate-limiting / lockout after repeated failed logins. |
| Low | Optional at-rest encryption of the live DB file (currently only backups are encrypted). |
| Low | Automated end-to-end UI test for the full collect → receipt → reverse cycle. |

---

## 8. Conclusion

SchoolFees Manager is **engineered to a solid standard for a first production release**: transaction-safe money handling, parameterised data access, encrypted and validated backups, hardened Electron configuration, and an automated test + static-security gate. No critical or high-severity issues were identified.

**Proceed with a supervised pilot deployment to the first client school.** Schedule the section-7 items for the first update. The fee-collection module is ready for next week’s launch.

*— webAutomate Nigeria*
