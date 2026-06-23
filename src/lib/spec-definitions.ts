import { fetchJson, fetchSpec, fetchText } from './fetch-utils'
import { loadSwaggerInitializer, swaggerUiBasePath } from './swagger-initializer'

export interface SpecDefinition {
  name: string
  url: string
}

const SWAGGER_CONFIG_PATHS = ['/v3/api-docs/swagger-config', '/swagger-config']

const SWAGGER_PLACEHOLDER_HOST = /petstore(\d)?\.swagger\.io/i

function resolveAgainst(base: URL, value: string): string {
  return new URL(value, base).href
}

function isSwaggerUiPage(pathname: string): boolean {
  return /\/swagger-ui\/?/i.test(pathname)
}

export function isPlaceholderSpecUrl(url: string): boolean {
  try {
    return SWAGGER_PLACEHOLDER_HOST.test(new URL(url).hostname)
  } catch {
    return SWAGGER_PLACEHOLDER_HOST.test(url)
  }
}

function hasConfigUrlReference(text: string): boolean {
  return /["']?configUrl["']?\s*:/.test(text)
}

function normalizeDefinitions(
  entries: { url: string; name?: string }[],
  base: URL,
): SpecDefinition[] {
  return entries.map((entry, index) => ({
    name: entry.name?.trim() || (index === 0 ? 'default' : `definition-${index}`),
    url: resolveAgainst(base, entry.url),
  }))
}

export function parseInitializerUrls(text: string, base: URL): SpecDefinition[] | null {
  if (/urls\s*:\s*\[/.test(text)) {
    const blockMatch = text.match(
      /urls\s*:\s*\[([\s\S]*?)\]\s*,?\s*(?:validatorUrl|oauth2RedirectUrl|presets|configUrl|layout|\w+\s*:)/,
    )
    const block = blockMatch?.[1] ?? text.match(/urls\s*:\s*\[([\s\S]*?)\]/)?.[1]
    if (block) {
      const entries: { url: string; name?: string }[] = []
      const itemPattern =
        /\{\s*url\s*:\s*["']([^"']+)["']\s*,\s*name\s*:\s*["']([^"']+)["']\s*\}/g
      let match: RegExpExecArray | null
      while ((match = itemPattern.exec(block)) !== null) {
        entries.push({ url: match[1], name: match[2] })
      }

      if (entries.length === 0) {
        const reversedPattern =
          /\{\s*name\s*:\s*["']([^"']+)["']\s*,\s*url\s*:\s*["']([^"']+)["']\s*\}/g
        while ((match = reversedPattern.exec(block)) !== null) {
          entries.push({ url: match[2], name: match[1] })
        }
      }

      if (entries.length > 0) {
        return normalizeDefinitions(entries, base)
      }
    }
  }

  const singleUrl = text.match(/url\s*:\s*["']([^"']+)["']/)
  if (singleUrl?.[1]?.trim() && !/urls\s*:\s*\[/.test(text)) {
    const resolved = resolveAgainst(base, singleUrl[1])
    if (isPlaceholderSpecUrl(resolved)) return null
    return [{ name: 'default', url: resolved }]
  }

  return null
}

export function parseInitializerConfigUrl(text: string, base: URL): string | null {
  const match = text.match(/["']?configUrl["']?\s*:\s*["']([^"']+)["']/)
  if (!match?.[1]?.trim()) return null
  return resolveAgainst(base, match[1])
}

async function definitionsFromInitializerScript(
  initializerUrl: string,
  text: string,
): Promise<SpecDefinition[] | null> {
  const base = new URL(initializerUrl)

  const configUrl = parseInitializerConfigUrl(text, base)
  if (configUrl) {
    const fromConfig = await extractFromConfig(configUrl)
    if (fromConfig?.length) return fromConfig
    if (hasConfigUrlReference(text)) return null
  }

  return parseInitializerUrls(text, base)
}

async function extractFromConfig(configUrl: string): Promise<SpecDefinition[] | null> {
  try {
    const config = await fetchJson<{ url?: string; urls?: { url: string; name?: string }[] }>(
      configUrl,
    )

    if (config.urls?.length) {
      return normalizeDefinitions(config.urls, new URL(configUrl))
    }

    if (config.url) {
      return [{ name: 'default', url: resolveAgainst(new URL(configUrl), config.url) }]
    }
  } catch {
    // try next strategy
  }

  return null
}

async function extractFromSwaggerUiPage(pageUrl: URL): Promise<SpecDefinition[] | null> {
  try {
    const html = await fetchText(pageUrl.href)

    const configMatch = html.match(/["']?configUrl["']?\s*:\s*["']([^"']+)["']/)
    if (configMatch?.[1]) {
      const fromConfig = await extractFromConfig(resolveAgainst(pageUrl, configMatch[1]))
      if (fromConfig) return fromConfig
    }

    const urlMatch = html.match(/url\s*:\s*["']([^"']+)["']/)
    if (urlMatch?.[1] && !urlMatch[1].includes('swagger-ui') && !hasConfigUrlReference(html)) {
      const resolved = resolveAgainst(pageUrl, urlMatch[1])
      if (!isPlaceholderSpecUrl(resolved)) {
        return [{ name: 'default', url: resolved }]
      }
    }
  } catch {
    // try next strategy
  }

  return null
}

const SPEC_CANDIDATES = [
  '/v3/api-docs',
  '/v2/api-docs',
  '/swagger.json',
  '/openapi.json',
  '/openapi.yaml',
  '/openapi.yml',
  '/api-docs',
  '/openapi/v1.json',
]

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
    const doc = await fetchSpec(url)
    if (!doc || typeof doc !== 'object') return false
    const record = doc as Record<string, unknown>
    return typeof record.openapi === 'string' || typeof record.swagger === 'string'
  } catch {
    return false
  }
}

async function discoverFromCandidates(pageUrl: URL): Promise<SpecDefinition[] | null> {
  for (const candidate of buildCandidates(pageUrl)) {
    if (await looksLikeOpenApi(candidate)) {
      return [{ name: 'default', url: candidate }]
    }
  }
  return null
}

async function discoverFromInitializer(pageUrl: URL): Promise<SpecDefinition[] | null> {
  const script = await loadSwaggerInitializer(pageUrl.href)
  if (!script) return null

  const definitions = await definitionsFromInitializerScript(script.url, script.text)
  return definitions?.length ? definitions : null
}

function resolveContextPath(pageUrl: URL, path: string): string {
  const basePath = swaggerUiBasePath(pageUrl.pathname)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return basePath
    ? `${pageUrl.origin}${basePath}${normalizedPath}`
    : `${pageUrl.origin}${normalizedPath}`
}

async function discoverFromSwaggerConfig(pageUrl: URL): Promise<SpecDefinition[] | null> {
  for (const configPath of SWAGGER_CONFIG_PATHS) {
    const fromConfig = await extractFromConfig(resolveContextPath(pageUrl, configPath))
    if (fromConfig?.length) return fromConfig
  }

  return null
}

async function discoverDirectSpecUrl(pageUrl: URL): Promise<SpecDefinition[] | null> {
  if (isSwaggerUiPage(pageUrl.pathname)) return null
  if (await looksLikeOpenApi(pageUrl.href)) {
    return [{ name: 'default', url: pageUrl.href }]
  }
  return null
}

export async function discoverSpecDefinitions(sourceUrl: string): Promise<SpecDefinition[]> {
  const trimmed = sourceUrl.trim()
  const pageUrl = new URL(trimmed)

  const directUrl = pageUrl.searchParams.get('url')
  if (directUrl) {
    return [{ name: 'default', url: resolveAgainst(pageUrl, directUrl) }]
  }

  const configUrl = pageUrl.searchParams.get('configUrl')
  if (configUrl) {
    const fromConfig = await extractFromConfig(resolveAgainst(pageUrl, configUrl))
    if (fromConfig) return fromConfig
  }

  const directSpec = await discoverDirectSpecUrl(pageUrl)
  if (directSpec) return directSpec

  if (isSwaggerUiPage(pageUrl.pathname)) {
    const fromInitializer = await discoverFromInitializer(pageUrl)
    if (fromInitializer?.length) return fromInitializer

    const fromPage = await extractFromSwaggerUiPage(pageUrl)
    if (fromPage && fromPage.length > 1) return fromPage

    const fromConfig = await discoverFromSwaggerConfig(pageUrl)
    if (fromConfig?.length) return fromConfig

    if (fromPage?.length) return fromPage

    const fromCandidates = await discoverFromCandidates(pageUrl)
    if (fromCandidates) return fromCandidates
  } else {
    const fromPage = await extractFromSwaggerUiPage(pageUrl)
    if (fromPage?.length) return fromPage

    const fromCandidates = await discoverFromCandidates(pageUrl)
    if (fromCandidates) return fromCandidates
  }

  throw new Error(
    'Could not find OpenAPI spec. Try pasting the direct spec URL (e.g. /v3/api-docs) if the API allows cross-origin access.',
  )
}

export function pickDefinition(
  definitions: SpecDefinition[],
  name: string | null | undefined,
): SpecDefinition {
  if (name) {
    const match = definitions.find((item) => item.name === name)
    if (match) return match
  }

  return definitions[0]
}

export async function resolveSpecUrl(input: string, definitionName?: string | null): Promise<string> {
  const definitions = await discoverSpecDefinitions(input)
  return pickDefinition(definitions, definitionName).url
}
