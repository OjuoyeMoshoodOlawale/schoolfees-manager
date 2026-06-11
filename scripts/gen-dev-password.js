#!/usr/bin/env node
/**
 * SchoolFees Manager — Developer Password Generator
 *
 * Usage:  node scripts/gen-dev-password.js
 *
 * Computes the CURRENT rotating support password for the devmaster login.
 * The password rotates every 30 minutes (HMAC of the time slot), so nothing
 * is ever stored — you compute it fresh whenever a client needs support.
 *
 * Login on the client's machine:
 *   Username : devmaster
 *   Password : (the "Current" value below)
 *
 * The previous slot's password is also shown — it stays valid as a grace
 * period in case the slot rotates mid-session.
 *
 * KEEP SF_DEVMASTER_SECRET SECRET — it must match the app build.
 * The legacy static password also still works (computed with --legacy).
 */
const { createHmac } = require('crypto')

const DEV_SECRET = process.env.SF_DEVMASTER_SECRET || 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'

if (process.argv.includes('--legacy')) {
  const legacy = createHmac('sha256', 'SF_DEVMASTER_2025_OJUOYE_PRIVATE')
    .update('devmaster-support-access').digest('hex').slice(0, 16)
  console.log('\n🔑 Legacy static dev password')
  console.log('   Username : devmaster')
  console.log('   Password : ' + legacy + '\n')
  process.exit(0)
}

const SLOT_MS = 30 * 60 * 1000
const slot    = Math.floor(Date.now() / SLOT_MS)
const current = createHmac('sha256', DEV_SECRET).update(`dev:${slot}`).digest('hex').slice(0, 12)
const prev    = createHmac('sha256', DEV_SECRET).update(`dev:${slot - 1}`).digest('hex').slice(0, 12)

const msLeft  = (slot + 1) * SLOT_MS - Date.now()
const minLeft = Math.floor(msLeft / 60000)
const secLeft = Math.floor((msLeft % 60000) / 1000)

console.log('\n🔑 Developer Support Login (rotating)')
console.log('   Username : devmaster')
console.log('   Current  : ' + current + `   (valid for ${minLeft}m ${secLeft}s more)`)
console.log('   Previous : ' + prev + '   (grace period)')
console.log('\nRun this script again after rotation to get the new password.')
