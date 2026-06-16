import type { OpenAPIV3 } from 'openapi-types'
import { proxyFetchText } from './proxy-fetch'

export interface InitOAuthConfig {
  clientId?: string
  clientSecret?: string
  scopes?: string
  appName?: string
  useBasicAuthenticationWithAccessCodeGrant?: boolean
}

export interface OAuth2PasswordScheme {
  kind: 'oauth2-password'
  id: string
  tokenUrl: string
  scopes: Record<string, string>
  clientId: string
  clientSecret: string
}

export interface OAuth2ClientCredentialsScheme {
  kind: 'oauth2-client-credentials'
  id: string
  tokenUrl: string
  scopes: Record<string, string>
  clientId: string
  clientSecret: string
}

export interface ApiKeyScheme {
  kind: 'apiKey'
  id: string
  name: string
  in: 'header' | 'query' | 'cookie'
}

export interface HttpBearerScheme {
  kind: 'http-bearer'
  id: string
}

export type SecuritySchemeInfo =
  | OAuth2PasswordScheme
  | OAuth2ClientCredentialsScheme
  | ApiKeyScheme
  | HttpBearerScheme

function swaggerUiBasePath(pathname: string): string {
  const match = pathname.match(/^(.*?)\/swagger-ui\/?/i)
  return match?.[1] ?? ''
}

export function parseInitOAuth(script: string): InitOAuthConfig | null {
  const match = script.match(/initOAuth\s*\(\s*(\{[\s\S]*?\})\s*\)/)
  if (!match?.[1]) return null

  try {
    return JSON.parse(match[1]) as InitOAuthConfig
  } catch {
    return null
  }
}

export async function loadInitOAuth(sourceUrl: string): Promise<InitOAuthConfig | null> {
  const pageUrl = new URL(sourceUrl.trim())
  const basePath = swaggerUiBasePath(pageUrl.pathname)
  const initializerPaths = [
    `${pageUrl.origin}${basePath}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}${basePath}/swagger-initializer.js`,
  ]

  for (const initializerUrl of initializerPaths) {
    try {
      const text = await proxyFetchText(initializerUrl)
      const config = parseInitOAuth(text)
      if (config) return config
    } catch {
      // try next path
    }
  }

  return null
}

export function parseSecuritySchemes(
  spec: OpenAPIV3.Document,
  oauthInit: InitOAuthConfig | null,
): SecuritySchemeInfo[] {
  const raw = spec.components?.securitySchemes ?? {}
  const clientId = oauthInit?.clientId ?? ''
  const clientSecret = oauthInit?.clientSecret ?? ''
  const result: SecuritySchemeInfo[] = []

  for (const [id, scheme] of Object.entries(raw)) {
    if (!scheme || '$ref' in scheme) continue

    if (scheme.type === 'oauth2' && scheme.flows) {
      if (scheme.flows.password?.tokenUrl) {
        result.push({
          kind: 'oauth2-password',
          id,
          tokenUrl: scheme.flows.password.tokenUrl,
          scopes: scheme.flows.password.scopes ?? {},
          clientId,
          clientSecret,
        })
        continue
      }

      if (scheme.flows.clientCredentials?.tokenUrl) {
        result.push({
          kind: 'oauth2-client-credentials',
          id,
          tokenUrl: scheme.flows.clientCredentials.tokenUrl,
          scopes: scheme.flows.clientCredentials.scopes ?? {},
          clientId,
          clientSecret,
        })
        continue
      }
    }

    if (scheme.type === 'apiKey') {
      const location = scheme.in
      if (location !== 'header' && location !== 'query' && location !== 'cookie') continue
      result.push({
        kind: 'apiKey',
        id,
        name: scheme.name,
        in: location,
      })
      continue
    }

    if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer') {
      result.push({ kind: 'http-bearer', id })
    }
  }

  return result
}

export function specHasSecurity(spec: OpenAPIV3.Document): boolean {
  if (spec.security?.length) return true
  return parseSecuritySchemes(spec, null).length > 0
}
