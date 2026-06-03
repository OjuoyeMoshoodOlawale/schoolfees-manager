import { describe, it, expect } from 'vitest'
const { makeKey, validateOfflineKey } = require('../lib/activation_utils')

describe('Activation Utils', () => {
  it('should generate a key in the correct format', () => {
    const key = makeKey('TEST_SEED')
    expect(key).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it('should validate a correct offline key', () => {
    // We know 'DEMO_5STUDENTS_001' is a valid seed
    const key = makeKey('DEMO_5STUDENTS_001')
    const match = validateOfflineKey(key)
    expect(match).not.toBeNull()
    expect(match.tier).toBe('demo')
    expect(match.max_students).toBe(5)
  })

  it('should return null for an invalid key', () => {
    const match = validateOfflineKey('INVALID-KEY-1234')
    expect(match).toBeNull()
  })

  it('should handle lowercase keys and spaces', () => {
    const validKey = makeKey('DEMO_5STUDENTS_001')
    const match = validateOfflineKey('  ' + validKey.toLowerCase() + '  ')
    expect(match).not.toBeNull()
    expect(match.tier).toBe('demo')
  })
})
