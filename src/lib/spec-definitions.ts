import { fetchJson, fetchText } from './fetch-utils'

export interface SpecDefinition {
  name: string
  url: string
}

function resolveAgainst(base: URL, value: string): string {
  return new URL(value, base).href
}

function swaggerUiBasePath(pathname: string): string {
  const match = pathname.match(/^(.*?)\/swagger-ui\/?/i)
  return match?.[1] ?? ''
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

function parseInitializerUrls(text: string, base: URL): SpecDefinition[] | null {
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
    return [{ name: 'default', url: resolveAgainst(base, singleUrl[1]) }]
  }

  return null
}

function parseInitializerConfigUrl(text: string, base: URL): string | null {
  const match = text.match(/configUrl\s*:\s*["']([^"']+)["']/)
  if (!match?.[1]?.trim()) return null
  return resolveAgainst(base, match[1])
}

async function extractFromInitializer(initializerUrl: string): Promise<SpecDefinition[] | null> {
  try {
    const text = await fetchText(initializerUrl)
    const base = new URL(initializerUrl)

    const configUrl = parseInitializerConfigUrl(text, base)
    if (configUrl) {
      const fromConfig = await extractFromConfig(configUrl)
      if (fromConfig?.length) return fromConfig
    }

    return parseInitializerUrls(text, base)
  } catch {
    return null
  }
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

    const configMatch = html.match(/configUrl\s*:\s*["']([^"']+)["']/)
    if (configMatch?.[1]) {
      const fromConfig = await extractFromConfig(resolveAgainst(pageUrl, configMatch[1]))
      if (fromConfig) return fromConfig
    }

    const urlMatch = html.match(/url\s*:\s*["']([^"']+)["']/)
    if (urlMatch?.[1] && !urlMatch[1].includes('swagger-ui')) {
      return [{ name: 'default', url: resolveAgainst(pageUrl, urlMatch[1]) }]
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
    const json = await fetchJson<Record<string, unknown>>(url)
    return typeof json.openapi === 'string' || typeof json.swagger === 'string'
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

  const fromPage = await extractFromSwaggerUiPage(pageUrl)
  if (fromPage && fromPage.length > 1) return fromPage

  const basePath = swaggerUiBasePath(pageUrl.pathname)
  const initializerPaths = [
    `${pageUrl.origin}${basePath}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}${basePath}/swagger-initializer.js`,
  ]

  for (const initializerUrl of initializerPaths) {
    const fromInitializer = await extractFromInitializer(initializerUrl)
    if (fromInitializer?.length) return fromInitializer
  }

  if (fromPage?.length) return fromPage

  for (const configPath of ['/v3/api-docs/swagger-config', '/swagger-config']) {
    const fromConfig = await extractFromConfig(resolveAgainst(pageUrl, configPath))
    if (fromConfig?.length) return fromConfig
  }

  const fromCandidates = await discoverFromCandidates(pageUrl)
  if (fromCandidates) return fromCandidates

  throw new Error(
    'Could not find OpenAPI spec definitions. The page may use a non-standard config or block cross-origin access.',
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
