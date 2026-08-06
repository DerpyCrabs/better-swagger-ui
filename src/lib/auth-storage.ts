import type { TokenResponse } from './oauth-token'

export type OAuthFlowKind = 'oauth2-password' | 'oauth2-client-credentials'

export const AUTH_STORAGE_PREFIX = 'better-swagger-auth:'
/** Canonical OAuth tokens keyed by fingerprint (survives service switches). */
export const AUTH_OAUTH_SHARED_PREFIX = 'better-swagger-oauth:'

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
  oauthFlowKind?: OAuthFlowKind
}

export interface OAuthReuseScheme {
  id: string
  kind: string
  tokenUrl?: string
  clientId?: string
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
  return `${AUTH_STORAGE_PREFIX}${sourceUrl}`
}

export function normalizeTokenUrl(tokenUrl: string): string {
  const trimmed = tokenUrl.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    url.hash = ''
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

export function toOAuthFlowKind(kind: string): OAuthFlowKind | null {
  if (kind === 'oauth2-password' || kind === 'oauth2-client-credentials') {
    return kind
  }
  return null
}

export function oauthFingerprint(
  flowKind: OAuthFlowKind,
  tokenUrl: string,
  clientId: string,
): string | null {
  const normalized = normalizeTokenUrl(tokenUrl)
  const client = clientId.trim()
  if (!normalized || !client) return null
  return `${flowKind}|${normalized}|${client}`
}

export function entryOAuthFingerprint(entry: StoredAuthEntry): string | null {
  if (!entry.oauthFlowKind || !entry.oauthTokenUrl || !entry.oauthClientId) {
    return null
  }
  return oauthFingerprint(
    entry.oauthFlowKind,
    entry.oauthTokenUrl,
    entry.oauthClientId,
  )
}

export function sharedOAuthStorageKey(fingerprint: string) {
  return `${AUTH_OAUTH_SHARED_PREFIX}${fingerprint}`
}

export function entryMatchesOAuthReuse(
  entry: StoredAuthEntry,
  flowKind: OAuthFlowKind,
  tokenUrl: string,
  clientId: string,
): boolean {
  if (entry.type !== 'bearer' || !entry.oauthTokenUrl || !entry.oauthClientId) {
    return false
  }
  if (entry.oauthFlowKind && entry.oauthFlowKind !== flowKind) {
    return false
  }
  if (normalizeTokenUrl(entry.oauthTokenUrl) !== normalizeTokenUrl(tokenUrl)) {
    return false
  }
  const wantedClientId = clientId.trim()
  if (wantedClientId && entry.oauthClientId.trim() !== wantedClientId) {
    return false
  }
  return true
}

function compareOAuthEntries(
  a: StoredAuthEntry,
  b: StoredAuthEntry,
  now = Date.now(),
): number {
  const aValid = isAuthEntryValid(a, now) ? 1 : 0
  const bValid = isAuthEntryValid(b, now) ? 1 : 0
  if (aValid !== bValid) return bValid - aValid
  return (b.expiresAt ?? 0) - (a.expiresAt ?? 0)
}

function withOAuthTokenFields(
  target: StoredAuthEntry,
  source: StoredAuthEntry,
): StoredAuthEntry {
  return {
    ...target,
    token: source.token,
    expiresAt: source.expiresAt,
    refreshToken: source.refreshToken,
    refreshExpiresAt: source.refreshExpiresAt,
    oauthTokenUrl: source.oauthTokenUrl,
    oauthClientId: source.oauthClientId,
    oauthClientSecret: source.oauthClientSecret,
    oauthClientCredentialsLocation: source.oauthClientCredentialsLocation,
    oauthFlowKind: source.oauthFlowKind ?? target.oauthFlowKind,
  }
}

export function persistSharedOAuthEntry(entry: StoredAuthEntry): void {
  const fingerprint = entryOAuthFingerprint(entry)
  if (!fingerprint) return
  if (!isAuthEntryValid(entry) && !isAuthEntryRefreshable(entry)) return

  localStorage.setItem(
    sharedOAuthStorageKey(fingerprint),
    JSON.stringify({ ...entry, schemeId: '_shared' }),
  )
}

export function loadSharedOAuthEntry(
  flowKind: OAuthFlowKind,
  tokenUrl: string,
  clientId: string,
): StoredAuthEntry | null {
  const now = Date.now()
  const wantedClientId = clientId.trim()

  if (wantedClientId) {
    const fingerprint = oauthFingerprint(flowKind, tokenUrl, wantedClientId)
    if (!fingerprint) return null
    return readSharedOAuthEntry(fingerprint, now)
  }

  const normalized = normalizeTokenUrl(tokenUrl)
  if (!normalized) return null
  const prefix = `${AUTH_OAUTH_SHARED_PREFIX}${flowKind}|${normalized}|`
  const candidates: StoredAuthEntry[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const fingerprint = key.slice(AUTH_OAUTH_SHARED_PREFIX.length)
    const entry = readSharedOAuthEntry(fingerprint, now)
    if (entry) candidates.push(entry)
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => compareOAuthEntries(a, b, now))
  return candidates[0] ?? null
}

function readSharedOAuthEntry(
  fingerprint: string,
  now = Date.now(),
): StoredAuthEntry | null {
  try {
    const key = sharedOAuthStorageKey(fingerprint)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as StoredAuthEntry
    if (!isAuthEntryValid(entry, now) && !isAuthEntryRefreshable(entry, now)) {
      localStorage.removeItem(key)
      return null
    }
    return entry
  } catch {
    return null
  }
}

export function clearSharedOAuthEntry(
  flowKind: OAuthFlowKind,
  tokenUrl: string,
  clientId: string,
): void {
  const wantedClientId = clientId.trim()
  if (wantedClientId) {
    const fingerprint = oauthFingerprint(flowKind, tokenUrl, wantedClientId)
    if (fingerprint) localStorage.removeItem(sharedOAuthStorageKey(fingerprint))
    return
  }

  const normalized = normalizeTokenUrl(tokenUrl)
  if (!normalized) return
  const prefix = `${AUTH_OAUTH_SHARED_PREFIX}${flowKind}|${normalized}|`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) toRemove.push(key)
  }
  for (const key of toRemove) localStorage.removeItem(key)
}

function listAuthStorageKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(AUTH_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

function readEntriesFromKey(key: string, now = Date.now()): StoredAuthEntry[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredAuthEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry) => isAuthEntryValid(entry, now) || isAuthEntryRefreshable(entry, now),
    )
  } catch {
    return []
  }
}

export function findReusableOAuthEntry(options: {
  flowKind: OAuthFlowKind
  tokenUrl: string
  clientId: string
  excludeSourceUrl?: string
}): StoredAuthEntry | null {
  const now = Date.now()
  const excludeKey = options.excludeSourceUrl
    ? storageKey(options.excludeSourceUrl)
    : null
  const candidates: StoredAuthEntry[] = []

  for (const key of listAuthStorageKeys()) {
    if (excludeKey && key === excludeKey) continue
    for (const entry of readEntriesFromKey(key, now)) {
      if (
        entryMatchesOAuthReuse(
          entry,
          options.flowKind,
          options.tokenUrl,
          options.clientId,
        )
      ) {
        candidates.push(entry)
      }
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => compareOAuthEntries(a, b, now))
  return candidates[0] ?? null
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

/**
 * Load per-source auth and resolve OAuth schemes from the freshest matching
 * token (shared fingerprint store, local bag, or other services).
 */
export function loadStoredEntriesForSchemes(
  sourceUrl: string,
  schemes: OAuthReuseScheme[],
): Map<string, StoredAuthEntry> {
  const local = loadStoredEntries(sourceUrl)
  const next = new Map(local)
  let changed = false
  const now = Date.now()

  for (const scheme of schemes) {
    if (!scheme.tokenUrl) continue
    const flowKind = toOAuthFlowKind(scheme.kind)
    if (!flowKind) continue

    const localEntry = next.get(scheme.id)
    if (
      localEntry &&
      (localEntry.type !== 'bearer' ||
        (!localEntry.oauthTokenUrl && Boolean(localEntry.token)))
    ) {
      // Keep non-OAuth credentials bound to this scheme id.
      continue
    }

    const candidates: StoredAuthEntry[] = []
    if (
      localEntry &&
      entryMatchesOAuthReuse(
        localEntry,
        flowKind,
        scheme.tokenUrl,
        scheme.clientId ?? '',
      )
    ) {
      candidates.push(localEntry)
    }

    const shared = loadSharedOAuthEntry(
      flowKind,
      scheme.tokenUrl,
      scheme.clientId ?? '',
    )
    if (shared) candidates.push(shared)

    const fromOthers = findReusableOAuthEntry({
      flowKind,
      tokenUrl: scheme.tokenUrl,
      clientId: scheme.clientId ?? '',
      excludeSourceUrl: sourceUrl,
    })
    if (fromOthers) candidates.push(fromOthers)

    if (candidates.length === 0) continue

    candidates.sort((a, b) => compareOAuthEntries(a, b, now))
    const best = candidates[0]!
    const projected: StoredAuthEntry = {
      ...best,
      schemeId: scheme.id,
      oauthFlowKind: best.oauthFlowKind ?? flowKind,
    }

    const current = next.get(scheme.id)
    if (
      !current ||
      current.token !== projected.token ||
      current.expiresAt !== projected.expiresAt ||
      current.refreshToken !== projected.refreshToken ||
      current.refreshExpiresAt !== projected.refreshExpiresAt
    ) {
      next.set(scheme.id, projected)
      changed = true
    }
  }

  if (changed) persistEntries(sourceUrl, next)
  return next
}

export function persistEntries(sourceUrl: string, entries: Map<string, StoredAuthEntry>) {
  localStorage.setItem(storageKey(sourceUrl), JSON.stringify([...entries.values()]))
}

/** Push token fields to every stored entry that shares this OAuth identity. */
export function syncOAuthEntryAcrossSources(
  entry: StoredAuthEntry,
  options?: { excludeSourceUrl?: string },
): void {
  if (
    entry.type !== 'bearer' ||
    !entry.oauthTokenUrl ||
    !entry.oauthClientId ||
    !entry.oauthFlowKind
  ) {
    return
  }

  const excludeKey = options?.excludeSourceUrl
    ? storageKey(options.excludeSourceUrl)
    : null

  for (const key of listAuthStorageKeys()) {
    if (excludeKey && key === excludeKey) continue

    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as StoredAuthEntry[]
      if (!Array.isArray(parsed)) continue

      let changed = false
      const next = parsed.map((stored) => {
        if (
          !entryMatchesOAuthReuse(
            stored,
            entry.oauthFlowKind!,
            entry.oauthTokenUrl!,
            entry.oauthClientId!,
          )
        ) {
          return stored
        }
        changed = true
        return withOAuthTokenFields(stored, entry)
      })

      if (changed) localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // ignore corrupt bags
    }
  }
}

/** Persist canonical fingerprint token and sync all per-source bags. */
export function publishOAuthEntry(
  entry: StoredAuthEntry,
  options?: { excludeSourceUrl?: string },
): void {
  persistSharedOAuthEntry(entry)
  syncOAuthEntryAcrossSources(entry, options)
}

/** Remove OAuth entries with this identity from every source bag and shared store. */
export function clearOAuthAcrossSources(
  flowKind: OAuthFlowKind,
  tokenUrl: string,
  clientId: string,
): void {
  clearSharedOAuthEntry(flowKind, tokenUrl, clientId)

  for (const key of listAuthStorageKeys()) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as StoredAuthEntry[]
      if (!Array.isArray(parsed)) continue

      const next = parsed.filter(
        (entry) => !entryMatchesOAuthReuse(entry, flowKind, tokenUrl, clientId),
      )
      if (next.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(next))
      }
    } catch {
      // ignore corrupt bags
    }
  }
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
