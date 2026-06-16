import { proxyFetchJson, proxyFetchText } from './proxy-fetch'

const SPEC_CANDIDATES = [
  '/v3/api-docs',
  '/v2/api-docs',
  '/swagger.json',
  '/openapi.json',
  '/api-docs',
  '/openapi/v1.json',
]

function resolveAgainst(base: URL, value: string): string {
  return new URL(value, base).href
}

function swaggerUiBasePath(pathname: string): string {
  const match = pathname.match(/^(.*?)\/swagger-ui\/?/i)
  return match?.[1] ?? ''
}

function buildCandidates(pageUrl: URL): string[] {
  const basePath = swaggerUiBasePath(pageUrl.pathname)
  const prefixes = basePath ? [basePath, ''] : ['']

  const candidates = new Set<string>()

  for (const prefix of prefixes) {
    for (const path of SPEC_CANDIDATES) {
      candidates.add(`${pageUrl.origin}${prefix}${path}`)
    }
  }

  return [...candidates]
}

async function looksLikeOpenApi(url: string): Promise<boolean> {
  try {
    const json = await proxyFetchJson<Record<string, unknown>>(url)
    return typeof json.openapi === 'string' || typeof json.swagger === 'string'
  } catch {
    return false
  }
}

async function extractFromInitializer(initializerUrl: string): Promise<string | null> {
  try {
    const text = await proxyFetchText(initializerUrl)

    const singleUrl = text.match(/url:\s*["']([^"']+)["']/)
    if (singleUrl?.[1]) {
      return resolveAgainst(new URL(initializerUrl), singleUrl[1])
    }

    const urlsBlock = text.match(/urls:\s*\[\s*\{[^}]*url:\s*["']([^"']+)["']/s)
    if (urlsBlock?.[1]) {
      return resolveAgainst(new URL(initializerUrl), urlsBlock[1])
    }
  } catch {
    // try next strategy
  }

  return null
}

async function extractFromConfig(configUrl: string): Promise<string | null> {
  try {
    const config = await proxyFetchJson<{ url?: string; urls?: { url: string }[] }>(configUrl)
    if (config.url) {
      return resolveAgainst(new URL(configUrl), config.url)
    }
    if (config.urls?.[0]?.url) {
      return resolveAgainst(new URL(configUrl), config.urls[0].url)
    }
  } catch {
    // try next strategy
  }

  return null
}

async function extractFromSwaggerUiPage(pageUrl: URL): Promise<string | null> {
  try {
    const html = await proxyFetchText(pageUrl.href)

    const configMatch = html.match(/configUrl:\s*["']([^"']+)["']/)
    if (configMatch?.[1]) {
      const specUrl = await extractFromConfig(resolveAgainst(pageUrl, configMatch[1]))
      if (specUrl) return specUrl
    }

    const urlMatch = html.match(/url:\s*["']([^"']+)["']/)
    if (urlMatch?.[1] && !urlMatch[1].includes('swagger-ui')) {
      return resolveAgainst(pageUrl, urlMatch[1])
    }
  } catch {
    // try next strategy
  }

  return null
}

export async function resolveSpecUrl(input: string): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Enter a Swagger UI URL')
  }

  const pageUrl = new URL(trimmed)

  const directUrl = pageUrl.searchParams.get('url')
  if (directUrl) {
    return resolveAgainst(pageUrl, directUrl)
  }

  const configUrl = pageUrl.searchParams.get('configUrl')
  if (configUrl) {
    const resolved = await extractFromConfig(resolveAgainst(pageUrl, configUrl))
    if (resolved) return resolved
  }

  const fromPage = await extractFromSwaggerUiPage(pageUrl)
  if (fromPage) return fromPage

  const basePath = swaggerUiBasePath(pageUrl.pathname)
  const initializerPaths = [
    `${pageUrl.origin}${basePath}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}${basePath}/swagger-initializer.js`,
  ]

  for (const initializerUrl of initializerPaths) {
    const resolved = await extractFromInitializer(initializerUrl)
    if (resolved) return resolved
  }

  for (const candidate of buildCandidates(pageUrl)) {
    if (await looksLikeOpenApi(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'Could not find OpenAPI spec. The page may use a non-standard config or block proxy access.',
  )
}
