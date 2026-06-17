import { describe, expect, it } from 'vitest'
import { applyAuthToRequest } from './auth-request'
import type { StoredAuthEntry } from './auth-storage'

describe('applyAuthToRequest', () => {
  it('applies bearer, basic, and header api key auth', () => {
    const entries: StoredAuthEntry[] = [
      { schemeId: 'bearer', type: 'bearer', token: 'access-token' },
      {
        schemeId: 'basic',
        type: 'basic',
        token: '',
        username: 'user',
        password: 'pass',
      },
      {
        schemeId: 'headerKey',
        type: 'apiKey',
        token: 'header-secret',
        apiKeyName: 'X-API-Key',
        apiKeyIn: 'header',
      },
    ]

    const { headers } = applyAuthToRequest('https://api.example/items', {}, entries)

    expect(headers.Authorization).toBe('Basic ' + btoa('user:pass'))
    expect(headers['X-API-Key']).toBe('header-secret')
  })

  it('applies query and cookie api keys to the request URL and cookie list', () => {
    const entries: StoredAuthEntry[] = [
      {
        schemeId: 'queryKey',
        type: 'apiKey',
        token: 'query-secret',
        apiKeyName: 'api_key',
        apiKeyIn: 'query',
      },
      {
        schemeId: 'cookieKey',
        type: 'apiKey',
        token: 'cookie-secret',
        apiKeyName: 'session',
        apiKeyIn: 'cookie',
      },
    ]

    const { url, cookies } = applyAuthToRequest(
      'https://api.example/items?existing=1',
      {},
      entries,
    )

    expect(url).toBe('https://api.example/items?existing=1&api_key=query-secret')
    expect(cookies).toEqual([{ name: 'session', value: 'cookie-secret' }])
  })
})
