const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_activationHandlers() {
// ─── Activation ───────────────────────────────────────────────────────────────
ipcMain.handle('activation:status', () => {
  const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged

  // DEV MODE: auto-activate with unlimited students so you can test without a key
  if (isDev) {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM activation WHERE id=1').get()
    const schoolName = db.prepare('SELECT school_name FROM school_settings WHERE id=1').get()?.school_name || 'Development School'
    if (!existing) {
      db.prepare(`INSERT INTO activation (id,license_key,school_name,activated_at,max_students,tier,is_active)
        VALUES (1,'DEV-MODE',?,datetime('now'),9999,'unlimited',1)`).run([schoolName])
    } else {
      if (existing.school_name === 'Development School' || existing.license_key === 'DEV-MODE') {
        db.prepare('UPDATE activation SET is_active=1, max_students=9999, tier=?, school_name=? WHERE id=1').run(['unlimited', schoolName])
      } else {
        db.prepare('UPDATE activation SET is_active=1, max_students=9999, tier=? WHERE id=1').run(['unlimited'])
      }
    }
    // Always stamp setup_complete in dev — survives Ctrl+C without DB flush
    db.prepare("INSERT OR REPLACE INTO app_state (key,value) VALUES ('setup_complete','1')").run([])
  }

  const row = getDb().prepare('SELECT * FROM activation WHERE id=1').get()
  const setupDone = getDb().prepare("SELECT value FROM app_state WHERE key='setup_complete'").get()?.value === '1'
  const userCount = getDb().prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0
  return { activation: row || null, setup_complete: setupDone, has_users: userCount > 0 }
})

ipcMain.handle('activation:activate', async (_, { license_key, school_name }) => {
  try {
  const crypto = require('crypto')
  const os     = require('os')
  const db     = getDb()

  const key = license_key.trim().toUpperCase()
  const machine_id = crypto.createHash('md5')
    .update(os.hostname() + os.platform() + os.arch()).digest('hex')

  // ── Offline key validation ─────────────────────────────────────────────────
  // Keys are HMAC-SHA256 derived — validated without a server connection.
  // When your activation server is ready, online validation takes priority.
  const SECRET = 'SF_MASTER_SECRET_2025_OJUOYE'

  function makeKey(seed) {
    const h = crypto.createHash('sha256').update(`${SECRET}:${seed}`).digest('hex').toUpperCase()
    return `${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`
  }

  // Define all valid offline keys and their tiers
  const OFFLINE_KEYS = {
    // Master keys — for you (developer)
    [makeKey('MASTER_UNLIMITED_DEVELOPER')]: { tier: 'master',    max_students: 99999, label: 'Master' },
    [makeKey('MASTER_UNLIMITED_DEV2')]:      { tier: 'master',    max_students: 99999, label: 'Master Backup' },

    // Demo keys — for agents doing demos (5 students, reusable)
    [makeKey('DEMO_5STUDENTS_001')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_002')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_003')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_004')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_005')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_006')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_007')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_008')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_009')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_010')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_011')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_012')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_013')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_014')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },
    [makeKey('DEMO_5STUDENTS_015')]:  { tier: 'demo', max_students: 5,   label: 'Demo' },

    // Standard keys — 500 students
    [makeKey('STD_500STUDENTS_001')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_002')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_003')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_004')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_005')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_006')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_007')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_008')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_009')]: { tier: 'standard', max_students: 500,  label: 'Standard' },
    [makeKey('STD_500STUDENTS_010')]: { tier: 'standard', max_students: 500,  label: 'Standard' },

    // Unlimited keys — full license
    [makeKey('FULL_UNLIMITED_001')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_002')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_003')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_004')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_005')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_006')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_007')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_008')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_009')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
    [makeKey('FULL_UNLIMITED_010')]:  { tier: 'unlimited', max_students: 99999, label: 'Unlimited' },
  }

  // Check offline key first
  const offlineMatch = OFFLINE_KEYS[key]

  if (offlineMatch) {
    // Valid offline key - activate immediately, no internet needed
    const existing = db.prepare('SELECT id FROM activation WHERE id=1').get()
    const payload = [key, school_name, null, offlineMatch.max_students, offlineMatch.tier, machine_id]
    if (existing) {
      db.prepare(`UPDATE activation SET license_key=?,school_name=?,activated_at=datetime('now'),
        expires_at=?,max_students=?,tier=?,machine_id=?,is_active=1 WHERE id=1`)
        .run(payload)
    } else {
      db.prepare(`INSERT INTO activation (id,license_key,school_name,activated_at,expires_at,max_students,tier,machine_id,is_active)
        VALUES (1,?,?,datetime('now'),?,?,?,?,1)`)
        .run(payload)
    }
    db.prepare('UPDATE school_settings SET school_name=? WHERE id=1').run([school_name])
    db.prepare("UPDATE app_state SET value='1' WHERE key='setup_complete'").run()

    return {
      ok: true,
      tier: offlineMatch.tier,
      max_students: offlineMatch.max_students,
      offline: true,
      message: `${offlineMatch.label} license activated successfully`
    }
  }

  // ── Online validation (when server is ready) ───────────────────────────────
  // Try activation server - if unreachable, return helpful message
  const https = require('https')
  return new Promise((resolve) => {
    const body = JSON.stringify({ license_key: key, school_name, machine_id })
    const req = https.request({
      hostname: 'api.schoolfeesmanager.com',
      path: '/activate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.ok) {
            const existing = db.prepare('SELECT id FROM activation WHERE id=1').get()
            const p = [key, school_name, result.expires_at||null, result.max_students||5, result.tier||'standard', machine_id]
            if (existing) {
              db.prepare(`UPDATE activation SET license_key=?,school_name=?,activated_at=datetime('now'),
                expires_at=?,max_students=?,tier=?,machine_id=?,is_active=1 WHERE id=1`).run(p)
            } else {
              db.prepare(`INSERT INTO activation (id,license_key,school_name,activated_at,expires_at,max_students,tier,machine_id,is_active)
                VALUES (1,?,?,datetime('now'),?,?,?,?,1)`).run(p)
            }
            db.prepare('UPDATE school_settings SET school_name=? WHERE id=1').run([school_name])
            db.prepare("UPDATE app_state SET value='1' WHERE key='setup_complete'").run()
            resolve({ ok: true, tier: result.tier, max_students: result.max_students })
          } else {
            resolve({ ok: false, error: result.error || 'Invalid license key' })
          }
        } catch { resolve({ ok: false, error: 'Server error. Try again.' }) }
      })
    })
    req.on('error', () => resolve({ ok: false, error: 'Invalid license key. If you have an internet-based key, check your connection.' }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Invalid license key. If you have an internet-based key, connection timed out.' }) })
    req.write(body)
    req.end()
  })
  } catch(e) {
    console.error('Activation handler error:', e)
    return { ok: false, error: e.message || 'Activation failed internally' }
  }
})

ipcMain.handle('activation:get-machine-id', () => {
  const os = require('os')
  return require('crypto').createHash('md5')
    .update(os.hostname() + os.platform() + os.arch()).digest('hex')
})

// ─── App State ───────────────────────────────────────────────────────────────
ipcMain.handle('app-state:get', (_, key) => {
  return getDb().prepare('SELECT value FROM app_state WHERE key=?').get([key])?.value
})

ipcMain.handle('app-state:set', (_, key, value) => {
  const db = getDb()
  const exists = db.prepare('SELECT key FROM app_state WHERE key=?').get([key])
  if (exists) db.prepare('UPDATE app_state SET value=? WHERE key=?').run([value, key])
  else db.prepare('INSERT INTO app_state (key,value) VALUES (?,?)').run([key, value])
  return { ok: true }
})

// ─── Student count check (for demo tier limit) ────────────────────────────────
ipcMain.handle('students:count', () => {
  return getDb().prepare('SELECT COUNT(*) as c FROM students').get()?.c || 0
})

// ─── Excel Import ─────────────────────────────────────────────────────────────
ipcMain.handle('import:students', (_, { rows, class_id, session_id, term_id, entry_type_override }) => {
  const db = getDb()

  // Check tier limit
  const activation = db.prepare('SELECT * FROM activation WHERE id=1').get()
  const maxStudents = activation?.max_students || 5
  const currentCount = db.prepare('SELECT COUNT(*) as c FROM students').get()?.c || 0
  const available = maxStudents - currentCount

  if (available <= 0) {
    throw new Error(`Student limit reached (${maxStudents}). Please upgrade your license to add more students.`)
  }

  const toInsert = rows.slice(0, available) // respect limit
  const skippedDueToLimit = rows.length - toInsert.length

  let inserted = 0, skipped = 0, errors = []

  const insertStudent = db.prepare(`
    INSERT OR IGNORE INTO students
    (reg_number,first_name,last_name,other_names,gender,date_of_birth,
     phone,parent_name,parent_phone,address,boarding_type,entry_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  const insertStatus = db.prepare(`
    INSERT OR IGNORE INTO student_status
    (student_id,session_id,term_id,class_id,status,is_new_student)
    VALUES (?,?,?,?,'active',?)
  `)
  const getLastReg = db.prepare(
    "SELECT reg_number FROM students WHERE reg_number LIKE ? ORDER BY id DESC LIMIT 1"
  )

  const year = new Date().getFullYear()

  db.exec('BEGIN')
  try {
    for (let i = 0; i < toInsert.length; i++) {
      const row = toInsert[i]
      if (!row._valid) { errors.push(`Row ${row._row}: ${row._errors.join(', ')}`); skipped++; continue }

      // Check for duplicate reg_number or duplicate name in same class
      if (row.reg_number) {
        const existingReg = db.prepare('SELECT id FROM students WHERE reg_number=?').get([row.reg_number])
        if (existingReg) {
          errors.push(`Row ${row._row}: Reg number "${row.reg_number}" already exists — skipped`)
          skipped++
          continue
        }
      }
      // Check duplicate name in same term/class
      if (class_id && term_id) {
        const existingName = db.prepare(`
          SELECT s.id FROM students s
          JOIN student_status ss ON ss.student_id=s.id
          WHERE LOWER(s.first_name)=LOWER(?) AND LOWER(s.last_name)=LOWER(?)
            AND ss.class_id=? AND ss.term_id=?`
        ).get([row.first_name, row.last_name, class_id, term_id])
        if (existingName) {
          errors.push(`Row ${row._row}: "${row.first_name} ${row.last_name}" already exists in this class — skipped`)
          skipped++
          continue
        }
      }

      // Generate reg number if not provided
      const last = getLastReg.get([`STU/${year}/%`])
      const seq  = last ? String(parseInt(last.reg_number.split('/')[2] || '0') + 1).padStart(3, '0') : String(i + currentCount + 1).padStart(3, '0')
      const reg_number = `STU/${year}/${seq}`

      const entry_type = entry_type_override || row.entry_type || 'new'

      try {
        const info = insertStudent.run([
          reg_number, row.first_name, row.last_name, row.other_names || '',
          row.gender, row.date_of_birth || '', row.phone || '',
          row.parent_name || '', row.parent_phone || '',
          row.address || '', row.boarding_type || 'day', entry_type
        ])
        if (info.changes > 0) {
          const studentId = info.lastInsertRowid
          if (class_id && term_id && session_id) {
            insertStatus.run([studentId, session_id, term_id, class_id, entry_type === 'new' ? 1 : 0])
          }
          inserted++
        } else { skipped++ }
      } catch(e) { errors.push(`Row ${row._row}: ${e.message}`); skipped++ }
    }
    db.exec('COMMIT')
  } catch(e) { db.exec('ROLLBACK'); throw e }

  return { ok: true, inserted, skipped, skippedDueToLimit, errors: errors.slice(0, 20) }
})


}

// ── Accounting unlock key ─────────────────────────────────────────────────────
ipcMain.handle('activation:unlock-accounting', (_, { key }) => {
  const crypto = require('crypto')
  const db     = getDb()

  if (!key || typeof key !== 'string') return { ok: false, error: 'Invalid key' }

  const normalized = key.trim().toUpperCase()

  // Validate format: ACCT-XXXX-XXXX
  if (!/^ACCT-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalized)) {
    return { ok: false, error: 'Invalid key format. Expected: ACCT-XXXX-XXXX' }
  }

  // Re-derive from school name and compare
  const school = db.prepare('SELECT school_name FROM school_settings WHERE id=1').get()
  const schoolName = (school?.school_name || '').toLowerCase().trim()

  // Generate the expected key for this school
  const SECRET = 'SF_ACCT_SECRET_2025_OJUOYE'
  const hash = crypto.createHmac('sha256', SECRET)
    .update(schoolName)
    .digest('hex')
  const expected = `ACCT-${hash.slice(0,4).toUpperCase()}-${hash.slice(4,8).toUpperCase()}`

  // Also accept the master accounting key (works for any school)
  const masterHash = crypto.createHmac('sha256', SECRET)
    .update('master_accounting_unlock')
    .digest('hex')
  const masterKey = `ACCT-${masterHash.slice(0,4).toUpperCase()}-${masterHash.slice(4,8).toUpperCase()}`

  if (normalized !== expected && normalized !== masterKey) {
    return { ok: false, error: 'Incorrect key. Contact your SchoolFees Manager agent to obtain an accounting unlock key.' }
  }

  // Activate accounting
  db.prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES ('accounting_enabled', '1')").run([])
  db.prepare("UPDATE school_settings SET accounting_enabled=1 WHERE id=1").run([])

  return { ok: true }
})

// Helper — generate accounting key for a school name (devmaster use only)
ipcMain.handle('activation:generate-accounting-key', (_, { school_name }) => {
  const crypto = require('crypto')
  const isDev  = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged
  if (!isDev) return { ok: false, error: 'Dev mode only' }

  const SECRET = 'SF_ACCT_SECRET_2025_OJUOYE'
  const name   = (school_name || '').toLowerCase().trim()
  const hash   = crypto.createHmac('sha256', SECRET).update(name).digest('hex')
  const key    = `ACCT-${hash.slice(0,4).toUpperCase()}-${hash.slice(4,8).toUpperCase()}`
  return { ok: true, key, school_name }
})
