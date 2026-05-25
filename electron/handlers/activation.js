const { ipcMain } = require('electron')
const { getDb } = require('../lib/database')

module.exports = function register_activationHandlers() {
// ─── Activation ───────────────────────────────────────────────────────────────
ipcMain.handle('activation:status', () => {
  const row = getDb().prepare('SELECT * FROM activation WHERE id=1').get()
  const setupDone = getDb().prepare("SELECT value FROM app_state WHERE key='setup_complete'").get()?.value === '1'
  const userCount = getDb().prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0
  return { activation: row || null, setup_complete: setupDone, has_users: userCount > 0 }
})

ipcMain.handle('activation:activate', async (_, { license_key, school_name }) => {
  // Call activation server
  const https = require('https')
  const os    = require('os')
  const machine_id = require('crypto').createHash('md5')
    .update(os.hostname() + os.platform() + os.arch()).digest('hex')

  return new Promise((resolve) => {
    const body = JSON.stringify({ license_key: license_key.trim().toUpperCase(), school_name, machine_id })
    const options = {
      hostname: 'api.schoolfeesmanager.com', // your activation server
      path: '/activate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.ok) {
            const db = getDb()
            const existing = db.prepare('SELECT id FROM activation WHERE id=1').get()
            if (existing) {
              db.prepare(`UPDATE activation SET license_key=?,school_name=?,activated_at=datetime('now'),
                expires_at=?,max_students=?,tier=?,machine_id=?,is_active=1 WHERE id=1`)
                .run([license_key.trim().toUpperCase(), school_name, result.expires_at || null,
                      result.max_students || 5, result.tier || 'demo', machine_id])
            } else {
              db.prepare(`INSERT INTO activation (id,license_key,school_name,activated_at,expires_at,max_students,tier,machine_id,is_active)
                VALUES (1,?,?,datetime('now'),?,?,?,?,1)`)
                .run([license_key.trim().toUpperCase(), school_name, result.expires_at || null,
                      result.max_students || 5, result.tier || 'demo', machine_id])
            }
            // Update school name in settings
            db.prepare("UPDATE school_settings SET school_name=? WHERE id=1").run([school_name])
            resolve({ ok: true, tier: result.tier, max_students: result.max_students, expires_at: result.expires_at })
          } else {
            resolve({ ok: false, error: result.error || 'Invalid or already-used activation key' })
          }
        } catch(e) { resolve({ ok: false, error: 'Server response error' }) }
      })
    })
    req.on('error', () => resolve({ ok: false, error: 'Cannot reach activation server. Check your internet connection.' }))
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }) })
    req.write(body)
    req.end()
  })
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

      // Generate reg number
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


// ─── Window ─────────────────────────────────────────────────────────────────
let win
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    show: false
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

}
