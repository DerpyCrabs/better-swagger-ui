import { describe, expect, it } from 'vitest'
import {
  authRefreshDelay,
  isAuthEntryValid,
  isAuthEntryRefreshable,
  purgeExpiredEntries,
  resolveRefreshTokenExpiry,
  resolveTokenExpiry,
  shouldRefreshAuthEntry,
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

describe('resolveRefreshTokenExpiry', () => {
  it('uses refresh_expires_in', () => {
    const before = Date.now()
    const expiry = resolveRefreshTokenExpiry(
      { refresh_expires_in: 1800 },
      'refresh-token',
    )
    expect(expiry).toBeDefined()
    expect(expiry!).toBeGreaterThanOrEqual(before + 1800 * 1000 - 10)
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

describe('refreshable auth entries', () => {
  const refreshable: StoredAuthEntry = {
    schemeId: 'oauth',
    type: 'bearer',
    token: 'expired-access',
    expiresAt: Date.now() - 1000,
    refreshToken: 'refresh',
    refreshExpiresAt: Date.now() + 60_000,
    oauthTokenUrl: 'https://auth.example/token',
    oauthClientId: 'client',
    oauthClientCredentialsLocation: 'header',
  }

  it('keeps expired access tokens when refresh remains valid', () => {
    expect(isAuthEntryRefreshable(refreshable)).toBe(true)
    expect(purgeExpiredEntries(new Map([['oauth', refreshable]])).has('oauth')).toBe(true)
  })

  it('refreshes access tokens inside the refresh window', () => {
    expect(shouldRefreshAuthEntry(refreshable)).toBe(true)
    expect(
      shouldRefreshAuthEntry({
        ...refreshable,
        expiresAt: Date.now() + 60_000,
      }),
    ).toBe(false)
  })

  it('calculates background refresh delay', () => {
    const now = Date.now()
    expect(
      authRefreshDelay(
        {
          ...refreshable,
          expiresAt: now + 90_000,
        },
        now,
      ),
    ).toBe(60_000)
    expect(authRefreshDelay(refreshable, now)).toBe(0)
  })

  it('rejects expired refresh tokens', () => {
    expect(
      isAuthEntryRefreshable({
        ...refreshable,
        refreshExpiresAt: Date.now() - 1000,
      }),
    ).toBe(false)
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
