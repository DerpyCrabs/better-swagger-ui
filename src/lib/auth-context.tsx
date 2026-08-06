import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from 'solid-js'
import type { LoadedSpec } from './load-spec'
import {
  parseSecuritySchemes,
  type SecuritySchemeInfo,
} from './auth-config'
import {
  authRefreshDelay,
  clearOAuthAcrossSources,
  entryMatchesOAuthReuse,
  entryOAuthFingerprint,
  isAuthEntryValid,
  isAuthEntryRefreshable,
  loadStoredEntriesForSchemes,
  persistEntries,
  publishOAuthEntry,
  purgeExpiredEntries,
  resolveRefreshTokenExpiry,
  resolveTokenExpiry,
  shouldRefreshAuthEntry,
  type OAuthFlowKind,
  type StoredAuthEntry,
} from './auth-storage'
import {
  fetchClientCredentialsToken,
  fetchPasswordToken,
  fetchRefreshToken,
  type ClientCredentialsLocation,
  type TokenResponse,
} from './oauth-token'
import { applyAuthToRequest } from './auth-request'

export type AuthEntry = StoredAuthEntry

interface AuthContextValue {
  schemes: () => SecuritySchemeInfo[]
  entries: () => Map<string, AuthEntry>
  isAuthorized: (schemeId: string) => boolean
  hasAnyScheme: () => boolean
  getRequestHeaders: () => Record<string, string>
  applyToRequest: (url: string, headers: Record<string, string>) => Promise<{
    url: string
    headers: Record<string, string>
    cookies: Array<{ name: string; value: string }>
  }>
  authorizeOAuthPassword: (input: {
    schemeId: string
    username: string
    password: string
    clientId: string
    clientSecret: string
    clientCredentialsLocation: ClientCredentialsLocation
  }) => Promise<void>
  authorizeOAuthClientCredentials: (input: {
    schemeId: string
    clientId: string
    clientSecret: string
    clientCredentialsLocation: ClientCredentialsLocation
  }) => Promise<void>
  authorizeApiKey: (schemeId: string, value: string) => void
  authorizeBearer: (schemeId: string, token: string) => void
  authorizeBasic: (schemeId: string, username: string, password: string) => void
  logout: (schemeId: string) => void
  logoutAll: () => void
}

const AuthContext = createContext<AuthContextValue>()

interface OAuthEntryInput {
  schemeId: string
  token: TokenResponse
  tokenUrl: string
  clientId: string
  clientSecret: string
  clientCredentialsLocation: ClientCredentialsLocation
  flowKind: OAuthFlowKind
}

function oauthEntry(input: OAuthEntryInput): StoredAuthEntry {
  const entry: StoredAuthEntry = {
    schemeId: input.schemeId,
    type: 'bearer',
    token: input.token.access_token,
    expiresAt: resolveTokenExpiry(input.token, input.token.access_token),
    oauthTokenUrl: input.tokenUrl,
    oauthClientId: input.clientId,
    oauthClientSecret: input.clientSecret,
    oauthClientCredentialsLocation: input.clientCredentialsLocation,
    oauthFlowKind: input.flowKind,
  }

  if (input.token.refresh_token) {
    entry.refreshToken = input.token.refresh_token
    entry.refreshExpiresAt = resolveRefreshTokenExpiry(
      input.token,
      input.token.refresh_token,
    )
  }

  return entry
}

function clearReusableOAuth(entry: StoredAuthEntry | undefined) {
  if (
    !entry?.oauthFlowKind ||
    !entry.oauthTokenUrl ||
    !entry.oauthClientId
  ) {
    return
  }
  clearOAuthAcrossSources(
    entry.oauthFlowKind,
    entry.oauthTokenUrl,
    entry.oauthClientId,
  )
}

export function AuthProvider(
  props: ParentProps<{ loaded: Accessor<LoadedSpec | null> }>,
) {
  const [schemes, setSchemes] = createSignal<SecuritySchemeInfo[]>([])
  const [entries, setEntries] = createSignal<Map<string, AuthEntry>>(new Map())
  const pendingRefreshes = new Map<string, Promise<void>>()

  createEffect(() => {
    const loaded = props.loaded()
    if (!loaded) return

    const nextSchemes = parseSecuritySchemes(loaded.spec, loaded.oauthInit)
    setSchemes(nextSchemes)
    setEntries(loadStoredEntriesForSchemes(loaded.sourceUrl, nextSchemes))
  })

  const updateEntries = (updater: (current: Map<string, AuthEntry>) => Map<string, AuthEntry>) => {
    const loaded = props.loaded()
    if (!loaded) return
    setEntries((current) => {
      const next = purgeExpiredEntries(updater(current))
      persistEntries(loaded.sourceUrl, next)
      return next
    })
  }

  const persistOAuthEntry = (entry: AuthEntry) => {
    updateEntries((current) => {
      const next = new Map(current)
      next.set(entry.schemeId, entry)
      return next
    })
    publishOAuthEntry(entry, {
      excludeSourceUrl: props.loaded()?.sourceUrl,
    })
  }

  const validEntries = () => purgeExpiredEntries(entries())

  const refreshEntry = (entry: AuthEntry): Promise<void> => {
    const refreshKey = entryOAuthFingerprint(entry) ?? entry.schemeId
    const pending = pendingRefreshes.get(refreshKey)
    if (pending) return pending

    const task = (async () => {
      try {
        const token = await fetchRefreshToken({
          tokenUrl: entry.oauthTokenUrl!,
          refreshToken: entry.refreshToken!,
          clientId: entry.oauthClientId!,
          clientSecret: entry.oauthClientSecret ?? '',
          clientCredentialsLocation: entry.oauthClientCredentialsLocation!,
        })

        const nextRefreshToken = token.refresh_token ?? entry.refreshToken
        const refreshed: AuthEntry = {
          ...entry,
          token: token.access_token,
          expiresAt: resolveTokenExpiry(token, token.access_token),
          refreshToken: nextRefreshToken,
          refreshExpiresAt: token.refresh_token
            ? resolveRefreshTokenExpiry(token, token.refresh_token) ??
              entry.refreshExpiresAt
            : entry.refreshExpiresAt,
        }

        // Write shared fingerprint store first so a mid-refresh service switch
        // still picks up the new access/refresh tokens on load.
        publishOAuthEntry(refreshed)

        updateEntries((current) => {
          let changed = false
          const next = new Map(current)
          for (const [schemeId, latest] of current) {
            if (latest.refreshToken !== entry.refreshToken) continue
            if (
              entry.oauthFlowKind &&
              entry.oauthTokenUrl &&
              entry.oauthClientId &&
              !entryMatchesOAuthReuse(
                latest,
                entry.oauthFlowKind,
                entry.oauthTokenUrl,
                entry.oauthClientId,
              )
            ) {
              continue
            }
            next.set(schemeId, { ...refreshed, schemeId })
            changed = true
          }
          return changed ? next : current
        })
      } catch (error) {
        clearReusableOAuth(entry)
        updateEntries((current) => {
          let changed = false
          const next = new Map(current)
          for (const [schemeId, latest] of current) {
            if (latest.refreshToken !== entry.refreshToken) continue
            if (
              entry.oauthFlowKind &&
              entry.oauthTokenUrl &&
              entry.oauthClientId &&
              !entryMatchesOAuthReuse(
                latest,
                entry.oauthFlowKind,
                entry.oauthTokenUrl,
                entry.oauthClientId,
              )
            ) {
              continue
            }
            next.delete(schemeId)
            changed = true
          }
          return changed ? next : current
        })
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(`Authorization refresh failed: ${message}`)
      } finally {
        pendingRefreshes.delete(refreshKey)
      }
    })()

    pendingRefreshes.set(refreshKey, task)
    return task
  }

  const refreshExpiringEntries = async () => {
    const refreshes = [...entries().values()]
      .filter((entry) => shouldRefreshAuthEntry(entry))
      .map((entry) => refreshEntry(entry))
    await Promise.all(refreshes)
  }

  createEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const now = Date.now()

    for (const entry of entries().values()) {
      const delay = authRefreshDelay(entry, now)
      if (delay === null) continue

      timers.push(
        setTimeout(() => {
          void refreshEntry(entry).catch(() => {
            // refreshEntry clears invalid authorization
          })
        }, delay),
      )
    }

    onCleanup(() => {
      for (const timer of timers) clearTimeout(timer)
    })
  })

  const value: AuthContextValue = {
    schemes,
    entries: validEntries,
    hasAnyScheme: () => schemes().length > 0,
    isAuthorized: (schemeId) => {
      const entry = validEntries().get(schemeId)
      return Boolean(
        entry && (isAuthEntryValid(entry) || isAuthEntryRefreshable(entry)),
      )
    },
    getRequestHeaders: () => {
      return applyAuthToRequest('', {}, validEntries().values()).headers
    },
    applyToRequest: async (url, headers) => {
      await refreshExpiringEntries()
      return applyAuthToRequest(url, headers, validEntries().values())
    },
    authorizeOAuthPassword: async (input) => {
      const scheme = schemes().find((item) => item.id === input.schemeId)
      if (!scheme || scheme.kind !== 'oauth2-password') {
        throw new Error('Unknown OAuth2 password scheme')
      }

      const token = await fetchPasswordToken({
        tokenUrl: scheme.tokenUrl,
        username: input.username,
        password: input.password,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        clientCredentialsLocation: input.clientCredentialsLocation,
      })

      persistOAuthEntry(oauthEntry({
        schemeId: input.schemeId,
        token,
        tokenUrl: scheme.tokenUrl,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        clientCredentialsLocation: input.clientCredentialsLocation,
        flowKind: 'oauth2-password',
      }))
    },
    authorizeOAuthClientCredentials: async (input) => {
      const scheme = schemes().find((item) => item.id === input.schemeId)
      if (!scheme || scheme.kind !== 'oauth2-client-credentials') {
        throw new Error('Unknown OAuth2 client credentials scheme')
      }

      const token = await fetchClientCredentialsToken(
        scheme.tokenUrl,
        input.clientId,
        input.clientSecret,
        input.clientCredentialsLocation,
      )

      persistOAuthEntry(oauthEntry({
        schemeId: input.schemeId,
        token,
        tokenUrl: scheme.tokenUrl,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        clientCredentialsLocation: input.clientCredentialsLocation,
        flowKind: 'oauth2-client-credentials',
      }))
    },
    authorizeApiKey: (schemeId, token) => {
      const scheme = schemes().find((item) => item.id === schemeId)
      if (!scheme || scheme.kind !== 'apiKey') return

      updateEntries((current) => {
        const next = new Map(current)
        next.set(schemeId, {
          schemeId,
          type: 'apiKey',
          token,
          apiKeyName: scheme.name,
          apiKeyIn: scheme.in,
        })
        return next
      })
    },
    authorizeBearer: (schemeId, token) => {
      updateEntries((current) => {
        const next = new Map(current)
        next.set(schemeId, {
          schemeId,
          type: 'bearer',
          token,
          expiresAt: resolveTokenExpiry({}, token),
        })
        return next
      })
    },
    authorizeBasic: (schemeId, username, password) => {
      const scheme = schemes().find((item) => item.id === schemeId)
      if (!scheme || scheme.kind !== 'http-basic') return

      updateEntries((current) => {
        const next = new Map(current)
        next.set(schemeId, {
          schemeId,
          type: 'basic',
          token: '',
          username,
          password,
        })
        return next
      })
    },
    logout: (schemeId) => {
      const existing = entries().get(schemeId)
      clearReusableOAuth(existing)
      updateEntries((current) => {
        const next = new Map(current)
        next.delete(schemeId)
        return next
      })
    },
    logoutAll: () => {
      for (const entry of entries().values()) {
        clearReusableOAuth(entry)
      }
      updateEntries(() => new Map())
    },
  }

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
