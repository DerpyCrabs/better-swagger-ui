import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import securitySchemes from '../../tests/fixtures/openapi/security-schemes.json'
import {
  parseInitOAuth,
  parseSecuritySchemes,
  specHasSecurity,
} from './auth-config'

const spec = securitySchemes as OpenAPIV3.Document

describe('parseInitOAuth', () => {
  it('parses valid initOAuth block', () => {
    const script = `
      window.ui = SwaggerUIBundle({ url: "/api" });
      initOAuth({ "clientId": "my-client", "clientSecret": "secret", "scopes": "read" });
    `
    expect(parseInitOAuth(script)).toEqual({
      clientId: 'my-client',
      clientSecret: 'secret',
      scopes: 'read',
    })
  })

  it('returns null for invalid JSON', () => {
    expect(parseInitOAuth('initOAuth({ broken })')).toBeNull()
    expect(parseInitOAuth('no oauth here')).toBeNull()
  })
})

describe('parseSecuritySchemes', () => {
  it('parses supported scheme types', () => {
    const schemes = parseSecuritySchemes(spec, {
      clientId: 'cid',
      clientSecret: 'csec',
    })
    const kinds = schemes.map((s) => s.kind)
    expect(kinds).toContain('apiKey')
    expect(kinds).toContain('http-bearer')
    expect(kinds).toContain('oauth2-password')
    expect(kinds).toContain('oauth2-client-credentials')
  })

  it('skips $ref schemes', () => {
    const schemes = parseSecuritySchemes(spec, null)
    expect(schemes.some((s) => s.id === 'RefScheme')).toBe(false)
  })

  it('skips unsupported oauth flows', () => {
    const oauthSpec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {},
      components: {
        securitySchemes: {
          implicit: {
            type: 'oauth2',
            flows: {
              implicit: { authorizationUrl: 'https://auth', scopes: {} },
            },
          },
        },
      },
    }
    expect(parseSecuritySchemes(oauthSpec, null)).toEqual([])
  })
})

describe('specHasSecurity', () => {
  it('detects global security', () => {
    expect(specHasSecurity(spec)).toBe(true)
  })

  it('returns false when no security', () => {
    const open: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {},
    }
    expect(specHasSecurity(open)).toBe(false)
  })
})
