'use strict'
/**
 * Bulk import handler — loads a JSON file produced from a school's existing
 * spreadsheet into the database.
 *
 * Expected input shape (alminhaaj_import.json format):
 *   {
 *     school_name, session, current_term,
 *     classes: ["JS 1", ...],
 *     fee_items: [{name, description, boarders_only}],
 *     class_bills: { "JS 1": {"Tuition": 42500, "Hostel Fee": 197000} },
 *     students: [{name, class, gender, boarding, bills:[...], payments:[...]}]
 *   }
 */

const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const { getDb } = require('../lib/database')
const { safeHandle, logError } = require('./errorHandler')

// Split full name into first/last
function splitName(full) {
  const parts = (full || '').trim().split(/\s+/)
  if (parts.length === 0) return { first_name: '', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

// Match a class name in the DB. Tries exact, then with/without space, then case-insensitive.
function findClassId(db, label) {
  const tries = [
    label,
    label.replace(/\s/g, ''),
    label.replace('JS ', 'JSS '),
    label.replace('SS ', 'SSS '),
    label.replace('JS', 'JSS'),
    label.replace('SS', 'SSS'),
  ]
  for (const t of tries) {
    const row = db.prepare('SELECT id FROM classes WHERE name=? COLLATE NOCASE').get([t])
    if (row) return row.id
  }
  return null
}

// Match a term name to an existing term row. Tries 1st/2nd/3rd as integer + name.
function findTermId(db, sessionName, termLabel) {
  const sess = db.prepare('SELECT id FROM sessions WHERE name=?').get([sessionName])
  if (!sess) return null
  // try exact name match first
  let row = db.prepare('SELECT id FROM terms WHERE session_id=? AND name=? COLLATE NOCASE').get([sess.id, termLabel])
  if (row) return row.id
  // try LIKE
  row = db.prepare("SELECT id FROM terms WHERE session_id=? AND name LIKE ?").get([sess.id, '%'+termLabel+'%'])
  return row?.id || null
}

// ─────────────────────────────────────────────────────────────────────────────
// import:preview — read the file and show a summary BEFORE writing anything
// ─────────────────────────────────────────────────────────────────────────────
safeHandle('import:preview', (_, filepath) => {
  if (!filepath || !fs.existsSync(filepath)) throw new Error('Import file not found')
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
  if (!data.students || !Array.isArray(data.students)) throw new Error('Invalid import file: missing students array')

  const billed   = data.students.reduce((s, st) => s + (st.bills||[]).reduce((a,b)=>a+(+b.amount||0),0), 0)
  const paid     = data.students.reduce((s, st) => s + (st.payments||[]).reduce((a,p)=>a+(+p.amount||0),0), 0)
  const boarders = data.students.filter(s => s.boarding === 'boarding').length

  const byClass = {}
  for (const s of data.students) {
    const c = s.class || '(unknown)'
    byClass[c] = (byClass[c]||0) + 1
  }

  return {
    school_name:  data.school_name,
    session:      data.session,
    current_term: data.current_term,
    students:     data.students.length,
    boarders,
    bills:        data.students.reduce((s,st) => s + (st.bills||[]).length, 0),
    payments:     data.students.reduce((s,st) => s + (st.payments||[]).length, 0),
    billed_total: billed,
    paid_total:   paid,
    by_class:     byClass,
    fee_items:    (data.fee_items || []).map(f => f.name),
    classes:      data.classes || [],
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// import:execute — wipe student-related data (preserving settings/users) and
// reload from the JSON file. Wrapped in a transaction so any error rolls back.
// ─────────────────────────────────────────────────────────────────────────────
safeHandle('import:execute', (_, { filepath, wipe = false }) => {
  if (!filepath || !fs.existsSync(filepath)) throw new Error('Import file not found')
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
  if (!data.students || !Array.isArray(data.students)) throw new Error('Invalid import file')

  const db = getDb()
  const result = { students: 0, bills: 0, payments: 0, skipped: 0, warnings: [] }

  db.exec('BEGIN')
  try {
    // ── Optional: wipe existing student data ─────────────────────────────────
    if (wipe) {
      db.exec(`
        DELETE FROM payments;
        DELETE FROM student_bills;
        DELETE FROM student_status;
        DELETE FROM students;
      `)
    }

    // ── Ensure session exists ────────────────────────────────────────────────
    const sessName = data.session || '2025/2026'
    let sessRow = db.prepare('SELECT id FROM sessions WHERE name=?').get([sessName])
    if (!sessRow) {
      const info = db.prepare('INSERT INTO sessions (name) VALUES (?)').run([sessName])
      const sid = info.lastInsertRowid
      // Create the three terms — names must match what import uses
      for (const tn of ['1st Term', '2nd Term', '3rd Term']) {
        db.prepare('INSERT INTO terms (session_id, name) VALUES (?,?)').run([sid, tn])
      }
      sessRow = { id: sid }
    }
    const sessionId = sessRow.id

    // Find term ids and mark current
    const termIds = {}
    for (const tn of ['1st Term', '2nd Term', '3rd Term']) {
      const t = db.prepare('SELECT id FROM terms WHERE session_id=? AND name=? COLLATE NOCASE').get([sessionId, tn])
      if (t) termIds[tn] = t.id
    }
    if (data.current_term && termIds[data.current_term]) {
      db.prepare("UPDATE terms SET is_current=0").run([])
      db.prepare('UPDATE terms SET is_current=1 WHERE id=?').run([termIds[data.current_term]])
    }

    // ── Ensure classes exist ─────────────────────────────────────────────────
    for (const cls of (data.classes || [])) {
      const exists = db.prepare('SELECT id FROM classes WHERE name=? COLLATE NOCASE').get([cls])
      if (!exists) {
        // derive numeric level from "JS 1" → 1, "SS 3" → 6
        const m = cls.match(/([JS])S\s*(\d)/i)
        const level = m ? (m[1].toUpperCase() === 'J' ? Number(m[2]) : 3 + Number(m[2])) : 0
        db.prepare('INSERT INTO classes (name, level) VALUES (?,?)').run([cls, level])
      }
    }

    // ── Ensure fee_items exist ───────────────────────────────────────────────
    for (const fi of (data.fee_items || [])) {
      const exists = db.prepare('SELECT id FROM fee_items WHERE name=? COLLATE NOCASE').get([fi.name])
      if (!exists) {
        db.prepare('INSERT INTO fee_items (name, description) VALUES (?,?)').run([fi.name, fi.description || ''])
      }
    }

    // ── Create bill_config rows for each class × term × fee_item ────────────
    const feeItemIds = {}
    for (const fi of (data.fee_items || [])) {
      const r = db.prepare('SELECT id FROM fee_items WHERE name=? COLLATE NOCASE').get([fi.name])
      if (r) feeItemIds[fi.name] = r.id
    }
    for (const [cls, bills] of Object.entries(data.class_bills || {})) {
      const cid = findClassId(db, cls)
      if (!cid) { result.warnings.push(`Skipped bill_config for unknown class ${cls}`); continue }
      for (const [feeName, amount] of Object.entries(bills)) {
        const fid = feeItemIds[feeName]
        if (!fid) continue
        const isBoarders = data.fee_items.find(f => f.name === feeName)?.boarders_only ? 'boarding' : 'all'
        for (const termName of Object.keys(termIds)) {
          const tid = termIds[termName]
          // Skip if already configured
          const ex = db.prepare('SELECT id FROM bill_config WHERE class_id=? AND term_id=? AND fee_item_id=?').get([cid, tid, fid])
          if (ex) continue
          db.prepare(`INSERT INTO bill_config
            (class_id, term_id, fee_item_id, amount, is_compulsory, gender_rule, student_type_rule, boarding_rule, is_active)
            VALUES (?,?,?,?,1,'all','all',?,1)`).run([cid, tid, fid, amount, isBoarders])
        }
      }
    }

    // ── Insert students + their bills + payments ─────────────────────────────
    let regSeq = db.prepare("SELECT COUNT(*) as c FROM students").get()?.c || 0
    const year = new Date().getFullYear()
    const insStudent = db.prepare(`INSERT INTO students
      (reg_number,first_name,last_name,other_names,gender,date_of_birth,phone,
      parent_name,parent_phone,parent_email,address,photo_path,entry_type,boarding_type)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insStatus = db.prepare(`INSERT INTO student_status (student_id, session_id, term_id, class_id, status, is_new_student)
      VALUES (?,?,?,?,'active',0)`)
    const insBill = db.prepare(`INSERT INTO student_bills
      (student_id, term_id, bill_config_id, amount, is_compulsory, status)
      VALUES (?,?,?,?,1,'pending')`)
    const insPayment = db.prepare(`INSERT INTO payments
      (student_id, term_id, receipt_number, amount_paid, payment_date, payment_method, reference, posted_by)
      VALUES (?,?,?,?,?,?,?,?)`)

    let receiptSeq = db.prepare("SELECT COUNT(*) as c FROM payments").get()?.c || 0

    for (const s of data.students) {
      if (!s.name) { result.skipped++; continue }
      const classId = findClassId(db, s.class)
      if (!classId) {
        result.warnings.push(`Skipped ${s.name}: unknown class ${s.class}`)
        result.skipped++; continue
      }
      regSeq++
      const reg = `AMC/${year}/${String(regSeq).padStart(4,'0')}`
      const { first_name, last_name } = splitName(s.name)
      const info = insStudent.run([
        reg, first_name, last_name, '',
        s.gender || 'M', '', '',
        '', '', '', '', '',
        'returning',
        s.boarding === 'boarding' ? 'boarding' : 'day',
      ])
      const sid = info.lastInsertRowid
      // Status for current term (so the student appears in lists)
      const currentTid = termIds[data.current_term || '3rd Term']
      if (currentTid) insStatus.run([sid, sessionId, currentTid, classId, 'active', 0])
      result.students++

      // Insert each bill
      for (const b of (s.bills || [])) {
        const tid = termIds[b.term]
        if (!tid) continue
        const fid = feeItemIds[b.fee_item]
        if (!fid) continue
        // find a matching bill_config
        const bcfg = db.prepare(`SELECT id FROM bill_config WHERE class_id=? AND term_id=? AND fee_item_id=? LIMIT 1`).get([classId, tid, fid])
        if (!bcfg) continue
        insBill.run([sid, tid, bcfg.id, +b.amount || 0])
        result.bills++
      }

      // Insert each payment
      for (const p of (s.payments || [])) {
        const tid = termIds[p.term]
        if (!tid) continue
        if (!p.amount || +p.amount <= 0) continue
        receiptSeq++
        const rcp = `IMP-${year}-${String(receiptSeq).padStart(4,'0')}`
        const pdate = p.date || new Date().toISOString().slice(0,10)
        insPayment.run([sid, tid, rcp, +p.amount, pdate, 'cash',
          p.reference || `Imported (${p.term} ${p.fee_item})`, 'import'])
        result.payments++
      }
    }

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    logError({ handler: 'import:execute', message: e.message, stack: e.stack,
      context: JSON.stringify({ filepath }), severity: 'error' })
    throw e
  }

  return result
})

// ─────────────────────────────────────────────────────────────────────────────
// import:pick-file — open file picker dialog
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('import:pick-file', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select import JSON file',
    filters: [{ name: 'JSON files', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths?.[0]) return null
  return r.filePaths[0]
})
