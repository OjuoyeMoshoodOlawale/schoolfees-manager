const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

function checkAccounting() {
  const enabled = getDb().prepare("SELECT value FROM app_state WHERE key='accounting_enabled'").get()?.value
  if (enabled !== '1') throw new Error('Accounting module is not enabled for this installation.')
}

module.exports = function registerAccountingHandlers() {

  // ── Chart of Accounts ──────────────────────────────────────────────────────

  ipcMain.handle('accounts:list', () => {
    return getDb().prepare('SELECT * FROM accounts ORDER BY code').all()
  })

  ipcMain.handle('accounts:create', (_, { code, name, type, account_group = '' }) => {
    checkAccounting()
    const info = getDb().prepare('INSERT INTO accounts (code, name, type, account_group) VALUES (?,?,?,?)')
      .run([code, name, type, account_group])
    return { ok: true, id: info.lastInsertRowid }
  })

  ipcMain.handle('accounts:update', (_, { id, code, name, type, account_group, is_active }) => {
    checkAccounting()
    getDb().prepare('UPDATE accounts SET code=?,name=?,type=?,account_group=?,is_active=? WHERE id=?')
      .run([code, name, type, account_group, is_active, id])
    return { ok: true }
  })

  ipcMain.handle('accounts:delete', (_, id) => {
    const used = getDb().prepare('SELECT id FROM journal_lines WHERE account_id=? LIMIT 1').get([id])
    if (used) throw new Error('Account has journal entries and cannot be deleted.')
    getDb().prepare('DELETE FROM accounts WHERE id=?').run([id])
    return { ok: true }
  })

  // ── Journal Entries ────────────────────────────────────────────────────────

  ipcMain.handle('journal:list', (_, { limit = 100, from_date, to_date } = {}) => {
    const db = getDb()
    let sql = `SELECT je.*, COUNT(jl.id) as line_count,
      SUM(jl.debit) as total_debit, SUM(jl.credit) as total_credit
      FROM journal_entries je
      LEFT JOIN journal_lines jl ON jl.entry_id=je.id
      WHERE 1=1`
    const params = []
    if (from_date) { sql += ' AND je.entry_date>=?'; params.push(from_date) }
    if (to_date)   { sql += ' AND je.entry_date<=?'; params.push(to_date) }
    sql += ' GROUP BY je.id ORDER BY je.entry_date DESC, je.id DESC LIMIT ?'
    params.push(limit)
    return db.prepare(sql).all(params)
  })

  ipcMain.handle('journal:get', (_, id) => {
    const db = getDb()
    const entry = db.prepare('SELECT * FROM journal_entries WHERE id=?').get([id])
    if (!entry) return null
    const lines = db.prepare(`SELECT jl.*, a.name as account_name, a.code as account_code, a.type as account_type
      FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
      WHERE jl.entry_id=? ORDER BY jl.id`).all([id])
    return { ...entry, lines }
  })

  ipcMain.handle('journal:post', (_, { description, entry_date, entry_type = 'manual', lines, posted_by = 'admin' }) => {
    checkAccounting()
    const db = getDb()
    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0)
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`)
    }

    const year = new Date().getFullYear()
    const last = db.prepare(`SELECT reference FROM journal_entries WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`).get([`JNL-${year}-%`])
    const seq  = last ? String(parseInt(last.reference.split('-')[2]) + 1).padStart(4,'0') : '0001'
    const reference = `JNL-${year}-${seq}`

    db.exec('BEGIN')
    try {
      const info = db.prepare('INSERT INTO journal_entries (reference, description, entry_date, entry_type, posted_by) VALUES (?,?,?,?,?)')
        .run([reference, description, entry_date, entry_type, posted_by])
      const entryId = info.lastInsertRowid

      const insertLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit, credit, narration) VALUES (?,?,?,?,?)')
      for (const line of lines) {
        insertLine.run([entryId, line.account_id, Number(line.debit || 0), Number(line.credit || 0), line.narration || ''])
        // Update account balance (debit increases assets/expenses, credit increases liabilities/equity/income)
        const account = db.prepare('SELECT * FROM accounts WHERE id=?').get([line.account_id])
        if (account) {
          let balanceChange = 0
          if (['asset','expense'].includes(account.type))        balanceChange = Number(line.debit || 0) - Number(line.credit || 0)
          else if (['liability','equity','income'].includes(account.type)) balanceChange = Number(line.credit || 0) - Number(line.debit || 0)
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id=?').run([balanceChange, line.account_id])
        }
      }
      db.exec('COMMIT')
      return { ok: true, id: entryId, reference }
    } catch(e) { db.exec('ROLLBACK'); throw e }
  })

  // ── Account Statement ──────────────────────────────────────────────────────

  ipcMain.handle('accounts:statement', (_, { account_id, from_date, to_date }) => {
    const db = getDb()
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get([account_id])
    if (!account) throw new Error('Account not found')

    let sql = `SELECT jl.*, je.reference, je.description, je.entry_date, je.entry_type
      FROM journal_lines jl
      JOIN journal_entries je ON je.id=jl.entry_id
      WHERE jl.account_id=?`
    const params = [account_id]
    if (from_date) { sql += ' AND je.entry_date>=?'; params.push(from_date) }
    if (to_date)   { sql += ' AND je.entry_date<=?'; params.push(to_date) }
    sql += ' ORDER BY je.entry_date, je.id'

    const lines  = db.prepare(sql).all(params)
    let balance  = 0
    const rows   = lines.map(l => {
      const isDebitNormal = ['asset','expense'].includes(account.type)
      balance += isDebitNormal
        ? Number(l.debit || 0) - Number(l.credit || 0)
        : Number(l.credit || 0) - Number(l.debit || 0)
      return { ...l, running_balance: balance }
    })

    return { account, lines: rows, closing_balance: balance }
  })

  // ── Trial Balance ──────────────────────────────────────────────────────────

  ipcMain.handle('accounts:trial-balance', () => {
    const accounts = getDb().prepare(`SELECT a.*,
      COALESCE(SUM(jl.debit),0) as total_debit,
      COALESCE(SUM(jl.credit),0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id=a.id
      WHERE a.is_active=1
      GROUP BY a.id ORDER BY a.code`).all()

    const totalDebit  = accounts.reduce((s, a) => s + Number(a.total_debit), 0)
    const totalCredit = accounts.reduce((s, a) => s + Number(a.total_credit), 0)
    return { accounts, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  })

  // ── Ledger ─────────────────────────────────────────────────────────────────

  ipcMain.handle('accounts:ledger', (_, { from_date, to_date } = {}) => {
    const accounts = getDb().prepare('SELECT * FROM accounts WHERE is_active=1 ORDER BY code').all()
    return accounts.map(account => {
      let sql = `SELECT jl.*, je.reference, je.description, je.entry_date
        FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
        WHERE jl.account_id=?`
      const params = [account.id]
      if (from_date) { sql += ' AND je.entry_date>=?'; params.push(from_date) }
      if (to_date)   { sql += ' AND je.entry_date<=?'; params.push(to_date) }
      sql += ' ORDER BY je.entry_date, je.id'
      const lines = getDb().prepare(sql).all(params)
      const totalDebit  = lines.reduce((s, l) => s + Number(l.debit), 0)
      const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
      return { ...account, lines, totalDebit, totalCredit }
    }).filter(a => a.lines.length > 0)
  })

  // ── Invoices ───────────────────────────────────────────────────────────────

  ipcMain.handle('invoices:list', () => {
    return getDb().prepare('SELECT * FROM invoices ORDER BY id DESC').all()
  })

  ipcMain.handle('invoices:get', (_, id) => {
    const db = getDb()
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get([id])
    if (!invoice) return null
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all([id])
    return { ...invoice, items }
  })

  ipcMain.handle('invoices:create', (_, data) => {
    checkAccounting()
    const db = getDb()
    const year = new Date().getFullYear()
    const last = db.prepare(`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`).get([`INV-${year}-%`])
    const seq  = last ? String(parseInt(last.invoice_number.split('-')[2]) + 1).padStart(4,'0') : '0001'
    const invoice_number = `INV-${year}-${seq}`

    db.exec('BEGIN')
    try {
      const { items = [], ...inv } = data
      const subtotal   = items.reduce((s, i) => s + Number(i.amount || 0), 0)
      const tax_amount = Math.round(subtotal * (Number(inv.tax_rate || 0) / 100) * 100) / 100
      const total      = subtotal + tax_amount

      const info = db.prepare(`INSERT INTO invoices
        (invoice_number,payee_name,payee_address,invoice_date,due_date,status,subtotal,tax_rate,tax_amount,total,notes,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run([invoice_number, inv.payee_name, inv.payee_address||'', inv.invoice_date,
              inv.due_date||null, 'draft', subtotal, inv.tax_rate||0, tax_amount, total, inv.notes||'', inv.created_by||'admin'])
      const invoiceId = info.lastInsertRowid

      const insertItem = db.prepare('INSERT INTO invoice_items (invoice_id,description,quantity,unit_price,amount) VALUES (?,?,?,?,?)')
      for (const item of items) {
        insertItem.run([invoiceId, item.description, item.quantity||1, item.unit_price||0, item.amount||0])
      }
      db.exec('COMMIT')
      return { ok: true, id: invoiceId, invoice_number }
    } catch(e) { db.exec('ROLLBACK'); throw e }
  })

  ipcMain.handle('invoices:update-status', (_, { id, status }) => {
    getDb().prepare('UPDATE invoices SET status=? WHERE id=?').run([status, id])
    return { ok: true }
  })

  ipcMain.handle('invoices:delete', (_, id) => {
    getDb().prepare('DELETE FROM invoices WHERE id=?').run([id])
    return { ok: true }
  })
}
