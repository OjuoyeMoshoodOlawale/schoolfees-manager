#!/usr/bin/env node
/**
 * SchoolFees Manager — Activation Key Generator (Developer Tool)
 *
 * Usage:
 *   node scripts/gen-activation-key.js <machine-id> [tier]
 *
 *   <machine-id>  64-char ID shown on the app's activation screen (Copy button)
 *   [tier]        demo | standard | unlimited   (default: unlimited)
 *
 * The client sends you their Machine ID → you run this → send back the key.
 * KEEP SF_DEV_SECRET SECRET — it must match the one baked into the app build.
 */
const { createHmac } = require('crypto')

const DEV_SECRET = process.env.SF_DEV_SECRET || 'SF_MASTER_SECRET_2025_OJUOYE'

const TIER_LETTER = { demo: 'D', standard: 'S', unlimited: 'U' }
const TIER_INFO   = { D: 'Demo — 5 students', S: 'Standard — 500 students', U: 'Unlimited' }

const machineId = process.argv[2]
const tierArg   = (process.argv[3] || 'unlimited').toLowerCase()

if (!machineId || !/^[a-f0-9]{64}$/i.test(machineId)) {
  console.error('Usage: node scripts/gen-activation-key.js <machine-id> [demo|standard|unlimited]')
  console.error('  The Machine ID is the 64-character code shown on the activation screen.')
  process.exit(1)
}
const tierLetter = TIER_LETTER[tierArg]
if (!tierLetter) {
  console.error(`Unknown tier "${tierArg}". Use: demo | standard | unlimited`)
  process.exit(1)
}

const h = createHmac('sha256', DEV_SECRET)
  .update(`${machineId.toLowerCase()}:${tierLetter}`)
  .digest('hex').toUpperCase().slice(0, 16)

const key = `SFM${tierLetter}-${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`

console.log('\n✅ Activation Key Generated')
console.log('   Machine ID : ' + machineId)
console.log('   Tier       : ' + TIER_INFO[tierLetter])
console.log('   Key        : ' + key)
console.log('\nSend this key to the client. It only works on that machine.')
