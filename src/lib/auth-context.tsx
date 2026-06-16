import {
  createContext,
  createEffect,
  createSignal,
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
  isAuthEntryValid,
  loadStoredEntries,
  persistEntries,
  purgeExpiredEntries,
  resolveTokenExpiry,
  type StoredAuthEntry,
} from './auth-storage'
import {
  fetchClientCredentialsToken,
  fetchPasswordToken,
  type ClientCredentialsLocation,
} from './oauth-token'

export type AuthEntry = StoredAuthEntry

interface AuthContextValue {
  schemes: () => SecuritySchemeInfo[]
  entries: () => Map<string, AuthEntry>
  isAuthorized: (schemeId: string) => boolean
  hasAnyScheme: () => boolean
  getRequestHeaders: () => Record<string, string>
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
  logout: (schemeId: string) => void
  logoutAll: () => void
}

const AuthContext = createContext<AuthContextValue>()

export function AuthProvider(
  props: ParentProps<{ loaded: Accessor<LoadedSpec | null> }>,
) {
  const [schemes, setSchemes] = createSignal<SecuritySchemeInfo[]>([])
  const [entries, setEntries] = createSignal<Map<string, AuthEntry>>(new Map())

  createEffect(() => {
    const loaded = props.loaded()
    if (!loaded) {
      setSchemes([])
      setEntries(new Map())
      return
    }

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

  const value: AuthContextValue = {
    schemes,
    entries: validEntries,
    hasAnyScheme: () => schemes().length > 0,
    isAuthorized: (schemeId) => {
      const entry = validEntries().get(schemeId)
      return Boolean(entry && isAuthEntryValid(entry))
    },
    getRequestHeaders: () => {
      const headers: Record<string, string> = {}
      for (const entry of validEntries().values()) {
        if (!isAuthEntryValid(entry)) continue
        if (entry.type === 'bearer') {
          headers.Authorization = `Bearer ${entry.token}`
        } else if (entry.type === 'apiKey' && entry.apiKeyIn === 'header' && entry.apiKeyName) {
          headers[entry.apiKeyName] = entry.token
        }
      }
      return headers
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
        next.set(input.schemeId, {
          schemeId: input.schemeId,
          type: 'bearer',
          token: token.access_token,
          expiresAt: resolveTokenExpiry(token, token.access_token),
        })
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
        next.set(input.schemeId, {
          schemeId: input.schemeId,
          type: 'bearer',
          token: token.access_token,
          expiresAt: resolveTokenExpiry(token, token.access_token),
        })
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
