'use strict'
/**
 * Payroll Module — Phase 5
 * Covers: Staff management, Salary grades, PAYE (Nigerian tax bands),
 *         Employee + Employer pension (8% + 10% of pensionable pay),
 *         One-off & recurring extra deductions, Payslip print.
 *
 * PAYE bands (FIRS 2024 — annual CRA relief applied first):
 *   First  ₦300,000  → 7%
 *   Next   ₦300,000  → 11%
 *   Next   ₦500,000  → 15%
 *   Next   ₦500,000  → 19%
 *   Next ₦1,600,000  → 21%
 *   Above  ₦3,200,000 → 24%
 *
 * Pension (PenCom 2014 Act):
 *   Employee: 8% of (basic + housing + transport)
 *   Employer: 10% of (basic + housing + transport)
 *   Both rounded to 2dp
 *
 * CRA (Consolidated Relief Allowance): higher of ₦200,000 or 1% of gross,
 * PLUS 20% of gross — applied before PAYE bands.
 */

const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

// ── PAYE calculation (annual → monthly) ──────────────────────────────────────
function computePAYE(monthlyGross) {
  const annual = monthlyGross * 12
  // CRA = higher of ₦200,000 or 1% gross, plus 20% gross
  const cra = Math.max(200_000, annual * 0.01) + annual * 0.20
  let taxable = Math.max(0, annual - cra)

  const bands = [
    { limit: 300_000,   rate: 0.07 },
    { limit: 300_000,   rate: 0.11 },
    { limit: 500_000,   rate: 0.15 },
    { limit: 500_000,   rate: 0.19 },
    { limit: 1_600_000, rate: 0.21 },
    { limit: Infinity,  rate: 0.24 },
  ]

  let annualTax = 0
  for (const { limit, rate } of bands) {
    if (taxable <= 0) break
    const chunk = Math.min(taxable, limit)
    annualTax  += chunk * rate
    taxable    -= chunk
  }

  return Math.round((annualTax / 12) * 100) / 100
}

// ── Pension calculation ───────────────────────────────────────────────────────
function computePension(basic, housing, transport) {
  const pensionable = basic + housing + transport
  return {
    employee: Math.round(pensionable * 0.08 * 100) / 100,
    employer: Math.round(pensionable * 0.10 * 100) / 100,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALARY GRADES
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('payroll:grades-list', () => {
  return getDb().prepare('SELECT * FROM salary_grades ORDER BY name').all()
})

ipcMain.handle('payroll:grade-save', (_, d) => {
  const db = getDb()
  if (d.id) {
    db.prepare(`UPDATE salary_grades SET name=?,basic_salary=?,housing_allowance=?,
      transport_allowance=?,other_allowances=?,description=?,is_active=? WHERE id=?`)
      .run([d.name, d.basic_salary||0, d.housing_allowance||0, d.transport_allowance||0,
            d.other_allowances||0, d.description||'', d.is_active??1, d.id])
    return { id: d.id }
  }
  const r = db.prepare(`INSERT INTO salary_grades
    (name,basic_salary,housing_allowance,transport_allowance,other_allowances,description,is_active)
    VALUES (?,?,?,?,?,?,?)`)
    .run([d.name, d.basic_salary||0, d.housing_allowance||0, d.transport_allowance||0,
          d.other_allowances||0, d.description||'', d.is_active??1])
  return { id: r.lastInsertRowid }
})

ipcMain.handle('payroll:grade-delete', (_, id) => {
  const used = getDb().prepare('SELECT COUNT(*) as n FROM staff WHERE salary_grade_id=?').get([id])?.n || 0
  if (used > 0) throw new Error(`Grade is assigned to ${used} staff member(s). Reassign first.`)
  getDb().prepare('DELETE FROM salary_grades WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// STAFF
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('payroll:staff-list', (_, { include_inactive = false } = {}) => {
  const sql = include_inactive
    ? 'SELECT s.*, g.name as grade_name FROM staff s LEFT JOIN salary_grades g ON g.id=s.salary_grade_id ORDER BY s.last_name, s.first_name'
    : "SELECT s.*, g.name as grade_name FROM staff s LEFT JOIN salary_grades g ON g.id=s.salary_grade_id WHERE s.is_active=1 ORDER BY s.last_name, s.first_name"
  return getDb().prepare(sql).all()
})

ipcMain.handle('payroll:staff-get', (_, id) => {
  return getDb().prepare('SELECT s.*, g.name as grade_name FROM staff s LEFT JOIN salary_grades g ON g.id=s.salary_grade_id WHERE s.id=?').get([id])
})

ipcMain.handle('payroll:staff-save', (_, d) => {
  const db = getDb()
  // Auto-generate staff number if not provided
  if (!d.staff_number) {
    const last = db.prepare("SELECT staff_number FROM staff WHERE staff_number LIKE 'STF%' ORDER BY id DESC LIMIT 1").get()
    const seq  = last ? (parseInt(last.staff_number.replace('STF', '')) || 0) + 1 : 1
    d.staff_number = 'STF' + String(seq).padStart(4, '0')
  }
  const fields = ['staff_number','first_name','last_name','other_names','gender','phone','email',
    'address','department','designation','date_of_birth','date_joined','bank_name',
    'account_number','account_name','tax_id','pension_pin','salary_grade_id',
    'basic_salary','housing_allowance','transport_allowance','other_allowances','is_active']
  const vals = fields.map(f => d[f] ?? null)

  if (d.id) {
    db.prepare(`UPDATE staff SET ${fields.map(f=>f+'=?').join(',')} WHERE id=?`).run([...vals, d.id])
    return { id: d.id, staff_number: d.staff_number }
  }
  const r = db.prepare(`INSERT INTO staff (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`)
    .run(vals)
  return { id: r.lastInsertRowid, staff_number: d.staff_number }
})

ipcMain.handle('payroll:staff-toggle-active', (_, id) => {
  const db   = getDb()
  const curr = db.prepare('SELECT is_active FROM staff WHERE id=?').get([id])
  if (!curr) throw new Error('Staff not found')
  db.prepare('UPDATE staff SET is_active=? WHERE id=?').run([curr.is_active ? 0 : 1, id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA DEDUCTIONS (per-staff, one-off or recurring)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('payroll:deductions-list', (_, { staff_id }) => {
  return getDb().prepare('SELECT * FROM payroll_deductions WHERE staff_id=? ORDER BY id DESC').all([staff_id])
})

ipcMain.handle('payroll:deduction-save', (_, d) => {
  const db = getDb()
  if (d.id) {
    db.prepare('UPDATE payroll_deductions SET name=?,amount=?,is_recurring=?,month=?,year=?,notes=? WHERE id=?')
      .run([d.name, d.amount||0, d.is_recurring??1, d.month||null, d.year||null, d.notes||'', d.id])
    return { id: d.id }
  }
  const r = db.prepare('INSERT INTO payroll_deductions (staff_id,name,amount,is_recurring,month,year,notes) VALUES (?,?,?,?,?,?,?)')
    .run([d.staff_id, d.name, d.amount||0, d.is_recurring??1, d.month||null, d.year||null, d.notes||''])
  return { id: r.lastInsertRowid }
})

ipcMain.handle('payroll:deduction-delete', (_, id) => {
  getDb().prepare('DELETE FROM payroll_deductions WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL RUNS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('payroll:runs-list', () => {
  return getDb().prepare(
    'SELECT * FROM payroll_runs ORDER BY year DESC, month DESC'
  ).all()
})

ipcMain.handle('payroll:run-get', (_, id) => {
  const db  = getDb()
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id=?').get([id])
  if (!run) return null
  const lines = db.prepare(`
    SELECT pl.*, s.first_name, s.last_name, s.staff_number, s.department,
           s.designation, s.bank_name, s.account_number, s.account_name,
           s.tax_id, s.pension_pin
    FROM payroll_lines pl
    JOIN staff s ON s.id=pl.staff_id
    WHERE pl.run_id=?
    ORDER BY s.last_name, s.first_name
  `).all([id])
  return { ...run, lines }
})

// Preview — calculate but don't save
ipcMain.handle('payroll:run-preview', (_, { month, year }) => {
  const db = getDb()
  const staffList = db.prepare("SELECT * FROM staff WHERE is_active=1").all()
  return staffList.map(s => {
    const basic     = Number(s.basic_salary)    || 0
    const housing   = Number(s.housing_allowance)   || 0
    const transport = Number(s.transport_allowance) || 0
    const other     = Number(s.other_allowances)    || 0
    const gross     = basic + housing + transport + other
    const paye      = computePAYE(gross)
    const { employee: pension_emp, employer: pension_er } = computePension(basic, housing, transport)

    // Extra deductions: recurring OR one-off matching this month/year
    const extras = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as t FROM payroll_deductions
      WHERE staff_id=?
        AND (is_recurring=1 OR (month=? AND year=?))
    `).get([s.id, month, year])?.t || 0

    const net = Math.max(0, gross - paye - pension_emp - extras)

    return {
      staff_id: s.id, staff_number: s.staff_number,
      first_name: s.first_name, last_name: s.last_name,
      department: s.department, designation: s.designation,
      basic_salary: basic, housing_allowance: housing,
      transport_allowance: transport, other_allowances: other,
      gross_salary: Math.round(gross * 100) / 100,
      paye_tax: paye,
      pension_employee: pension_emp,
      pension_employer: pension_er,
      other_deductions: Math.round(extras * 100) / 100,
      net_salary: Math.round(net * 100) / 100,
    }
  })
})

// Create/run payroll
ipcMain.handle('payroll:run-create', (_, { month, year, notes = '', created_by = 'admin' }) => {
  const db = getDb()

  // Check duplicate
  const existing = db.prepare('SELECT id FROM payroll_runs WHERE month=? AND year=?').get([month, year])
  if (existing) throw new Error(`Payroll for ${MONTHS[month-1]} ${year} already exists.`)

  const staffList = db.prepare("SELECT * FROM staff WHERE is_active=1").all()
  if (staffList.length === 0) throw new Error('No active staff found.')

  const lines = staffList.map(s => {
    const basic     = Number(s.basic_salary)         || 0
    const housing   = Number(s.housing_allowance)    || 0
    const transport = Number(s.transport_allowance)  || 0
    const other     = Number(s.other_allowances)     || 0
    const gross     = basic + housing + transport + other
    const paye      = computePAYE(gross)
    const { employee: pension_emp, employer: pension_er } = computePension(basic, housing, transport)

    const extras = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as t FROM payroll_deductions
      WHERE staff_id=? AND (is_recurring=1 OR (month=? AND year=?))
    `).get([s.id, month, year])?.t || 0

    const net = Math.max(0, gross - paye - pension_emp - extras)

    return {
      staff_id: s.id,
      basic_salary: basic, housing_allowance: housing,
      transport_allowance: transport, other_allowances: other,
      gross_salary:         Math.round(gross         * 100) / 100,
      paye_tax:             Math.round(paye          * 100) / 100,
      pension_employee:     Math.round(pension_emp   * 100) / 100,
      pension_employer:     Math.round(pension_er    * 100) / 100,
      other_deductions:     Math.round(extras        * 100) / 100,
      net_salary:           Math.round(net           * 100) / 100,
    }
  })

  const totals = lines.reduce((a, l) => ({
    gross:            a.gross            + l.gross_salary,
    paye:             a.paye             + l.paye_tax,
    pension_employee: a.pension_employee + l.pension_employee,
    pension_employer: a.pension_employer + l.pension_employer,
    other:            a.other            + l.other_deductions,
    net:              a.net              + l.net_salary,
  }), { gross:0, paye:0, pension_employee:0, pension_employer:0, other:0, net:0 })

  const ref = `PAY-${year}-${String(month).padStart(2,'0')}`

  const runId = db.prepare(`
    INSERT INTO payroll_runs
      (run_reference,month,year,total_gross,total_paye,total_pension_employee,
       total_pension_employer,total_other_deductions,total_net,staff_count,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run([ref, month, year,
    Math.round(totals.gross*100)/100, Math.round(totals.paye*100)/100,
    Math.round(totals.pension_employee*100)/100, Math.round(totals.pension_employer*100)/100,
    Math.round(totals.other*100)/100, Math.round(totals.net*100)/100,
    lines.length, notes, created_by
  ]).lastInsertRowid

  const insertLine = db.prepare(`
    INSERT INTO payroll_lines
      (run_id,staff_id,basic_salary,housing_allowance,transport_allowance,other_allowances,
       gross_salary,paye_tax,pension_employee,pension_employer,other_deductions,net_salary)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  for (const l of lines) {
    insertLine.run([runId, l.staff_id, l.basic_salary, l.housing_allowance,
      l.transport_allowance, l.other_allowances, l.gross_salary,
      l.paye_tax, l.pension_employee, l.pension_employer,
      l.other_deductions, l.net_salary])
  }

  return { id: runId, run_reference: ref }
})

ipcMain.handle('payroll:run-approve', (_, { id, approved_by }) => {
  const db  = getDb()
  const run = db.prepare('SELECT status FROM payroll_runs WHERE id=?').get([id])
  if (!run) throw new Error('Payroll run not found')
  if (run.status === 'paid') throw new Error('Cannot change a paid payroll run')
  db.prepare("UPDATE payroll_runs SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?")
    .run([approved_by || 'admin', id])
  return { ok: true }
})

ipcMain.handle('payroll:run-mark-paid', (_, id) => {
  const db  = getDb()
  const run = db.prepare('SELECT status FROM payroll_runs WHERE id=?').get([id])
  if (!run) throw new Error('Payroll run not found')
  db.prepare("UPDATE payroll_runs SET status='paid' WHERE id=?").run([id])
  db.prepare("UPDATE payroll_lines SET payment_status='paid' WHERE run_id=?").run([id])
  return { ok: true }
})

ipcMain.handle('payroll:run-delete', (_, id) => {
  const db  = getDb()
  const run = db.prepare('SELECT status FROM payroll_runs WHERE id=?').get([id])
  if (!run) throw new Error('Payroll run not found')
  if (run.status === 'paid') throw new Error('Cannot delete a paid payroll run')
  db.prepare('DELETE FROM payroll_runs WHERE id=?').run([id])  // lines cascade
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP HTML — for print via app:print-html
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

ipcMain.handle('payroll:payslip-html', (_, { run_id, staff_id }) => {
  const db   = getDb()
  const run  = db.prepare('SELECT * FROM payroll_runs WHERE id=?').get([run_id])
  const line = db.prepare(`
    SELECT pl.*, s.first_name, s.last_name, s.staff_number, s.department,
           s.designation, s.bank_name, s.account_number, s.account_name,
           s.tax_id, s.pension_pin
    FROM payroll_lines pl JOIN staff s ON s.id=pl.staff_id
    WHERE pl.run_id=? AND pl.staff_id=?
  `).get([run_id, staff_id])
  if (!run || !line) throw new Error('Payslip data not found')

  const school = db.prepare('SELECT * FROM school_settings WHERE id=1').get() || {}
  const monthLabel = `${MONTHS[run.month - 1]} ${run.year}`

  const row = (label, value, bold = false) =>
    `<tr><td style="padding:5px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6">${label}</td>
         <td style="padding:5px 10px;text-align:right;${bold?'font-weight:bold;':''}border-bottom:1px solid #f3f4f6">${value}</td></tr>`

  const fmt = n => (school.currency_symbol || '₦') + Number(n).toLocaleString('en-NG', {minimumFractionDigits:2})

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;font-size:11pt">
    <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:14px;margin-bottom:18px">
      <h1 style="margin:0;font-size:14pt;text-transform:uppercase">${school.school_name || 'School'}</h1>
      ${school.address ? `<p style="margin:2px 0;font-size:9pt;color:#6b7280">${school.address}</p>` : ''}
      <p style="margin:6px 0 0;font-size:12pt;font-weight:bold">PAYSLIP — ${monthLabel}</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:18px;font-size:10pt">
      <div><span style="color:#6b7280">Name:</span> <strong>${line.first_name} ${line.last_name}</strong></div>
      <div><span style="color:#6b7280">Staff No:</span> ${line.staff_number}</div>
      <div><span style="color:#6b7280">Department:</span> ${line.department || '—'}</div>
      <div><span style="color:#6b7280">Designation:</span> ${line.designation || '—'}</div>
      ${line.tax_id     ? `<div><span style="color:#6b7280">Tax ID (TIN):</span> ${line.tax_id}</div>` : ''}
      ${line.pension_pin ? `<div><span style="color:#6b7280">Pension PIN:</span> ${line.pension_pin}</div>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc">
        <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;font-size:10pt">EARNINGS</th>
        <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #e2e8f0;font-size:10pt">AMOUNT</th>
      </tr></thead>
      <tbody>
        ${row('Basic Salary',           fmt(line.basic_salary))}
        ${row('Housing Allowance',      fmt(line.housing_allowance))}
        ${row('Transport Allowance',    fmt(line.transport_allowance))}
        ${line.other_allowances > 0 ? row('Other Allowances', fmt(line.other_allowances)) : ''}
        ${row('GROSS SALARY', fmt(line.gross_salary), true)}
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-top:14px">
      <thead><tr style="background:#fef2f2">
        <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #fecaca;font-size:10pt;color:#dc2626">DEDUCTIONS</th>
        <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #fecaca;font-size:10pt;color:#dc2626">AMOUNT</th>
      </tr></thead>
      <tbody>
        ${row('PAYE Tax',                fmt(line.paye_tax))}
        ${row('Pension (Employee 8%)',  fmt(line.pension_employee))}
        ${line.other_deductions > 0 ? row('Other Deductions', fmt(line.other_deductions)) : ''}
        ${row('TOTAL DEDUCTIONS', fmt(Number(line.paye_tax)+Number(line.pension_employee)+Number(line.other_deductions)), true)}
      </tbody>
    </table>

    <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border:2px solid #86efac;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13pt;font-weight:bold">NET PAY</span>
      <span style="font-size:16pt;font-weight:bold;color:#15803d">${fmt(line.net_salary)}</span>
    </div>

    ${(line.bank_name || line.account_number) ? `
    <div style="margin-top:14px;font-size:9pt;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:10px">
      <strong>Bank:</strong> ${line.bank_name || '—'} &nbsp;|&nbsp;
      <strong>Account:</strong> ${line.account_number || '—'} &nbsp;|&nbsp;
      <strong>Name:</strong> ${line.account_name || '—'}
    </div>` : ''}

    <div style="margin-top:10px;font-size:9pt;color:#9ca3af;text-align:center">
      Pension (Employer 10%): ${fmt(line.pension_employer)} — not deducted from salary
      &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-NG')}
    </div>
  </div>`
})

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL SUMMARY HTML (full run — for print)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('payroll:summary-html', (_, run_id) => {
  const db  = getDb()
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id=?').get([run_id])
  if (!run) throw new Error('Run not found')
  const lines = db.prepare(`
    SELECT pl.*, s.first_name, s.last_name, s.staff_number, s.department
    FROM payroll_lines pl JOIN staff s ON s.id=pl.staff_id
    WHERE pl.run_id=? ORDER BY s.last_name, s.first_name
  `).all([run_id])
  const school = db.prepare('SELECT * FROM school_settings WHERE id=1').get() || {}
  const sym = school.currency_symbol || '₦'
  const fmt = n => sym + Number(n).toLocaleString('en-NG', {minimumFractionDigits:2})
  const monthLabel = `${MONTHS[run.month - 1]} ${run.year}`

  const rows = lines.map((l, i) => `
    <tr style="border-bottom:1px solid #e5e7eb;${i%2?'background:#f9fafb':''}">
      <td style="padding:5px 8px">${l.staff_number}</td>
      <td style="padding:5px 8px">${l.last_name}, ${l.first_name}</td>
      <td style="padding:5px 8px;color:#6b7280">${l.department||'—'}</td>
      <td style="padding:5px 8px;text-align:right">${fmt(l.gross_salary)}</td>
      <td style="padding:5px 8px;text-align:right;color:#dc2626">${fmt(l.paye_tax)}</td>
      <td style="padding:5px 8px;text-align:right;color:#dc2626">${fmt(l.pension_employee)}</td>
      <td style="padding:5px 8px;text-align:right;color:#dc2626">${fmt(l.other_deductions)}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:bold;color:#15803d">${fmt(l.net_salary)}</td>
    </tr>`).join('')

  return `<div style="font-family:Arial,sans-serif;padding:20px;font-size:10pt">
    <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px">
      <h1 style="margin:0;font-size:14pt;text-transform:uppercase">${school.school_name || 'School'}</h1>
      <p style="margin:4px 0 0;font-size:12pt;font-weight:bold">PAYROLL SUMMARY — ${monthLabel}</p>
      <p style="margin:2px 0 0;font-size:9pt;color:#6b7280">Ref: ${run.run_reference} · Status: ${run.status.toUpperCase()} · Staff: ${run.staff_count}</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${[
        ['Total Gross',    fmt(run.total_gross)],
        ['Total PAYE',     fmt(run.total_paye)],
        ['Total Pension (Emp)', fmt(run.total_pension_employee)],
        ['Total Net Pay',  fmt(run.total_net)],
      ].map(([l,v])=>`<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;text-align:center">
        <p style="margin:0;font-size:8pt;color:#6b7280">${l}</p>
        <p style="margin:3px 0 0;font-size:12pt;font-weight:bold">${v}</p>
      </div>`).join('')}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
      <thead><tr style="background:#1e293b;color:white">
        <th style="padding:7px 8px;text-align:left">Staff #</th>
        <th style="padding:7px 8px;text-align:left">Name</th>
        <th style="padding:7px 8px;text-align:left">Dept</th>
        <th style="padding:7px 8px;text-align:right">Gross</th>
        <th style="padding:7px 8px;text-align:right">PAYE</th>
        <th style="padding:7px 8px;text-align:right">Pension</th>
        <th style="padding:7px 8px;text-align:right">Other Ded.</th>
        <th style="padding:7px 8px;text-align:right">Net Pay</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #94a3b8">
        <td colspan="3" style="padding:6px 8px">TOTAL (${lines.length} staff)</td>
        <td style="padding:6px 8px;text-align:right">${fmt(run.total_gross)}</td>
        <td style="padding:6px 8px;text-align:right;color:#dc2626">${fmt(run.total_paye)}</td>
        <td style="padding:6px 8px;text-align:right;color:#dc2626">${fmt(run.total_pension_employee)}</td>
        <td style="padding:6px 8px;text-align:right;color:#dc2626">${fmt(run.total_other_deductions)}</td>
        <td style="padding:6px 8px;text-align:right;color:#15803d">${fmt(run.total_net)}</td>
      </tr></tfoot>
    </table>

    <p style="margin-top:12px;font-size:8pt;color:#9ca3af">
      Employer pension contribution: ${fmt(run.total_pension_employer)} (not deducted from salaries) · Generated ${new Date().toLocaleDateString('en-NG')}
    </p>
  </div>`
})
