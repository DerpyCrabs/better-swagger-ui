import { describe, expect, it } from 'vitest'
import {
  isAuthEntryValid,
  purgeExpiredEntries,
  resolveTokenExpiry,
  storageKey,
  type StoredAuthEntry,
} from './auth-storage'

function jwtWithExp(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ exp: expSeconds }))
  return `${header}.${payload}.sig`
}

describe('resolveTokenExpiry', () => {
  it('uses expires_in when present', () => {
    const before = Date.now()
    const expiry = resolveTokenExpiry({ expires_in: 3600 }, 'plain-token')
    expect(expiry).toBeDefined()
    expect(expiry!).toBeGreaterThanOrEqual(before + 3600 * 1000 - 10)
    expect(expiry!).toBeLessThanOrEqual(before + 3600 * 1000 + 1000)
  })

  it('uses JWT exp when expires_in missing', () => {
    const exp = Math.floor(Date.now() / 1000) + 7200
    const expiry = resolveTokenExpiry({}, jwtWithExp(exp))
    expect(expiry).toBe(exp * 1000)
  })

  it('returns minimum of expires_in and JWT exp', () => {
    const jwtExp = Math.floor(Date.now() / 1000) + 100
    const expiry = resolveTokenExpiry({ expires_in: 3600 }, jwtWithExp(jwtExp))
    expect(expiry).toBe(jwtExp * 1000)
  })

  it('returns undefined when neither source available', () => {
    expect(resolveTokenExpiry({}, 'not-a-jwt')).toBeUndefined()
  })
})

describe('isAuthEntryValid', () => {
  it('treats missing expiry as valid', () => {
    const entry: StoredAuthEntry = {
      schemeId: 'a',
      type: 'bearer',
      token: 't',
    }
    expect(isAuthEntryValid(entry)).toBe(true)
  })

  it('rejects expired entries', () => {
    const entry: StoredAuthEntry = {
      schemeId: 'a',
      type: 'bearer',
      token: 't',
      expiresAt: Date.now() - 1000,
    }
    expect(isAuthEntryValid(entry)).toBe(false)
  })
})

describe('purgeExpiredEntries', () => {
  it('removes expired entries', () => {
    const entries = new Map<string, StoredAuthEntry>([
      [
        'valid',
        { schemeId: 'valid', type: 'bearer', token: 't', expiresAt: Date.now() + 60_000 },
      ],
      [
        'expired',
        { schemeId: 'expired', type: 'bearer', token: 't', expiresAt: Date.now() - 1000 },
      ],
    ])
    const next = purgeExpiredEntries(entries)
    expect(next.has('valid')).toBe(true)
    expect(next.has('expired')).toBe(false)
  })
})

describe('storageKey', () => {
  it('includes source URL', () => {
    expect(storageKey('https://example.com/swagger-ui/')).toContain('https://example.com/swagger-ui/')
  })
})
