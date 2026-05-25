const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_feesHandlers() {
// ─── Phase 2: Fee Items & Bill Config ──────────────────────────────────────

ipcMain.handle('fee-items:list', () =>
  getDb().prepare('SELECT * FROM fee_items ORDER BY name').all()
)
ipcMain.handle('fee-items:create', (_, { name, description = '' }) => {
  const info = getDb().prepare('INSERT INTO fee_items (name, description) VALUES (?,?)').run([name.trim(), description])
  return { id: info.lastInsertRowid }
})
ipcMain.handle('fee-items:update', (_, { id, name, description = '', is_active }) => {
  getDb().prepare('UPDATE fee_items SET name=?, description=?, is_active=? WHERE id=?')
    .run([name.trim(), description, is_active, id])
  return { ok: true }
})
ipcMain.handle('fee-items:delete', (_, id) => {
  const used = getDb().prepare('SELECT id FROM bill_config WHERE fee_item_id=? LIMIT 1').get(id)
  if (used) throw new Error('Fee item is used in a bill configuration and cannot be deleted.')
  getDb().prepare('DELETE FROM fee_items WHERE id=?').run(id)
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
  if (id) {
    db.prepare(`UPDATE bill_config SET amount=?, gender_rule=?, student_type_rule=?,
      boarding_rule=?, is_compulsory=?, is_active=? WHERE id=?`)
      .run([amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active, id])
    return { id }
  } else {
    const info = db.prepare(`INSERT INTO bill_config
      (term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run([term_id, class_id, fee_item_id, amount, gender_rule, student_type_rule, boarding_rule, is_compulsory, is_active])
    return { id: info.lastInsertRowid }
  }
})

ipcMain.handle('bill-config:delete', (_, id) => {
  const used = getDb().prepare('SELECT id FROM student_bills WHERE bill_config_id=? LIMIT 1').get(id)
  if (used) throw new Error('Bills have already been generated from this config.')
  getDb().prepare('DELETE FROM bill_config WHERE id=?').run(id)
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
