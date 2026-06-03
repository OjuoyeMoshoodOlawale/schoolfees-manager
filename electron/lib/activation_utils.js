const crypto = require('crypto')

const SECRET = 'SF_MASTER_SECRET_2025_OJUOYE'

function makeKey(seed) {
  const h = crypto.createHash('sha256').update(`${SECRET}:${seed}`).digest('hex').toUpperCase()
  return `${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`
}

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

function validateOfflineKey(key) {
  return OFFLINE_KEYS[key.trim().toUpperCase()] || null
}

module.exports = {
  makeKey,
  validateOfflineKey,
  OFFLINE_KEYS
}
