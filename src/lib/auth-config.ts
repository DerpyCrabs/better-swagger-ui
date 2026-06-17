import type { OpenAPIV3 } from 'openapi-types'
import { fetchText } from './fetch-utils'

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

export interface HttpBasicScheme {
  kind: 'http-basic'
  id: string
}

export type SecuritySchemeInfo =
  | OAuth2PasswordScheme
  | OAuth2ClientCredentialsScheme
  | ApiKeyScheme
  | HttpBearerScheme
  | HttpBasicScheme

function resolveSecurityScheme(
  spec: OpenAPIV3.Document,
  scheme: OpenAPIV3.SecuritySchemeObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.SecuritySchemeObject | null {
  if ('$ref' in scheme) {
    if (!scheme.$ref.startsWith('#/')) return null

    let current: unknown = spec
    for (const part of scheme.$ref.slice(2).split('/')) {
      if (!current || typeof current !== 'object') return null
      current = (current as Record<string, unknown>)[part]
    }

    if (!current || typeof current !== 'object' || '$ref' in current) return null
    return current as OpenAPIV3.SecuritySchemeObject
  }

  return scheme
}

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
      const text = await fetchText(initializerUrl)
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
    if (!scheme) continue

    const resolved = resolveSecurityScheme(spec, scheme)
    if (!resolved) continue

    if (resolved.type === 'oauth2' && resolved.flows) {
      if (resolved.flows.password?.tokenUrl) {
        result.push({
          kind: 'oauth2-password',
          id,
          tokenUrl: resolved.flows.password.tokenUrl,
          scopes: resolved.flows.password.scopes ?? {},
          clientId,
          clientSecret,
        })
        continue
      }

      if (resolved.flows.clientCredentials?.tokenUrl) {
        result.push({
          kind: 'oauth2-client-credentials',
          id,
          tokenUrl: resolved.flows.clientCredentials.tokenUrl,
          scopes: resolved.flows.clientCredentials.scopes ?? {},
          clientId,
          clientSecret,
        })
        continue
      }
    }

    if (resolved.type === 'apiKey') {
      const location = resolved.in
      if (location !== 'header' && location !== 'query' && location !== 'cookie') continue
      result.push({
        kind: 'apiKey',
        id,
        name: resolved.name,
        in: location,
      })
      continue
    }

    if (resolved.type === 'http') {
      const httpScheme = resolved.scheme?.toLowerCase()
      if (httpScheme === 'bearer') {
        result.push({ kind: 'http-bearer', id })
        continue
      }
      if (httpScheme === 'basic') {
        result.push({ kind: 'http-basic', id })
      }
    }
  }

  return result
}

export function specHasSecurity(spec: OpenAPIV3.Document): boolean {
  if (spec.security?.length) return true
  return parseSecuritySchemes(spec, null).length > 0
}
