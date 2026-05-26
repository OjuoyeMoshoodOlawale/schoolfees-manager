const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

function getAutoRecalc() {
  try { return require('./billing').autoRecalcStudentBills } catch { return null }
}

// Recalculate which bill lines exist for every active student in a class/term
function recalcWholeClass(db, class_id, term_id) {
  const autoRecalc = getAutoRecalc()
  if (!autoRecalc) return
  const students = db.prepare(
    "SELECT student_id FROM student_status WHERE class_id=? AND term_id=? AND status='active'"
  ).all([class_id, term_id])
  for (const { student_id } of students) {
    try {
      db.exec('BEGIN')
      autoRecalc(db, student_id, term_id)
      db.exec('COMMIT')
    } catch(e) { try { db.exec('ROLLBACK') } catch {} }
  }
}

// Sync amounts on existing PENDING bills when config amount changes.
// Only safe to call when no payments exist yet (config is still a draft).
function syncAmountsForClass(db, class_id, term_id) {
  // First recalc which lines exist (adds/removes based on rules)
  recalcWholeClass(db, class_id, term_id)
  // Then sync amounts on remaining pending bills to match current config
  const configs = db.prepare('SELECT * FROM bill_config WHERE class_id=? AND term_id=?').all([class_id, term_id])
  for (const config of configs) {
    db.prepare(`
      UPDATE student_bills SET amount=?, is_compulsory=?
      WHERE bill_config_id=? AND term_id=? AND status='pending'
    `).run([config.amount, config.is_compulsory, config.id, term_id])
  }
}

module.exports = function register_feesHandlers() {
// ─── Phase 2: Fee Items & Bill Config ──────────────────────────────────────

ipcMain.handle('fee-items:list', () =>
  getDb().prepare(`
    SELECT fi.*,
      CASE WHEN EXISTS (SELECT 1 FROM bill_config WHERE fee_item_id=fi.id) THEN 1 ELSE 0 END as in_use
    FROM fee_items fi ORDER BY fi.name
  `).all()
)
ipcMain.handle('fee-items:create', (_, { name, description = '' }) => {
  const info = getDb().prepare('INSERT INTO fee_items (name, description) VALUES (?,?)').run([name.trim(), description])
  return { id: info.lastInsertRowid }
})
ipcMain.handle('fee-items:update', (_, { id, name, description = '', is_active }) => {
  const db = getDb()
  // If this item is used in any bill config, its name is locked (it appears on historical statements)
  const inUse = db.prepare('SELECT id FROM bill_config WHERE fee_item_id=? LIMIT 1').get(id)
  if (inUse) {
    // Only allow description and active/inactive toggle — not name rename
    db.prepare('UPDATE fee_items SET description=?, is_active=? WHERE id=?').run([description, is_active, id])
    return { ok: true, nameLocked: true }
  }
  db.prepare('UPDATE fee_items SET name=?, description=?, is_active=? WHERE id=?')
    .run([name.trim(), description, is_active, id])
  return { ok: true, nameLocked: false }
})
ipcMain.handle('fee-items:delete', (_, id) => {
  const db = getDb()
  const inConfig = db.prepare('SELECT id FROM bill_config WHERE fee_item_id=? LIMIT 1').get(id)
  if (inConfig) throw new Error('This fee item is used in a bill configuration and cannot be deleted. Deactivate it instead.')
  const inBills = db.prepare(
    'SELECT sb.id FROM student_bills sb JOIN bill_config bc ON bc.id=sb.bill_config_id WHERE bc.fee_item_id=? LIMIT 1'
  ).get(id)
  if (inBills) throw new Error('Student bills have been generated using this fee item. It cannot be deleted — deactivate it instead.')
  db.prepare('DELETE FROM fee_items WHERE id=?').run(id)
  return { ok: true }
})
ipcMain.handle('fee-items:seed', () => {
  const db = getDb()
  const defaults = [
    'Tuition Fee', 'Sportswear', 'Medical Levy', 'Examination Fee',
    'PTA Levy', 'ICT Fee', 'Library Fee', 'Development Levy',
    'Boarding Fee', 'Feeding Fee', 'Uniform Fee', 'Excursion Fee'
  ]
  const insert = db.prepare('INSERT OR IGNORE INTO fee_items (name) VALUES (?)')
  db.exec('BEGIN')
  try { for (const n of defaults) insert.run(n) 
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }
  return { ok: true }
})

ipcMain.handle('bill-config:list', (_, { term_id, class_id } = {}) => {
  const db = getDb()
  let sql = `SELECT bc.*,
    COALESCE(bc.gender_rule,'all') as gender_rule,
    COALESCE(bc.student_type_rule,'all') as student_type_rule,
    COALESCE(bc.boarding_rule,'all') as boarding_rule,
    fi.name as fee_item_name, c.name as class_name, t.name as term_name, s.name as session_name
    FROM bill_config bc
    JOIN fee_items fi ON fi.id = bc.fee_item_id
    JOIN classes c ON c.id = bc.class_id
    JOIN terms t ON t.id = bc.term_id
    JOIN sessions s ON s.id = t.session_id
    WHERE 1=1`
  const params = []
  if (term_id)  { sql += ' AND bc.term_id=?';  params.push(term_id) }
  if (class_id) { sql += ' AND bc.class_id=?'; params.push(class_id) }
  sql += ' ORDER BY fi.name'
  return db.prepare(sql).all(params)
})

ipcMain.handle('bill-config:upsert', (_, data) => {
  const db = getDb()
  const {
    id, term_id, class_id, fee_item_id, amount,
    gender_rule = 'all', student_type_rule = 'all',
    boarding_rule = 'all', is_compulsory = 1, is_active = 1
  } = data

  // Determine the target term
  const targetTermId = id
    ? db.prepare('SELECT term_id FROM bill_config WHERE id=?').get(id)?.term_id
    : term_id

  // ── Lock rule: payment-triggered, not date-triggered ──────────────────────
  // A past term (not current, not future) is always fully locked.
  // A current or future term is locked only once the first payment exists in it.
  // Before any payment: config is a draft — freely editable, amounts sync to bills.
  // After first payment: amounts are reconciled — only adjustments allowed.
  const currentTerm = db.prepare('SELECT * FROM terms WHERE is_current=1').get()
  const isPastTerm  = currentTerm && targetTermId < currentTerm.id
  const hasPayment  = db.prepare(
    'SELECT id FROM payments WHERE term_id=? AND is_reversed=0 LIMIT 1'
  ).get(targetTermId)

  if (isPastTerm) {
    throw new Error('Past term fee configuration cannot be changed. Use adjustments for individual student corrections.')
  }
  if (hasPayment) {
    throw new Error(
      'Payments have already been recorded for this term. ' +
      'Fee configuration is now locked to protect reconciliation. ' +
      'Use adjustments on individual student bills for corrections.'
    )
  }

  // No payments yet — config is a draft, freely editable
  if (id) {
    const existing = db.prepare('SELECT class_id, term_id FROM bill_config WHERE id=?').get(id)
    db.prepare(`UPDATE bill_config SET amount=?, gender_rule=?, student_type_rule=?,
      boarding_rule=?, is_compulsory=?, is_active=? WHERE id=?`)
      .run([amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active, id])
    // Sync amounts on all existing pending bills — config is still a draft
    syncAmountsForClass(db, existing?.class_id || class_id, existing?.term_id || term_id)
    return { id }
  } else {
    const info = db.prepare(`INSERT INTO bill_config
      (term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run([term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active])
    recalcWholeClass(db, class_id, term_id)
    return { id: info.lastInsertRowid }
  }
})


ipcMain.handle('bill-config:delete', (_, id) => {
  const db = getDb()
  const config = db.prepare('SELECT * FROM bill_config WHERE id=?').get(id)
  if (!config) throw new Error('Config not found')

  const currentTerm = db.prepare('SELECT * FROM terms WHERE is_current=1').get()
  const isPastTerm  = currentTerm && config.term_id < currentTerm.id
  if (isPastTerm) throw new Error('Past term fee configuration cannot be deleted.')

  const hasPayment = db.prepare(
    'SELECT id FROM payments WHERE term_id=? AND is_reversed=0 LIMIT 1'
  ).get(config.term_id)
  if (hasPayment) throw new Error('Cannot delete — payments have been recorded for this term. Deactivate the fee item instead.')

  db.prepare('DELETE FROM bill_config WHERE id=?').run(id)
  return { ok: true }
})


ipcMain.handle('bill-config:copy', (_, { from_term_id, from_class_id, to_term_id, to_class_id, overwrite = false }) => {
  const db = getDb()
  const source = db.prepare('SELECT * FROM bill_config WHERE term_id=? AND class_id=?').all([from_term_id, from_class_id])
  if (!source.length) throw new Error('No bill configurations found for the source term and class.')
  let inserted = 0, skipped = 0
  const insert = db.prepare(`INSERT INTO bill_config
    (term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active, copied_from_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
  const deleteExisting = db.prepare('DELETE FROM bill_config WHERE term_id=? AND class_id=? AND fee_item_id=?')
  const checkExisting = db.prepare('SELECT id FROM bill_config WHERE term_id=? AND class_id=? AND fee_item_id=?')
  db.exec('BEGIN')
  try {
    for (const row of source) {
      const exists = checkExisting.get([to_term_id, to_class_id, row.fee_item_id])
      if (exists) {
        if (overwrite) deleteExisting.run([to_term_id, to_class_id, row.fee_item_id])
        else { skipped++; continue }
      }
      insert.run([
        to_term_id, to_class_id, row.fee_item_id, row.amount,
        row.gender_rule   || 'all',
        row.student_type_rule || 'all',
        row.boarding_rule || 'all',
        row.is_compulsory ?? 1,
        row.is_active     ?? 1,
        row.id
      ])
      inserted++
    }
  
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }
  db.prepare('INSERT INTO bill_config_copy_log (from_term_id, to_term_id, from_class_id, to_class_id) VALUES (?,?,?,?)')
    .run([from_term_id, to_term_id, from_class_id, to_class_id])
  return { ok: true, inserted, skipped }
})

ipcMain.handle('bill-config:copy-log', () => {
  return getDb().prepare(`SELECT l.*,
    t1.name as from_term_name, s1.name as from_session_name,
    t2.name as to_term_name, s2.name as to_session_name,
    c1.name as from_class_name, c2.name as to_class_name
    FROM bill_config_copy_log l
    JOIN terms t1 ON t1.id=l.from_term_id JOIN sessions s1 ON s1.id=t1.session_id
    JOIN terms t2 ON t2.id=l.to_term_id   JOIN sessions s2 ON s2.id=t2.session_id
    JOIN classes c1 ON c1.id=l.from_class_id
    JOIN classes c2 ON c2.id=l.to_class_id
    ORDER BY l.id DESC LIMIT 50`).all()
})

ipcMain.handle('bill-config:preview', (_, { term_id, class_id }) => {
  const configs = getDb().prepare(`SELECT bc.*, fi.name as fee_item_name
    FROM bill_config bc JOIN fee_items fi ON fi.id=bc.fee_item_id
    WHERE bc.term_id=? AND bc.class_id=? AND bc.is_active=1 ORDER BY fi.name`).all([term_id, class_id])
  const profiles = [
    { gender: 'M', student_type: 'new',       boarding: 'day' },
    { gender: 'M', student_type: 'new',       boarding: 'boarding' },
    { gender: 'M', student_type: 'returning', boarding: 'day' },
    { gender: 'M', student_type: 'returning', boarding: 'boarding' },
    { gender: 'F', student_type: 'new',       boarding: 'day' },
    { gender: 'F', student_type: 'new',       boarding: 'boarding' },
    { gender: 'F', student_type: 'returning', boarding: 'day' },
    { gender: 'F', student_type: 'returning', boarding: 'boarding' },
  ]
  const gMap = { M: 'male', F: 'female' }
  return profiles.map(p => {
    const items = configs.filter(c =>
      (c.gender_rule       === 'all' || c.gender_rule       === gMap[p.gender]) &&
      (c.student_type_rule === 'all' || c.student_type_rule === p.student_type) &&
      (c.boarding_rule     === 'all' || c.boarding_rule     === p.boarding)
    )
    return {
      ...p,
      items,
      total: items.reduce((s, i) => s + Number(i.amount), 0),
      compulsory_total: items.filter(i => i.is_compulsory).reduce((s, i) => s + Number(i.amount), 0)
    }
  })
})

}
