#!/usr/bin/env node
/**
 * SchoolFees Manager — Password Reset Code Generator (Developer Tool)
 *
 * Usage:  node scripts/gen-reset-code.js <machine-id> <username>
 *
 * When a client forgets their password and can't reach a server, they send
 * you the Machine ID and username shown on the "Forgot password" screen.
 * Run this to produce the one-time reset code, read it back to them, and they
 * set a new password. The code rotates daily (with a 1-day grace period) and
 * is never stored anywhere.
 *
 * KEEP SF_DEVMASTER_SECRET SECRET — it must match the app build.
 */
const { createHmac } = require('crypto')

const DEV_SECRET = process.env.SF_DEVMASTER_SECRET || 'SF_DEVMASTER_2025_OJUOYE_PRIVATE'

const machineId = process.argv[2]
const username  = process.argv[3]

if (!machineId || !/^[a-f0-9]{64}$/i.test(machineId) || !username) {
  console.error('Usage: node scripts/gen-reset-code.js <machine-id> <username>')
  console.error('  Machine ID : 64-char code shown on the Forgot Password screen')
  console.error('  username   : the account username to reset')
  process.exit(1)
}

const slot = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
const code = createHmac('sha256', DEV_SECRET)
  .update(`reset:${machineId.toLowerCase()}:${username.toLowerCase()}:${slot}`)
  .digest('hex').toUpperCase().slice(0, 12)

console.log('\n🔑 Password Reset Code')
console.log('   Machine ID : ' + machineId)
console.log('   Username   : ' + username)
console.log('   Reset Code : ' + code)
console.log('\nValid today only (with a 1-day grace period). Read this code to the client.')
