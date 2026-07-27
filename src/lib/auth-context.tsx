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
  isAuthEntryValid,
  isAuthEntryRefreshable,
  loadStoredEntries,
  persistEntries,
  purgeExpiredEntries,
  resolveRefreshTokenExpiry,
  resolveTokenExpiry,
  shouldRefreshAuthEntry,
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
}

function oauthEntry(input: OAuthEntryInput): StoredAuthEntry {
  const entry: StoredAuthEntry = {
    schemeId: input.schemeId,
    type: 'bearer',
    token: input.token.access_token,
    expiresAt: resolveTokenExpiry(input.token, input.token.access_token),
  }

  if (input.token.refresh_token) {
    entry.refreshToken = input.token.refresh_token
    entry.refreshExpiresAt = resolveRefreshTokenExpiry(
      input.token,
      input.token.refresh_token,
    )
    entry.oauthTokenUrl = input.tokenUrl
    entry.oauthClientId = input.clientId
    entry.oauthClientSecret = input.clientSecret
    entry.oauthClientCredentialsLocation = input.clientCredentialsLocation
  }

  return entry
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

    setSchemes(parseSecuritySchemes(loaded.spec, loaded.oauthInit))
    setEntries(loadStoredEntries(loaded.sourceUrl))
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

  const validEntries = () => purgeExpiredEntries(entries())

  const refreshEntry = (entry: AuthEntry): Promise<void> => {
    const pending = pendingRefreshes.get(entry.schemeId)
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

        updateEntries((current) => {
          const latest = current.get(entry.schemeId)
          if (!latest || latest.refreshToken !== entry.refreshToken) return current

          const nextRefreshToken = token.refresh_token ?? latest.refreshToken
          const next = new Map(current)
          next.set(entry.schemeId, {
            ...latest,
            token: token.access_token,
            expiresAt: resolveTokenExpiry(token, token.access_token),
            refreshToken: nextRefreshToken,
            refreshExpiresAt: token.refresh_token
              ? resolveRefreshTokenExpiry(token, token.refresh_token) ??
                latest.refreshExpiresAt
              : latest.refreshExpiresAt,
          })
          return next
        })
      } catch (error) {
        updateEntries((current) => {
          const latest = current.get(entry.schemeId)
          if (!latest || latest.refreshToken !== entry.refreshToken) return current
          const next = new Map(current)
          next.delete(entry.schemeId)
          return next
        })
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(`Authorization refresh failed: ${message}`)
      } finally {
        pendingRefreshes.delete(entry.schemeId)
      }
    })()

    pendingRefreshes.set(entry.schemeId, task)
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

      updateEntries((current) => {
        const next = new Map(current)
        next.set(input.schemeId, oauthEntry({
          schemeId: input.schemeId,
          token,
          tokenUrl: scheme.tokenUrl,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          clientCredentialsLocation: input.clientCredentialsLocation,
        }))
        return next
      })
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

      updateEntries((current) => {
        const next = new Map(current)
        next.set(input.schemeId, oauthEntry({
          schemeId: input.schemeId,
          token,
          tokenUrl: scheme.tokenUrl,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          clientCredentialsLocation: input.clientCredentialsLocation,
        }))
        return next
      })
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
      updateEntries((current) => {
        const next = new Map(current)
        next.delete(schemeId)
        return next
      })
    },
    logoutAll: () => {
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
