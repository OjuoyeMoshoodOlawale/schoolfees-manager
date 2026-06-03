const path = require('path')
const { setDbPath, getDb, closeDb } = require('./electron/lib/database')

const dbPath = path.join(__dirname, 'database', 'schoolfees.db')
setDbPath(dbPath)
const db = getDb()

const crypto = require('crypto')
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'schoolfees_salt_2025').digest('hex')
}

console.log('🌱 Seeding demo database...')

try {
// ── Activation (demo unlimited for dev) ──────────────────────────────────────
db.prepare(`INSERT OR REPLACE INTO activation
  (id,license_key,school_name,activated_at,max_students,tier,is_active)
  VALUES (1,'DEMO-0000-0000-0001','Bright Future Academy',datetime('now'),9999,'unlimited',1)`).run()

db.prepare("UPDATE app_state SET value='1' WHERE key='setup_complete'").run()
db.prepare("UPDATE school_settings SET school_name='Bright Future Academy', address='No. 5 Education Road, Victoria Island, Lagos', phone='08012345678', email='info@brightfuture.edu.ng', bank_name='First Bank Nigeria', account_number='3012345678', account_name='Bright Future Academy' WHERE id=1").run()

// ── Admin user ────────────────────────────────────────────────────────────────
db.prepare(`INSERT OR IGNORE INTO users (username,full_name,password_hash,role)
  VALUES ('admin','School Administrator',?,'admin')`).run([hashPassword('admin123')])
db.prepare(`INSERT OR IGNORE INTO users (username,full_name,password_hash,role)
  VALUES ('bursar','Mrs. Amaka Okafor',?,'bursar')`).run([hashPassword('bursar123')])

// ── Session & Terms ───────────────────────────────────────────────────────────
let sessId
const existSess = db.prepare("SELECT id FROM sessions WHERE name='2024/2025'").get()
if (!existSess) {
  const s = db.prepare("INSERT INTO sessions (name,is_current) VALUES ('2024/2025',1)").run()
  sessId = s.lastInsertRowid
  db.prepare("INSERT INTO terms (session_id,name,is_current) VALUES (?,?,1)").run([sessId,'First Term'])
  db.prepare("INSERT INTO terms (session_id,name) VALUES (?,?)").run([sessId,'Second Term'])
  db.prepare("INSERT INTO terms (session_id,name) VALUES (?,?)").run([sessId,'Third Term'])
} else {
  sessId = existSess.id
  db.prepare("UPDATE sessions SET is_current=1 WHERE id=?").run([sessId])
}

const currentTerm = db.prepare("SELECT * FROM terms WHERE session_id=? AND name='First Term'").get([sessId])
db.prepare("UPDATE terms SET is_current=1 WHERE id=?").run([currentTerm.id])

console.log(`✅ Session: 2024/2025 | Term ID: ${currentTerm.id}`)

// ── Classes ───────────────────────────────────────────────────────────────────
const classMap = {}
const classes = [
  {name:'JSS 1',level:1},{name:'JSS 2',level:2},{name:'JSS 3',level:3},
  {name:'SS 1',level:4},{name:'SS 2',level:5},{name:'SS 3',level:6}
]
for (const c of classes) {
  db.prepare("INSERT OR IGNORE INTO classes (name,level,is_active) VALUES (?,?,1)").run([c.name,c.level])
  classMap[c.name] = db.prepare("SELECT id FROM classes WHERE name=?").get([c.name]).id
}
console.log('✅ Classes seeded')

// ── Fee Items ─────────────────────────────────────────────────────────────────
const feeMap = {}
const fees = ['Tuition Fee','Sportswear','Medical Levy','Examination Fee','PTA Levy','ICT Fee','Development Levy']
for (const f of fees) {
  db.prepare("INSERT OR IGNORE INTO fee_items (name,is_active) VALUES (?,1)").run([f])
  feeMap[f] = db.prepare("SELECT id FROM fee_items WHERE name=?").get([f]).id
}
console.log('✅ Fee items seeded')

// ── Bill Config per class ─────────────────────────────────────────────────────
const billConfigs = [
  // JSS classes
  { classes:['JSS 1','JSS 2','JSS 3'], configs:[
    {fee:'Tuition Fee',     amount:45000, gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Examination Fee', amount:8000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'PTA Levy',        amount:5000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Medical Levy',    amount:3000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'ICT Fee',         amount:4000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Development Levy',amount:2000,  gender:'all', type:'new', boarding:'all', compulsory:1},
    {fee:'Sportswear',      amount:6500,  gender:'all', type:'new', boarding:'all', compulsory:1},
  ]},
  // SS classes
  { classes:['SS 1','SS 2','SS 3'], configs:[
    {fee:'Tuition Fee',     amount:55000, gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Examination Fee', amount:12000, gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'PTA Levy',        amount:5000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Medical Levy',    amount:3000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'ICT Fee',         amount:5000,  gender:'all', type:'all', boarding:'all', compulsory:1},
    {fee:'Development Levy',amount:3000,  gender:'all', type:'new', boarding:'all', compulsory:1},
    {fee:'Sportswear',      amount:7500,  gender:'all', type:'new', boarding:'all', compulsory:1},
  ]},
]

for (const group of billConfigs) {
  for (const cls of group.classes) {
    const cid = classMap[cls]
    for (const cfg of group.configs) {
      const fid = feeMap[cfg.fee]
      if (!fid || !cid) continue
      db.prepare(`INSERT OR IGNORE INTO bill_config
        (term_id,class_id,fee_item_id,amount,gender_rule,student_type_rule,boarding_rule,is_compulsory,is_active)
        VALUES (?,?,?,?,?,?,?,?,1)`)
        .run([currentTerm.id, cid, fid, cfg.amount, cfg.gender, cfg.type, cfg.boarding, cfg.compulsory])
    }
  }
}
console.log('✅ Bill configs seeded')

// ── Students ──────────────────────────────────────────────────────────────────
const students = [
  // JSS 1
  {reg:'STU/2024/001',last:'Adeyemi',first:'Chiamaka',gender:'F',parent:'Mr. Adeyemi Tunde',phone:'08011111111',email:'adeyemi@gmail.com',boarding:'day',entry:'new',class:'JSS 1'},
  {reg:'STU/2024/002',last:'Okonkwo',first:'Emeka',gender:'M',parent:'Mrs. Okonkwo Grace',phone:'08022222222',email:'okonkwo@yahoo.com',boarding:'day',entry:'new',class:'JSS 1'},
  {reg:'STU/2024/003',last:'Balogun',first:'Fatima',gender:'F',parent:'Alhaji Balogun',phone:'08033333333',email:'balogun@gmail.com',boarding:'boarding',entry:'new',class:'JSS 1'},
  {reg:'STU/2024/004',last:'Nwosu',first:'Kelechi',gender:'M',parent:'Dr. Nwosu Peter',phone:'08044444444',email:'nwosu@hotmail.com',boarding:'day',entry:'new',class:'JSS 1'},
  {reg:'STU/2024/005',last:'Ibrahim',first:'Zainab',gender:'F',parent:'Mallam Ibrahim',phone:'08055555555',email:'ibrahim@gmail.com',boarding:'boarding',entry:'new',class:'JSS 1'},
  // JSS 2
  {reg:'STU/2024/006',last:'Okafor',first:'Chidi',gender:'M',parent:'Chief Okafor',phone:'08066666666',email:'okafor@gmail.com',boarding:'day',entry:'returning',class:'JSS 2'},
  {reg:'STU/2024/007',last:'Adeleke',first:'Sade',gender:'F',parent:'Mrs. Adeleke',phone:'08077777777',email:'adeleke@yahoo.com',boarding:'day',entry:'returning',class:'JSS 2'},
  {reg:'STU/2024/008',last:'Musa',first:'Abdullahi',gender:'M',parent:'Alhaji Musa',phone:'08088888888',email:'musa@gmail.com',boarding:'boarding',entry:'returning',class:'JSS 2'},
  {reg:'STU/2024/009',last:'Eze',first:'Ngozi',gender:'F',parent:'Mr. Eze Chukwu',phone:'08099999999',email:'eze@gmail.com',boarding:'day',entry:'returning',class:'JSS 2'},
  {reg:'STU/2024/010',last:'Taiwo',first:'Damilola',gender:'M',parent:'Engr. Taiwo',phone:'08010101010',email:'taiwo@gmail.com',boarding:'day',entry:'returning',class:'JSS 2'},
  // JSS 3
  {reg:'STU/2024/011',last:'Afolabi',first:'Blessing',gender:'F',parent:'Pastor Afolabi',phone:'08011111112',email:'afolabi@gmail.com',boarding:'day',entry:'returning',class:'JSS 3'},
  {reg:'STU/2024/012',last:'Okeke',first:'Ifeanyi',gender:'M',parent:'Mr. Okeke',phone:'08022222223',email:'okeke@yahoo.com',boarding:'boarding',entry:'returning',class:'JSS 3'},
  {reg:'STU/2024/013',last:'Lawal',first:'Mariam',gender:'F',parent:'Alhaji Lawal',phone:'08033333334',email:'lawal@gmail.com',boarding:'boarding',entry:'returning',class:'JSS 3'},
  // SS 1
  {reg:'STU/2024/014',last:'Osei',first:'Kwame',gender:'M',parent:'Mr. Osei',phone:'08044444445',email:'osei@gmail.com',boarding:'day',entry:'returning',class:'SS 1'},
  {reg:'STU/2024/015',last:'Abubakar',first:'Aisha',gender:'F',parent:'Mallam Abubakar',phone:'08055555556',email:'abubakar@gmail.com',boarding:'boarding',entry:'returning',class:'SS 1'},
  {reg:'STU/2024/016',last:'Chukwu',first:'Obiora',gender:'M',parent:'Chief Chukwu',phone:'08066666667',email:'chukwu@gmail.com',boarding:'day',entry:'returning',class:'SS 1'},
  {reg:'STU/2024/017',last:'Suleiman',first:'Halima',gender:'F',parent:'Alhaji Suleiman',phone:'08077777778',email:'suleiman@yahoo.com',boarding:'boarding',entry:'new',class:'SS 1'},
  // SS 2
  {reg:'STU/2024/018',last:'Nwachukwu',first:'Chukwuemeka',gender:'M',parent:'Dr. Nwachukwu',phone:'08088888889',email:'nwachukwu@gmail.com',boarding:'day',entry:'returning',class:'SS 2'},
  {reg:'STU/2024/019',last:'Olawale',first:'Toyin',gender:'F',parent:'Mr. Olawale',phone:'08099999998',email:'olawale@gmail.com',boarding:'day',entry:'returning',class:'SS 2'},
  {reg:'STU/2024/020',last:'Garba',first:'Usman',gender:'M',parent:'Alhaji Garba',phone:'08010101011',email:'garba@gmail.com',boarding:'boarding',entry:'returning',class:'SS 2'},
  // SS 3
  {reg:'STU/2024/021',last:'Adebayo',first:'Funke',gender:'F',parent:'Prof. Adebayo',phone:'08011111113',email:'adebayo@gmail.com',boarding:'day',entry:'returning',class:'SS 3'},
  {reg:'STU/2024/022',last:'Onyeka',first:'Chisom',gender:'F',parent:'Mrs. Onyeka',phone:'08022222224',email:'onyeka@yahoo.com',boarding:'boarding',entry:'returning',class:'SS 3'},
  {reg:'STU/2024/023',last:'Danladi',first:'Musa',gender:'M',parent:'Mallam Danladi',phone:'08033333335',email:'danladi@gmail.com',boarding:'boarding',entry:'returning',class:'SS 3'},
  {reg:'STU/2024/024',last:'Igwe',first:'Obinna',gender:'M',parent:'Chief Igwe',phone:'08044444446',email:'igwe@gmail.com',boarding:'day',entry:'returning',class:'SS 3'},
  {reg:'STU/2024/025',last:'Yakubu',first:'Amina',gender:'F',parent:'Alhaji Yakubu',phone:'08055555557',email:'yakubu@gmail.com',boarding:'boarding',entry:'returning',class:'SS 3'},
]

for (const s of students) {
  const cid = classMap[s.class]
  db.prepare(`INSERT OR IGNORE INTO students
    (reg_number,first_name,last_name,gender,parent_name,parent_phone,parent_email,boarding_type,entry_type)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run([s.reg,s.first,s.last,s.gender,s.parent,s.phone,s.email,s.boarding,s.entry])
  const sid = db.prepare("SELECT id FROM students WHERE reg_number=?").get([s.reg]).id
  db.prepare(`INSERT OR IGNORE INTO student_status
    (student_id,session_id,term_id,class_id,status,is_new_student)
    VALUES (?,?,?,?,'active',?)`)
    .run([sid,sessId,currentTerm.id,cid,s.entry==='new'?1:0])
}
console.log(`✅ ${students.length} students seeded`)

// ── Generate Bills ────────────────────────────────────────────────────────────
const gMap = {M:'male',F:'female'}
let billsGenerated = 0

for (const s of students) {
  const student = db.prepare("SELECT * FROM students WHERE reg_number=?").get([s.reg])
  const cid = classMap[s.class]
  const configs = db.prepare("SELECT * FROM bill_config WHERE term_id=? AND class_id=? AND is_active=1").all([currentTerm.id,cid])
  
  for (const cfg of configs) {
    const gOk = cfg.gender_rule==='all' || cfg.gender_rule===gMap[student.gender]
    const tOk = cfg.student_type_rule==='all' || cfg.student_type_rule===student.entry_type
    const bOk = cfg.boarding_rule==='all' || cfg.boarding_rule===student.boarding_type
    if (!gOk||!tOk||!bOk) continue
    const r = db.prepare(`INSERT OR IGNORE INTO student_bills
      (student_id,term_id,bill_config_id,amount,is_compulsory,status)
      VALUES (?,?,?,?,?,'pending')`)
      .run([student.id,currentTerm.id,cfg.id,cfg.amount,cfg.is_compulsory])
    if (r.changes>0) billsGenerated++
  }
}
console.log(`✅ ${billsGenerated} bill lines generated`)

// ── Post Payments (partial - to simulate debtors) ─────────────────────────────
const year = new Date().getFullYear()
const payments = [
  // Fully paid
  {reg:'STU/2024/001', amount:66000, method:'transfer', ref:'TRF001', date:'2024-09-05'},
  {reg:'STU/2024/002', amount:63000, method:'cash',     ref:'',      date:'2024-09-06'},
  {reg:'STU/2024/006', amount:61000, method:'pos',      ref:'POS001', date:'2024-09-04'},
  {reg:'STU/2024/014', amount:75000, method:'transfer', ref:'TRF002', date:'2024-09-03'},
  {reg:'STU/2024/018', amount:73000, method:'transfer', ref:'TRF003', date:'2024-09-07'},
  {reg:'STU/2024/021', amount:75000, method:'transfer', ref:'TRF004', date:'2024-09-02'},
  // Partially paid
  {reg:'STU/2024/003', amount:30000, method:'cash',     ref:'',      date:'2024-09-08'},
  {reg:'STU/2024/007', amount:25000, method:'transfer', ref:'TRF005', date:'2024-09-09'},
  {reg:'STU/2024/011', amount:20000, method:'cash',     ref:'',      date:'2024-09-10'},
  {reg:'STU/2024/015', amount:40000, method:'pos',      ref:'POS002', date:'2024-09-05'},
  {reg:'STU/2024/019', amount:35000, method:'transfer', ref:'TRF006', date:'2024-09-11'},
  {reg:'STU/2024/022', amount:45000, method:'cash',     ref:'',      date:'2024-09-06'},
  // No payment yet - these are full debtors
  // STU/2024/004,005,008,009,010,012,013,016,017,020,023,024,025
]

let receiptSeq = 1
for (const p of payments) {
  const student = db.prepare("SELECT * FROM students WHERE reg_number=?").get([p.reg])
  if (!student) continue
  const rno = `RCP-${year}-${String(receiptSeq).padStart(4,'0')}`
  receiptSeq++
  db.prepare(`INSERT OR IGNORE INTO payments
    (student_id,term_id,receipt_number,amount_paid,payment_date,payment_method,reference,posted_by)
    VALUES (?,?,?,?,?,?,?,'admin')`)
    .run([student.id, currentTerm.id, rno, p.amount, p.date, p.method, p.ref])
}
console.log(`✅ ${payments.length} payments posted`)

// ── Accounting - sample journal entries ───────────────────────────────────────
// Get account IDs
const cashAcc  = db.prepare("SELECT id FROM accounts WHERE code='1001'").get()
const feesAcc  = db.prepare("SELECT id FROM accounts WHERE code='4001'").get()
const bankAcc  = db.prepare("SELECT id FROM accounts WHERE code='1002'").get()

if (cashAcc && feesAcc && bankAcc) {
  // Opening balance entry
  db.prepare(`INSERT OR IGNORE INTO journal_entries (reference,description,entry_date,entry_type,posted_by)
    VALUES ('JNL-${year}-0001','Opening balance for 2024/2025 First Term','2024-09-01','manual','admin')`).run()
  const je1 = db.prepare("SELECT id FROM journal_entries WHERE reference=?").get([`JNL-${year}-0001`])
  if (je1) {
    db.prepare("INSERT OR IGNORE INTO journal_lines (entry_id,account_id,debit,credit) VALUES (?,?,?,?)").run([je1.id,cashAcc.id,500000,0])
    db.prepare("INSERT OR IGNORE INTO journal_lines (entry_id,account_id,debit,credit) VALUES (?,?,?,?)").run([je1.id,bankAcc.id,2000000,0])
    db.prepare("INSERT OR IGNORE INTO journal_lines (entry_id,account_id,debit,credit) VALUES (?,?,?,?)").run([je1.id,db.prepare("SELECT id FROM accounts WHERE code='3001'").get()?.id,0,2500000])
    // Update balances
    db.prepare("UPDATE accounts SET balance=balance+500000 WHERE code='1001'").run()
    db.prepare("UPDATE accounts SET balance=balance+2000000 WHERE code='1002'").run()
    db.prepare("UPDATE accounts SET balance=balance+2500000 WHERE code='3001'").run()
  }

  // Fee income entry  
  db.prepare(`INSERT OR IGNORE INTO journal_entries (reference,description,entry_date,entry_type,posted_by)
    VALUES ('JNL-${year}-0002','School fees collected - September 2024','2024-09-11','payment','admin')`).run()
  const je2 = db.prepare("SELECT id FROM journal_entries WHERE reference=?").get([`JNL-${year}-0002`])
  if (je2) {
    db.prepare("INSERT OR IGNORE INTO journal_lines (entry_id,account_id,debit,credit) VALUES (?,?,?,?)").run([je2.id,cashAcc.id,343000,0])
    db.prepare("INSERT OR IGNORE INTO journal_lines (entry_id,account_id,debit,credit) VALUES (?,?,?,?)").run([je2.id,feesAcc.id,0,343000])
    db.prepare("UPDATE accounts SET balance=balance+343000 WHERE code='1001'").run()
    db.prepare("UPDATE accounts SET balance=balance+343000 WHERE code='4001'").run()
  }
  console.log('✅ Sample journal entries created')
}

// ── Summary ───────────────────────────────────────────────────────────────────
const totalStudents = db.prepare("SELECT COUNT(*) as c FROM students").get().c
const totalBills    = db.prepare("SELECT COUNT(*) as c FROM student_bills").get().c
const totalPaid     = db.prepare("SELECT COALESCE(SUM(amount_paid),0) as t FROM payments").get().t
const totalBilled   = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM student_bills").get().t
const debtors       = db.prepare("SELECT COUNT(DISTINCT student_id) as c FROM students s JOIN student_status ss ON ss.student_id=s.id WHERE ss.status='active'").get().c

console.log('\n📊 DEMO DATABASE SUMMARY:')
console.log(`   Students:      ${totalStudents} (across 6 classes)`)
console.log(`   Bill lines:    ${totalBills}`)
console.log(`   Total billed:  ₦${Number(totalBilled).toLocaleString('en-NG')}`)
console.log(`   Total paid:    ₦${Number(totalPaid).toLocaleString('en-NG')}`)
console.log(`   Outstanding:   ₦${(totalBilled-totalPaid).toLocaleString('en-NG')}`)
console.log(`   Collection:    ${Math.round((totalPaid/totalBilled)*100)}%`)
console.log('\n🔑 LOGIN CREDENTIALS:')
console.log('   Admin:  username=admin    password=admin123')
console.log('   Bursar: username=bursar   password=bursar123')
console.log('\n✅ Demo database ready!')

} finally {
  closeDb()
}
