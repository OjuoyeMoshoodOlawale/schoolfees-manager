import { describe, it, expect } from 'vitest'
const { hashPassword, verifyPassword, legacyHash, computeDevPassword } = require('../lib/auth_utils')

describe('Auth Utils', () => {
  it('should hash and verify password with scrypt', () => {
    const password = 'mySecretPassword'
    const hashed = hashPassword(password)
    expect(hashed).toMatch(/^scrypt\$/)
    expect(verifyPassword(password, hashed)).toBe(true)
    expect(verifyPassword('wrongPassword', hashed)).toBe(false)
  })

  it('should verify legacy sha256 hashes', () => {
    const password = 'legacyPassword'
    const hashed = legacyHash(password)
    expect(verifyPassword(password, hashed)).toBe(true)
  })

  it('should compute dev password correctly', () => {
    const devPw = computeDevPassword()
    expect(devPw).toHaveLength(16)
  })
})
