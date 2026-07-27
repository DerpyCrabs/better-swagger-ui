import type { TokenResponse } from './oauth-token'

export interface StoredAuthEntry {
  schemeId: string
  type: 'bearer' | 'apiKey' | 'basic'
  token: string
  expiresAt?: number
  apiKeyName?: string
  apiKeyIn?: 'header' | 'query' | 'cookie'
  username?: string
  password?: string
  refreshToken?: string
  refreshExpiresAt?: number
  oauthTokenUrl?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthClientCredentialsLocation?: 'body' | 'header'
}

function decodeJwtExpiry(accessToken: string): number | undefined {
  try {
    const payloadPart = accessToken.split('.')[1]
    if (!payloadPart) return undefined

    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }

    if (typeof payload.exp === 'number') {
      return payload.exp * 1000
    }
  } catch {
    // ignore malformed tokens
  }

  return undefined
}

export function resolveTokenExpiry(
  response: Pick<TokenResponse, 'expires_in'>,
  accessToken: string,
): number | undefined {
  const fromResponse = response.expires_in !== undefined
    ? Date.now() + response.expires_in * 1000
    : undefined
  const fromJwt = decodeJwtExpiry(accessToken)

  if (fromResponse && fromJwt) return Math.min(fromResponse, fromJwt)
  return fromResponse ?? fromJwt
}

export function resolveRefreshTokenExpiry(
  response: Pick<TokenResponse, 'refresh_expires_in'>,
  refreshToken: string | undefined,
): number | undefined {
  if (!refreshToken) return undefined
  return resolveTokenExpiry(
    { expires_in: response.refresh_expires_in },
    refreshToken,
  )
}

export function isAuthEntryValid(entry: StoredAuthEntry, now = Date.now()): boolean {
  if (!entry.expiresAt) return true
  return entry.expiresAt > now
}

export function isAuthEntryRefreshable(entry: StoredAuthEntry, now = Date.now()): boolean {
  if (
    entry.type !== 'bearer' ||
    !entry.refreshToken ||
    !entry.oauthTokenUrl ||
    !entry.oauthClientId ||
    !entry.oauthClientCredentialsLocation
  ) {
    return false
  }
  return !entry.refreshExpiresAt || entry.refreshExpiresAt > now
}

export function shouldRefreshAuthEntry(
  entry: StoredAuthEntry,
  now = Date.now(),
  refreshWindowMs = 30_000,
): boolean {
  return authRefreshDelay(entry, now, refreshWindowMs) === 0
}

export function authRefreshDelay(
  entry: StoredAuthEntry,
  now = Date.now(),
  refreshWindowMs = 30_000,
): number | null {
  if (!isAuthEntryRefreshable(entry, now) || entry.expiresAt === undefined) {
    return null
  }
  return Math.max(0, entry.expiresAt - now - refreshWindowMs)
}

export function storageKey(sourceUrl: string) {
  return `better-swagger-auth:${sourceUrl}`
}

export function loadStoredEntries(sourceUrl: string): Map<string, StoredAuthEntry> {
  const key = storageKey(sourceUrl)

  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key)
    if (!raw) return new Map()

    const parsed = JSON.parse(raw) as StoredAuthEntry[]
    const now = Date.now()
    const valid = parsed.filter(
      (entry) => isAuthEntryValid(entry, now) || isAuthEntryRefreshable(entry, now),
    )
    const result = new Map(valid.map((entry) => [entry.schemeId, entry]))

    if (valid.length !== parsed.length || sessionStorage.getItem(key)) {
      persistEntries(sourceUrl, result)
      sessionStorage.removeItem(key)
    }

    return result
  } catch {
    return new Map()
  }
}

export function persistEntries(sourceUrl: string, entries: Map<string, StoredAuthEntry>) {
  localStorage.setItem(storageKey(sourceUrl), JSON.stringify([...entries.values()]))
}

export function purgeExpiredEntries(
  entries: Map<string, StoredAuthEntry>,
  now = Date.now(),
): Map<string, StoredAuthEntry> {
  const next = new Map<string, StoredAuthEntry>()
  for (const [schemeId, entry] of entries) {
    if (isAuthEntryValid(entry, now) || isAuthEntryRefreshable(entry, now)) {
      next.set(schemeId, entry)
    }
  }
  return next
}
