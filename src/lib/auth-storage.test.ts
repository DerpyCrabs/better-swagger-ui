import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_OAUTH_SHARED_PREFIX,
  AUTH_STORAGE_PREFIX,
  authRefreshDelay,
  clearOAuthAcrossSources,
  entryMatchesOAuthReuse,
  entryOAuthFingerprint,
  findReusableOAuthEntry,
  isAuthEntryValid,
  isAuthEntryRefreshable,
  loadSharedOAuthEntry,
  loadStoredEntriesForSchemes,
  normalizeTokenUrl,
  persistEntries,
  persistSharedOAuthEntry,
  publishOAuthEntry,
  purgeExpiredEntries,
  resolveRefreshTokenExpiry,
  resolveTokenExpiry,
  shouldRefreshAuthEntry,
  sharedOAuthStorageKey,
  storageKey,
  syncOAuthEntryAcrossSources,
  type StoredAuthEntry,
} from './auth-storage'

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

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

describe('normalizeTokenUrl', () => {
  it('lowercases host and strips trailing slash', () => {
    expect(normalizeTokenUrl('https://Auth.Example/realms/x/token/')).toBe(
      'https://auth.example/realms/x/token',
    )
  })
})

describe('OAuth auth reuse across sources', () => {
  const sourceA = 'https://svc-a.example/swagger-ui/'
  const sourceB = 'https://svc-b.example/swagger-ui/'
  const tokenUrl = 'https://keycloak.example/realms/dev/protocol/openid-connect/token'

  const oauthEntry = (overrides: Partial<StoredAuthEntry> = {}): StoredAuthEntry => ({
    schemeId: 'oauth',
    type: 'bearer',
    token: 'access-a',
    expiresAt: Date.now() + 60_000,
    oauthTokenUrl: tokenUrl,
    oauthClientId: 'sp-client',
    oauthClientSecret: 'secret',
    oauthClientCredentialsLocation: 'body',
    oauthFlowKind: 'oauth2-password',
    refreshToken: 'refresh-a',
    refreshExpiresAt: Date.now() + 120_000,
    ...overrides,
  })

  beforeEach(() => {
    const memory = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memory,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createMemoryStorage(),
    })
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('matches reusable OAuth entries by flow, token URL, and client id', () => {
    const entry = oauthEntry()
    expect(entryMatchesOAuthReuse(entry, 'oauth2-password', tokenUrl, 'sp-client')).toBe(true)
    expect(
      entryMatchesOAuthReuse(entry, 'oauth2-client-credentials', tokenUrl, 'sp-client'),
    ).toBe(false)
    expect(entryMatchesOAuthReuse(entry, 'oauth2-password', tokenUrl, 'other-client')).toBe(false)
  })

  it('allows empty client id to match any client on the same token URL', () => {
    expect(
      entryMatchesOAuthReuse(oauthEntry(), 'oauth2-password', `${tokenUrl}/`, ''),
    ).toBe(true)
  })

  it('reuses OAuth auth from another source when schemes match', () => {
    persistEntries(sourceA, new Map([['oauth', oauthEntry()]]))

    const loaded = loadStoredEntriesForSchemes(sourceB, [
      {
        id: 'Keycloak',
        kind: 'oauth2-password',
        tokenUrl,
        clientId: 'sp-client',
      },
    ])

    expect(loaded.get('Keycloak')?.token).toBe('access-a')
    expect(loaded.get('Keycloak')?.schemeId).toBe('Keycloak')
    expect(localStorage.getItem(storageKey(sourceB))).toContain('access-a')
  })

  it('keeps the freshest local token when peers are older', () => {
    const older = Date.now() + 30_000
    const newer = Date.now() + 90_000
    persistEntries(
      sourceA,
      new Map([['oauth', oauthEntry({ token: 'from-a', expiresAt: older })]]),
    )
    persistEntries(
      sourceB,
      new Map([
        [
          'Keycloak',
          oauthEntry({ schemeId: 'Keycloak', token: 'local-b', expiresAt: newer }),
        ],
      ]),
    )

    const loaded = loadStoredEntriesForSchemes(sourceB, [
      {
        id: 'Keycloak',
        kind: 'oauth2-password',
        tokenUrl,
        clientId: 'sp-client',
      },
    ])

    expect(loaded.get('Keycloak')?.token).toBe('local-b')
  })

  it('prefers a newer shared fingerprint token over a stale local one', () => {
    const older = Date.now() + 30_000
    const newer = Date.now() + 120_000
    persistEntries(
      sourceB,
      new Map([
        [
          'Keycloak',
          oauthEntry({ schemeId: 'Keycloak', token: 'stale-local', expiresAt: older }),
        ],
      ]),
    )
    persistSharedOAuthEntry(
      oauthEntry({ token: 'from-shared', refreshToken: 'refresh-shared', expiresAt: newer }),
    )

    const loaded = loadStoredEntriesForSchemes(sourceB, [
      {
        id: 'Keycloak',
        kind: 'oauth2-password',
        tokenUrl,
        clientId: 'sp-client',
      },
    ])

    expect(loaded.get('Keycloak')?.token).toBe('from-shared')
    expect(loaded.get('Keycloak')?.refreshToken).toBe('refresh-shared')
  })

  it('does not reuse apiKey or mismatched token URLs', () => {
    persistEntries(
      sourceA,
      new Map([
        [
          'api',
          {
            schemeId: 'api',
            type: 'apiKey',
            token: 'key',
            apiKeyName: 'X-API-Key',
            apiKeyIn: 'header',
          },
        ],
      ]),
    )

    expect(
      findReusableOAuthEntry({
        flowKind: 'oauth2-password',
        tokenUrl,
        clientId: 'sp-client',
        excludeSourceUrl: sourceB,
      }),
    ).toBeNull()

    persistEntries(sourceA, new Map([['oauth', oauthEntry()]]))
    expect(
      findReusableOAuthEntry({
        flowKind: 'oauth2-password',
        tokenUrl: 'https://other-keycloak.example/token',
        clientId: 'sp-client',
        excludeSourceUrl: sourceB,
      }),
    ).toBeNull()
  })

  it('syncs refreshed tokens across sources with the same fingerprint', () => {
    persistEntries(sourceA, new Map([['oauth', oauthEntry()]]))
    persistEntries(
      sourceB,
      new Map([['Keycloak', oauthEntry({ schemeId: 'Keycloak', token: 'old-b' })]]),
    )

    syncOAuthEntryAcrossSources(
      oauthEntry({ token: 'refreshed', refreshToken: 'refresh-new' }),
      { excludeSourceUrl: sourceA },
    )

    const rawB = localStorage.getItem(storageKey(sourceB))
    expect(rawB).toContain('refreshed')
    expect(rawB).toContain('refresh-new')
    expect(localStorage.getItem(storageKey(sourceA))).toContain('access-a')
  })

  it('publishes refreshed tokens to shared store so switches keep refreshability', () => {
    persistEntries(sourceA, new Map([['oauth', oauthEntry()]]))

    publishOAuthEntry(
      oauthEntry({ token: 'refreshed', refreshToken: 'refresh-new', expiresAt: Date.now() + 60_000 }),
    )

    const fingerprint = entryOAuthFingerprint(oauthEntry())
    expect(fingerprint).toBeTruthy()
    expect(
      localStorage.getItem(sharedOAuthStorageKey(fingerprint!)),
    ).toContain('refreshed')

    // Simulate switching to a service that never had its own auth bag.
    localStorage.removeItem(storageKey(sourceB))
    const loaded = loadStoredEntriesForSchemes(sourceB, [
      {
        id: 'Keycloak',
        kind: 'oauth2-password',
        tokenUrl,
        clientId: 'sp-client',
      },
    ])

    expect(loaded.get('Keycloak')?.token).toBe('refreshed')
    expect(loaded.get('Keycloak')?.refreshToken).toBe('refresh-new')
    expect(
      loadSharedOAuthEntry('oauth2-password', tokenUrl, 'sp-client')?.token,
    ).toBe('refreshed')
  })

  it('clears matching OAuth entries from every source on logout', () => {
    persistEntries(sourceA, new Map([['oauth', oauthEntry()]]))
    persistSharedOAuthEntry(oauthEntry())
    persistEntries(
      sourceB,
      new Map([
        ['Keycloak', oauthEntry({ schemeId: 'Keycloak' })],
        [
          'api',
          {
            schemeId: 'api',
            type: 'apiKey',
            token: 'keep-me',
            apiKeyName: 'X-API-Key',
            apiKeyIn: 'header',
          },
        ],
      ]),
    )

    clearOAuthAcrossSources('oauth2-password', tokenUrl, 'sp-client')

    expect(localStorage.getItem(storageKey(sourceA))).toBe('[]')
    const rawB = localStorage.getItem(storageKey(sourceB))
    expect(rawB).not.toContain('access-a')
    expect(rawB).toContain('keep-me')
    expect(
      loadSharedOAuthEntry('oauth2-password', tokenUrl, 'sp-client'),
    ).toBeNull()
  })

  it('uses AUTH_STORAGE_PREFIX for storage keys', () => {
    expect(storageKey(sourceA).startsWith(AUTH_STORAGE_PREFIX)).toBe(true)
    expect(AUTH_OAUTH_SHARED_PREFIX.startsWith('better-swagger-oauth:')).toBe(true)
  })
})
