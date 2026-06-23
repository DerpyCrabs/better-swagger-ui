import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from './query-client'

vi.mock('./fetch-utils', () => ({
  fetchText: vi.fn(),
  fetchJson: vi.fn(),
  fetchSpec: vi.fn(),
}))

import { fetchJson, fetchText } from './fetch-utils'
import { loadInitOAuth } from './auth-config'
import { discoverSpecDefinitions } from './spec-definitions'
import { loadSwaggerInitializer } from './swagger-initializer'

const mockedFetchText = vi.mocked(fetchText)
const mockedFetchJson = vi.mocked(fetchJson)

const SOURCE_URL = 'http://localhost:5199/nested-app/swagger-ui/index.html'
const INITIALIZER_URL = 'http://localhost:5199/nested-app/swagger-ui/swagger-initializer.js'

describe('loadSwaggerInitializer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('loads the first reachable initializer script', async () => {
    mockedFetchText.mockResolvedValueOnce('window.ui = SwaggerUIBundle({ url: "/api" });')

    const script = await loadSwaggerInitializer(SOURCE_URL)

    expect(script?.url).toBe(INITIALIZER_URL)
    expect(mockedFetchText).toHaveBeenCalledTimes(1)
  })

  it('reuses cached initializer text for repeated loads', async () => {
    mockedFetchText.mockResolvedValueOnce(`
      window.ui = SwaggerUIBundle({ url: "/api" });
      initOAuth({ "clientId": "client", "clientSecret": "secret" });
    `)

    await loadSwaggerInitializer(SOURCE_URL)
    await loadSwaggerInitializer(SOURCE_URL)

    expect(mockedFetchText).toHaveBeenCalledTimes(1)
  })
})

describe('initializer dedup across spec discovery and oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('fetches swagger-initializer.js once for discovery and oauth', async () => {
    mockedFetchText.mockResolvedValueOnce(`
      window.ui = SwaggerUIBundle({
        "configUrl": "/nested-app/v3/api-docs/swagger-config",
      });
      initOAuth({ "clientId": "client", "clientSecret": "secret" });
    `)
    mockedFetchJson.mockResolvedValueOnce({
      urls: [{ url: '/openapi/a.json', name: 'API A' }],
    })

    await discoverSpecDefinitions(SOURCE_URL)
    await loadInitOAuth(SOURCE_URL)

    const initializerFetches = mockedFetchText.mock.calls.filter(([url]) =>
      url.includes('swagger-initializer.js'),
    )
    expect(initializerFetches).toEqual([[INITIALIZER_URL]])
  })
})

describe('loadInitOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('parses oauth config from cached initializer script', async () => {
    mockedFetchText.mockResolvedValueOnce(`
      initOAuth({ "clientId": "my-client", "clientSecret": "secret" });
    `)

    await expect(loadInitOAuth(SOURCE_URL)).resolves.toEqual({
      clientId: 'my-client',
      clientSecret: 'secret',
    })
  })
})
