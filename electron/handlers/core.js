const { ipcMain, dialog } = require('electron')
const { getDb, getDbPath } = require('../lib/database')
const { safeHandle, logError } = require('./errorHandler')
const path = require('path')
const fs   = require('fs')

// Lazy-loaded so billing.js registers first (both modules loaded by main.js)
function getAutoRecalc() {
  try { return require('./billing').autoRecalcStudentBills } catch { return null }
}

module.exports = function register_coreHandlers() {
  const dbDir = path.dirname(getDbPath())
// ─── IPC Handlers ──────────────────────────────────────────────────────────

// Sessions
ipcMain.handle('sessions:list', () =>
  getDb().prepare('SELECT * FROM sessions ORDER BY name DESC').all()
)
ipcMain.handle('sessions:create', (_, name) => {
  const db = getDb()
  db.exec('BEGIN')
  let sid
  try {
    const info = db.prepare('INSERT INTO sessions (name) VALUES (?)').run(name)
    sid = info.lastInsertRowid
    const insertTerm = db.prepare('INSERT INTO terms (session_id, name) VALUES (?,?)')
    insertTerm.run([sid, 'First Term'])
    insertTerm.run([sid, 'Second Term'])
    insertTerm.run([sid, 'Third Term'])
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }
  return { id: sid }
})
ipcMain.handle('sessions:delete', (_, id) => {
  getDb().prepare('DELETE FROM sessions WHERE id=?').run(id)
  return { ok: true }
})
ipcMain.handle('sessions:set-current', (_, sessionId, termId) => {
  const db = getDb()
  db.exec('BEGIN')
  db.prepare('UPDATE sessions SET is_current=0').run()
  db.prepare('UPDATE sessions SET is_current=1 WHERE id=?').run(sessionId)
  db.prepare('UPDATE terms SET is_current=0').run()
  db.prepare('UPDATE terms SET is_current=1 WHERE id=?').run(termId)
  db.exec('COMMIT')

  // Auto-generate bills for every active student in the new current term.
  // Runs in background — any individual failure is non-fatal.
  const autoRecalc = getAutoRecalc()
  if (autoRecalc) {
    const students = db.prepare(
      "SELECT student_id FROM student_status WHERE term_id=? AND status='active'"
    ).all(termId)
    for (const { student_id } of students) {
      try {
        db.exec('BEGIN')
        autoRecalc(db, student_id, termId)
        db.exec('COMMIT')
      } catch(e) { try { db.exec('ROLLBACK') } catch {} }
    }
    console.log(`[auto-bill] Generated bills for ${students.length} students in term ${termId}`)
  }

  return { ok: true }
})

// Terms
ipcMain.handle('terms:list', (_, sessionId) =>
  getDb().prepare('SELECT * FROM terms WHERE session_id=? ORDER BY id').all(sessionId)
)
ipcMain.handle('terms:update', (_, { id, start_date, end_date }) => {
  getDb().prepare('UPDATE terms SET start_date=?, end_date=? WHERE id=?').run([start_date, end_date, id])
  return { ok: true }
})
ipcMain.handle('terms:current', () => {
  const db = getDb()
  const term = db.prepare(`SELECT t.*, s.name as session_name FROM terms t
    JOIN sessions s ON s.id=t.session_id WHERE t.is_current=1`).get()
  return term || null
})

// Classes
ipcMain.handle('classes:list', () =>
  getDb().prepare('SELECT * FROM classes ORDER BY level, name').all()
)
ipcMain.handle('classes:create', (_, { name, level }) => {
  const info = getDb().prepare('INSERT INTO classes (name, level) VALUES (?,?)').run([name, level ?? 0])
  return { id: info.lastInsertRowid }
})
ipcMain.handle('classes:update', (_, { id, name, level, is_active }) => {
  getDb().prepare('UPDATE classes SET name=?, level=?, is_active=? WHERE id=?').run([name, level, is_active, id])
  return { ok: true }
})
ipcMain.handle('classes:delete', (_, id) => {
  getDb().prepare('DELETE FROM classes WHERE id=?').run(id)
  return { ok: true }
})

// Students
ipcMain.handle('students:list', (_, filters = {}) => {
  const db = getDb()
  let sql = `SELECT s.*, ss.class_id, ss.status, ss.session_id, ss.term_id, ss.is_new_student,
    c.name as class_name, t.name as term_name, ses.name as session_name
    FROM students s
    LEFT JOIN student_status ss ON ss.student_id=s.id AND ss.term_id=(SELECT id FROM terms WHERE is_current=1)
    LEFT JOIN classes c ON c.id=ss.class_id
    LEFT JOIN terms t ON t.id=ss.term_id
    LEFT JOIN sessions ses ON ses.id=ss.session_id
    WHERE 1=1`
  const params = []
  if (filters.class_id) { sql += ' AND ss.class_id=?'; params.push(filters.class_id) }
  if (filters.status) { sql += ' AND ss.status=?'; params.push(filters.status) }
  if (filters.search) {
    sql += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.reg_number LIKE ?)'
    const q = `%${filters.search}%`
    params.push(q, q, q)
  }
  sql += ' ORDER BY s.last_name, s.first_name'
  return db.prepare(sql).all(params)
})
ipcMain.handle('students:get', (_, id) => {
  return getDb().prepare('SELECT * FROM students WHERE id=?').get(id)
})
safeHandle('students:create', (_, data) => {
  const db = getDb()
  const {
    first_name, last_name, other_names='', gender='M', date_of_birth='', phone='',
    parent_name='', parent_phone='', parent_email='', address='', photo_path='',
    entry_type='new', boarding_type='day', reg_number, class_id, session_id, term_id
  } = data
  const info = db.prepare(`INSERT INTO students
    (reg_number,first_name,last_name,other_names,gender,date_of_birth,phone,
    parent_name,parent_phone,parent_email,address,photo_path,entry_type,boarding_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run([reg_number, first_name, last_name, other_names,
          gender, date_of_birth, phone,
          parent_name, parent_phone, parent_email,
          address, photo_path,
          entry_type || 'new', boarding_type || 'day'])
  const sid = info.lastInsertRowid
  // Create initial student_status if term provided
  if (class_id && term_id && session_id) {
    db.prepare(`INSERT INTO student_status (student_id,session_id,term_id,class_id,status,is_new_student)
      VALUES (?,?,?,?,?,?)`)
      .run([sid, session_id, term_id, class_id, 'active', entry_type === 'new' ? 1 : 0])
    // Auto-generate bills immediately so bursar never has to remember
    try {
      const autoRecalc = getAutoRecalc()
      if (autoRecalc) {
        db.exec('BEGIN')
        autoRecalc(db, sid, term_id)
        db.exec('COMMIT')
      }
    } catch(e) {
      try { db.exec('ROLLBACK') } catch {}
      console.warn('[auto-bill] Could not generate bills for new student', sid, e.message)
    }
  }
  return { id: sid }
})
safeHandle('students:update', (_, { id, class_id, parent_email='', ...data }) => {
  const db = getDb()
  const {
    first_name, last_name, other_names='', gender='M', date_of_birth='', phone='',
    parent_name='', parent_phone='', address='', photo_path='',
    entry_type='new', boarding_type='day'
  } = data
  db.prepare(`UPDATE students SET first_name=?,last_name=?,other_names=?,gender=?,
    date_of_birth=?,phone=?,parent_name=?,parent_phone=?,parent_email=?,address=?,photo_path=?,entry_type=?,boarding_type=?
    WHERE id=?`)
    .run([first_name, last_name, other_names,
          gender || 'M', date_of_birth, phone,
          parent_name, parent_phone, parent_email,
          address, photo_path,
          entry_type || 'new', boarding_type || 'day',
          id])
  // Update class assignment for current term if class_id provided
  if (class_id) {
    const currentTerm = db.prepare('SELECT * FROM terms WHERE is_current=1').get()
    if (currentTerm) {
      db.prepare(`INSERT INTO student_status (student_id,session_id,term_id,class_id,status,is_new_student)
        VALUES (?,?,?,?,'active',0)
        ON CONFLICT(student_id,term_id) DO UPDATE SET class_id=excluded.class_id`)
        .run([id, currentTerm.session_id, currentTerm.id, class_id])

      // Auto-recalculate bills for the student whenever profile (gender/boarding/entry/class) changes
      try {
        const autoRecalc = getAutoRecalc()
        if (autoRecalc) {
          db.exec('BEGIN')
          autoRecalc(db, id, currentTerm.id)
          db.exec('COMMIT')
        }
      } catch (e) {
        try { db.exec('ROLLBACK') } catch {}
        // Non-fatal: bill recalc failure should not block profile save
        console.warn('[auto-regen] Bill recalculation failed silently:', e.message)
      }
    }
  }
  return { ok: true }
})
safeHandle('students:delete', (_, id) => {
  const db = getDb()
  // Block delete only if the student has REAL financial history (any payment).
  // Auto-generated unpaid bills don't count — a freshly added student (e.g. a
  // test record) can still be removed; their bills/adjustments are cleaned up.
  const hasPayments = db.prepare(
    'SELECT id FROM payments WHERE student_id=? LIMIT 1'
  ).get(id)
  if (hasPayments) {
    throw new Error('This student has payment records and cannot be deleted. Mark them as inactive instead.')
  }

  db.exec('BEGIN')
  try {
    // Clean up dependent records that carry no financial value
    db.prepare('DELETE FROM student_bills WHERE student_id=?').run(id)
    db.prepare('DELETE FROM bill_adjustments WHERE student_id=?').run(id)
    db.prepare('DELETE FROM previous_term_balance WHERE student_id=?').run(id)
    db.prepare('DELETE FROM student_status WHERE student_id=?').run(id)
    db.prepare('DELETE FROM students WHERE id=?').run(id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return { ok: true }
})
ipcMain.handle('students:next-reg', () => {
  const db = getDb()

  const settings = db.prepare(
    'SELECT reg_number_format, reg_number_prefix, reg_seq_reset FROM school_settings WHERE id=1'
  ).get()

  const format   = settings?.reg_number_format || '{PREFIX}/{YEAR}/{SEQ3}'
  const prefix   = settings?.reg_number_prefix || 'STU'
  const seqReset = settings?.reg_seq_reset     || 'year'

  const now  = new Date()
  const year4 = String(now.getFullYear())
  const year2 = year4.slice(2)

  // SESSION token: current academic session compact code
  const currentTerm = db.prepare(
    'SELECT s.name as session_name FROM terms t JOIN sessions s ON s.id=t.session_id WHERE t.is_current=1'
  ).get()
  const sessionName    = currentTerm?.session_name || `${year4}/${String(Number(year4)+1)}`
  const sessionCompact = (() => {
    const m = sessionName.match(/(\d{2})(\d{2})\/(\d{2})(\d{2})/)
    return m ? m[1] + m[2] + m[3] + m[4] : year4.slice(2) + String(Number(year4)+1).slice(2)
  })()

  // Sequence digit length from token
  const seqMatch = format.match(/\{SEQ(\d)\}/)
  const seqLen   = seqMatch ? parseInt(seqMatch[1]) : 3

  // Build LIKE search pattern — for 'never' reset, use wildcard for year/session
  // so we find the global max sequence across all time
  const likePattern = format
    .replace(/{PREFIX}/g,   prefix)
    .replace(/{YEAR}/g,     seqReset === 'never' ? '____' : year4)
    .replace(/{YY}/g,       seqReset === 'never' ? '__'   : year2)
    .replace(/{SESSION}/g,  seqReset === 'never' ? '____' : sessionCompact)
    .replace(/\{SEQ\d\}/g,  '%')

  const rows = db.prepare(
    'SELECT reg_number FROM students WHERE reg_number LIKE ? ORDER BY id DESC LIMIT 200'
  ).all([likePattern])

  // Extract the numeric sequence portion and find max
  let maxSeq = 0
  // Match seqLen digits that appear at the position where SEQ token was
  // Build a regex from the format to extract sequence position
  const regexStr = '^' + format
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars (except our tokens)
    .replace(/\\\{PREFIX\\\}/g,   '.+')
    .replace(/\\\{YEAR\\\}/g,     '\\d{4}')
    .replace(/\\\{YY\\\}/g,       '\\d{2}')
    .replace(/\\\{SESSION\\\}/g,  '\\d{4}')
    .replace(/\\\{SEQ\d\\\}/g,    `(\\d{${seqLen}})`) + '$'

  const seqRegex = new RegExp(regexStr)
  for (const row of rows) {
    const m = row.reg_number.match(seqRegex)
    if (m && m[1]) {
      const n = parseInt(m[1])
      if (n > maxSeq) maxSeq = n
    }
  }

  const nextSeq  = String(maxSeq + 1).padStart(seqLen, '0')
  const regNumber = format
    .replace(/{PREFIX}/g,  prefix)
    .replace(/{YEAR}/g,    year4)
    .replace(/{YY}/g,      year2)
    .replace(/{SESSION}/g, sessionCompact)
    .replace(/\{SEQ\d\}/g, nextSeq)

  return regNumber
})
ipcMain.handle('students:pick-photo', async () => {
  const result = await dialog.showOpenDialog({ filters: [{ name: 'Images', extensions: ['png','jpg','jpeg'] }], properties: ['openFile'] })
  if (result.canceled) return null
  const src = result.filePaths[0]
  const name = `photo_${Date.now()}${path.extname(src)}`
  const dest = path.join(dbDir, 'photos', name)
  if (!fs.existsSync(path.join(dbDir, 'photos'))) fs.mkdirSync(path.join(dbDir, 'photos'))
  fs.copyFileSync(src, dest)
  // Always return forward slashes — backslashes break localfile:// URLs on Windows
  return dest.replace(/\\/g, '/')
})

// Student Status
ipcMain.handle('status:for-student', (_, studentId) =>
  getDb().prepare(`SELECT ss.*, c.name as class_name, t.name as term_name, ses.name as session_name
    FROM student_status ss
    JOIN classes c ON c.id=ss.class_id
    JOIN terms t ON t.id=ss.term_id
    JOIN sessions ses ON ses.id=ss.session_id
    WHERE ss.student_id=? ORDER BY ss.id DESC`).all(studentId)
)
ipcMain.handle('status:update', (_, { student_id, status }) => {
  const db = getDb()
  const curr = db.prepare('SELECT id FROM terms WHERE is_current=1').get()
  if (!curr) throw new Error('No current term set')
  db.prepare('UPDATE student_status SET status=? WHERE student_id=? AND term_id=?')
    .run([status, student_id, curr.id])
  // Recalc bills — inactive students get their pending bills frozen
  try {
    const autoRecalc = getAutoRecalc()
    if (autoRecalc) {
      db.exec('BEGIN')
      autoRecalc(db, student_id, curr.id)
      db.exec('COMMIT')
    }
  } catch(e) { try { db.exec('ROLLBACK') } catch {} }
  return { ok: true }
})

// Promote students: insert new student_status for a new term
ipcMain.handle('students:promote', (_, { studentIds, new_term_id, new_session_id, new_class_id, from_term_id }) => {
  const db = getDb()

  // ── Guard: promote only moves students FORWARD in time ────────────────────
  // The source term is whatever the caller is promoting from (defaults to the
  // current term). Promoting into the same or an earlier term is rejected.
  const { compareTerms } = require('../lib/termOrder')
  const sourceTerm = from_term_id || db.prepare('SELECT id FROM terms WHERE is_current=1').get()?.id
  if (sourceTerm) {
    const cmp = compareTerms(db, sourceTerm, new_term_id)
    if (cmp === 0) {
      throw new Error('You cannot promote students into the same term they are already in. Choose a later term.')
    }
    if (cmp > 0) {
      throw new Error('You can only promote students forward — the destination term cannot be earlier than the current term.')
    }
  }

  const insert = db.prepare(`INSERT OR IGNORE INTO student_status
    (student_id, session_id, term_id, class_id, status, is_new_student)
    VALUES (?,?,?,?,'active',0)`)
  db.exec('BEGIN')
  try {
    for (const sid of studentIds) insert.run([sid, new_session_id, new_term_id, new_class_id])
    if (studentIds.length > 0) {
      db.prepare(`UPDATE students SET entry_type='returning' WHERE id IN (${studentIds.map(()=>'?').join(',')}) AND entry_type='new'`)
        .run(studentIds)
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }

  // Auto-generate bills for promoted students in new term
  const autoRecalc = getAutoRecalc()
  if (autoRecalc) {
    for (const sid of studentIds) {
      try {
        db.exec('BEGIN')
        autoRecalc(db, sid, new_term_id)
        db.exec('COMMIT')
      } catch(e) { try { db.exec('ROLLBACK') } catch {} }
    }
  }
  return { ok: true, count: studentIds.length }
})

// Change term (same class, active students)
ipcMain.handle('students:change-term', (_, { fromTermId, toTermId, toSessionId }) => {
  const db = getDb()

  // ── Guard: move students FORWARD only ──────────────────────────────────────
  const { compareTerms } = require('../lib/termOrder')
  const cmp = compareTerms(db, fromTermId, toTermId)
  if (cmp === 0) throw new Error('Source and destination terms are the same. Choose a later term.')
  if (cmp > 0) throw new Error('You can only move students forward — the destination term cannot be earlier than the source term.')

  const active = db.prepare('SELECT * FROM student_status WHERE term_id=? AND status=?')
    .all([fromTermId, 'active'])
  const insert = db.prepare(`INSERT OR IGNORE INTO student_status
    (student_id, session_id, term_id, class_id, status, is_new_student)
    VALUES (?,?,?,?,'active',0)`)
  db.exec('BEGIN')
  try {
    for (const s of active) insert.run([s.student_id, toSessionId, toTermId, s.class_id])
    const studentIds = active.map(s => s.student_id)
    if (studentIds.length > 0) {
      db.prepare(`UPDATE students SET entry_type='returning' WHERE id IN (${studentIds.map(()=>'?').join(',')}) AND entry_type='new'`)
        .run(studentIds)
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }

  // Auto-generate bills for all students in new term
  const autoRecalc = getAutoRecalc()
  if (autoRecalc) {
    for (const s of active) {
      try {
        db.exec('BEGIN')
        autoRecalc(db, s.student_id, toTermId)
        db.exec('COMMIT')
      } catch(e) { try { db.exec('ROLLBACK') } catch {} }
    }
  }
  return { ok: true, count: active.length }
})




}
