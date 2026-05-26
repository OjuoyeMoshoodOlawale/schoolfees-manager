'use strict'
/**
 * Expense & Procurement Module — Phase 6
 *
 * Entities:
 *   suppliers          → vendors / service providers
 *   expense_categories → linked to a chart-of-accounts expense account
 *   expenses           → individual expense records
 *
 * Workflow:  draft → approved → paid
 *   - On approval: auto-post journal entry
 *       DR  Expense Account (from category)
 *       CR  Cash on Hand / Bank Account / Petty Cash / Accounts Payable
 *   - On rejection: back to draft with reason
 *   - Paid marks the payment date
 *
 * Paid-from account codes:
 *   cash       → 1001  Cash on Hand
 *   bank       → 1002  Bank Account
 *   petty_cash → 1003  Petty Cash
 *   payable    → 2001  Accounts Payable
 */

const { ipcMain } = require('electron')
const { safeHandle, logError } = require('./errorHandler')
const { getDb }   = require('../lib/database')

const PAID_FROM_ACCOUNT = {
  cash:       '1001',
  bank:       '1002',
  petty_cash: '1003',
  payable:    '2001',
}

// ── Auto-generate expense number ──────────────────────────────────────────────
function nextExpenseNumber(db) {
  const last = db.prepare("SELECT expense_number FROM expenses ORDER BY id DESC LIMIT 1").get()
  if (!last) return 'EXP-0001'
  const n = parseInt(last.expense_number.replace('EXP-', '')) || 0
  return 'EXP-' + String(n + 1).padStart(4, '0')
}

// ── Post journal entry for an approved expense ────────────────────────────────
function postExpenseJournal(db, expense) {
  const cat     = db.prepare('SELECT ec.*, a.id as account_id FROM expense_categories ec LEFT JOIN accounts a ON a.id=ec.account_id WHERE ec.id=?').get([expense.category_id])
  const crCode  = PAID_FROM_ACCOUNT[expense.paid_from] || '1001'
  const crAcct  = db.prepare('SELECT id FROM accounts WHERE code=?').get([crCode])

  if (!cat?.account_id) throw new Error(`Expense category has no linked account. Please set the account in Expense Categories.`)
  if (!crAcct)          throw new Error(`Credit account for '${expense.paid_from}' not found in Chart of Accounts.`)

  const ref = `JE-EXP-${expense.expense_number}`
  // Check not already posted
  const exists = db.prepare('SELECT id FROM journal_entries WHERE reference=?').get([ref])
  if (exists) return exists.id

  const entryId = db.prepare(`
    INSERT INTO journal_entries (reference, description, entry_date, entry_type, posted_by)
    VALUES (?,?,?,?,?)
  `).run([ref,
    `Expense: ${expense.description} (${expense.expense_number})`,
    expense.expense_date, 'expense', expense.approved_by || 'admin'
  ]).lastInsertRowid

  const insertLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit, narration) VALUES (?,?,?,?,?)')
  insertLine.run([entryId, cat.account_id,   expense.amount, 0,              `${expense.description}`])
  insertLine.run([entryId, crAcct.id,        0,              expense.amount, `${expense.paid_from} payment`])

  // Update running account balances
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE id=?').run([expense.amount, cat.account_id])
  db.prepare('UPDATE accounts SET balance = balance - ? WHERE id=?').run([expense.amount, crAcct.id])

  return entryId
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIERS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('expenses:suppliers-list', (_, { include_inactive = false } = {}) => {
  const sql = include_inactive
    ? 'SELECT * FROM suppliers ORDER BY name'
    : 'SELECT * FROM suppliers WHERE is_active=1 ORDER BY name'
  return getDb().prepare(sql).all()
})

ipcMain.handle('expenses:supplier-save', (_, d) => {
  const db = getDb()
  const fields = ['name','contact_person','phone','email','address','bank_name','account_number','account_name','is_active']
  const vals   = fields.map(f => d[f] ?? null)
  if (d.id) {
    db.prepare(`UPDATE suppliers SET ${fields.map(f => f+'=?').join(',')} WHERE id=?`).run([...vals, d.id])
    return { id: d.id }
  }
  return { id: db.prepare(`INSERT INTO suppliers (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(vals).lastInsertRowid }
})

ipcMain.handle('expenses:supplier-delete', (_, id) => {
  const used = getDb().prepare('SELECT COUNT(*) as n FROM expenses WHERE supplier_id=?').get([id])?.n || 0
  if (used) throw new Error(`Supplier has ${used} expense(s) — cannot delete.`)
  getDb().prepare('DELETE FROM suppliers WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('expenses:categories-list', () => {
  return getDb().prepare(`
    SELECT ec.*, a.name as account_name, a.code as account_code
    FROM expense_categories ec LEFT JOIN accounts a ON a.id=ec.account_id
    ORDER BY ec.name
  `).all()
})

ipcMain.handle('expenses:category-save', (_, d) => {
  const db = getDb()
  if (d.id) {
    db.prepare('UPDATE expense_categories SET name=?,account_id=?,description=?,is_active=? WHERE id=?')
      .run([d.name, d.account_id||null, d.description||'', d.is_active??1, d.id])
    return { id: d.id }
  }
  return { id: db.prepare('INSERT INTO expense_categories (name,account_id,description,is_active) VALUES (?,?,?,?)')
    .run([d.name, d.account_id||null, d.description||'', d.is_active??1]).lastInsertRowid }
})

ipcMain.handle('expenses:category-delete', (_, id) => {
  const used = getDb().prepare('SELECT COUNT(*) as n FROM expenses WHERE category_id=?').get([id])?.n || 0
  if (used) throw new Error(`Category has ${used} expense(s) — cannot delete.`)
  getDb().prepare('DELETE FROM expense_categories WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('expenses:list', (_, { status, category_id, supplier_id, from_date, to_date, limit = 500 } = {}) => {
  const db = getDb()
  let sql = `
    SELECT e.*, ec.name as category_name, ec.account_id,
           s.name as supplier_name, a.name as account_name, a.code as account_code
    FROM expenses e
    JOIN expense_categories ec ON ec.id=e.category_id
    LEFT JOIN suppliers s ON s.id=e.supplier_id
    LEFT JOIN accounts a ON a.id=ec.account_id
    WHERE 1=1`
  const params = []
  if (status      && status !== 'all')      { sql += ' AND e.status=?';      params.push(status) }
  if (category_id)                          { sql += ' AND e.category_id=?'; params.push(category_id) }
  if (supplier_id)                          { sql += ' AND e.supplier_id=?'; params.push(supplier_id) }
  if (from_date)                            { sql += ' AND e.expense_date>=?'; params.push(from_date) }
  if (to_date)                              { sql += ' AND e.expense_date<=?'; params.push(to_date) }
  sql += ' ORDER BY e.expense_date DESC, e.id DESC LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(params)
})

ipcMain.handle('expenses:get', (_, id) => {
  return getDb().prepare(`
    SELECT e.*, ec.name as category_name, ec.account_id,
           s.name as supplier_name, a.name as account_name
    FROM expenses e
    JOIN expense_categories ec ON ec.id=e.category_id
    LEFT JOIN suppliers s ON s.id=e.supplier_id
    LEFT JOIN accounts a ON a.id=ec.account_id
    WHERE e.id=?`).get([id])
})

safeHandle('expenses:save', (_, d) => {
  const db = getDb()
  const fields = ['category_id','supplier_id','description','amount','expense_date',
                  'paid_from','payment_reference','notes','created_by']
  const vals   = fields.map(f => d[f] ?? null)

  if (d.id) {
    // Only draft expenses can be edited
    const curr = db.prepare('SELECT status FROM expenses WHERE id=?').get([d.id])
    if (curr?.status !== 'draft') throw new Error('Only draft expenses can be edited.')
    db.prepare(`UPDATE expenses SET ${fields.map(f => f+'=?').join(',')} WHERE id=?`).run([...vals, d.id])
    return { id: d.id }
  }
  const expNum = nextExpenseNumber(db)
  const id = db.prepare(`INSERT INTO expenses (expense_number,${fields.join(',')}) VALUES (?,${fields.map(()=>'?').join(',')})`)
    .run([expNum, ...vals]).lastInsertRowid
  return { id, expense_number: expNum }
})

safeHandle('expenses:approve', (_, { id, approved_by }) => {
  const db      = getDb()
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get([id])
  if (!expense) throw new Error('Expense not found')
  if (expense.status !== 'draft') throw new Error(`Cannot approve a ${expense.status} expense.`)

  // Auto-post journal entry
  const journalId = postExpenseJournal(db, { ...expense, approved_by: approved_by || 'admin' })

  db.prepare(`UPDATE expenses SET status='approved', approved_by=?, approved_at=datetime('now'), journal_entry_id=? WHERE id=?`)
    .run([approved_by || 'admin', journalId, id])
  return { ok: true, journal_entry_id: journalId }
})

ipcMain.handle('expenses:reject', (_, { id, reason }) => {
  const db      = getDb()
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get([id])
  if (!expense) throw new Error('Expense not found')
  if (expense.status === 'paid') throw new Error('Cannot reject a paid expense.')
  db.prepare(`UPDATE expenses SET status='draft', notes=?, approved_by='', approved_at=NULL WHERE id=?`)
    .run([(expense.notes ? expense.notes + '\n' : '') + `Rejected: ${reason || 'No reason given'}`, id])
  return { ok: true }
})

ipcMain.handle('expenses:mark-paid', (_, { id, payment_reference }) => {
  const db      = getDb()
  const expense = db.prepare('SELECT status FROM expenses WHERE id=?').get([id])
  if (!expense) throw new Error('Expense not found')
  if (expense.status !== 'approved') throw new Error('Expense must be approved before marking paid.')
  db.prepare(`UPDATE expenses SET status='paid', paid_at=datetime('now'), payment_reference=COALESCE(NULLIF(?,''),payment_reference) WHERE id=?`)
    .run([payment_reference || '', id])
  return { ok: true }
})

ipcMain.handle('expenses:delete', (_, id) => {
  const db      = getDb()
  const expense = db.prepare('SELECT status FROM expenses WHERE id=?').get([id])
  if (!expense) throw new Error('Not found')
  if (expense.status !== 'draft') throw new Error('Only draft expenses can be deleted.')
  db.prepare('DELETE FROM expenses WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE REPORTS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('expenses:report', (_, { from_date, to_date } = {}) => {
  const db     = getDb()
  const params = []
  let dateWhere = ''
  if (from_date) { dateWhere += ' AND e.expense_date>=?'; params.push(from_date) }
  if (to_date)   { dateWhere += ' AND e.expense_date<=?'; params.push(to_date) }

  const byCategory = db.prepare(`
    SELECT ec.name as category, COUNT(*) as n,
           COALESCE(SUM(CASE WHEN e.status!='rejected' THEN e.amount END),0) as total
    FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id
    WHERE 1=1 ${dateWhere}
    GROUP BY ec.id ORDER BY total DESC
  `).all(params)

  const byStatus = db.prepare(`
    SELECT e.status, COUNT(*) as n, COALESCE(SUM(e.amount),0) as total
    FROM expenses e WHERE 1=1 ${dateWhere}
    GROUP BY e.status
  `).all(params)

  const bySupplier = db.prepare(`
    SELECT COALESCE(s.name,'(No Supplier)') as supplier,
           COUNT(*) as n, COALESCE(SUM(e.amount),0) as total
    FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id
    WHERE e.status!='rejected' ${dateWhere}
    GROUP BY e.supplier_id ORDER BY total DESC LIMIT 10
  `).all(params)

  const totalApproved = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE status IN ('approved','paid') ${dateWhere}`).get(params)?.t || 0
  const totalPaid     = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE status='paid' ${dateWhere}`).get(params)?.t || 0
  const totalDraft    = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE status='draft' ${dateWhere}`).get(params)?.t || 0
  const totalCount    = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status!='rejected' ${dateWhere}`).get(params)?.n || 0

  return { byCategory, byStatus, bySupplier, totalApproved, totalPaid, totalDraft, totalCount }
})
