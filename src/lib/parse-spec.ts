import { parse as parseYaml } from 'yaml'

const YAML_CONTENT_TYPES = new Set([
  'application/yaml',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
])

export function isYamlSpecUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return pathname.endsWith('.yaml') || pathname.endsWith('.yml')
  } catch {
    return /\.ya?ml(\?|#|$)/i.test(url)
  }
}

export function contentTypeIsYaml(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const base = contentType.split(';')[0]?.trim().toLowerCase()
  return base ? YAML_CONTENT_TYPES.has(base) : false
}

export function looksLikeSpecText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('{')) return true
  return /^(openapi|swagger)\s*:/m.test(trimmed)
}

export function parseSpecText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Spec content is empty')
  }

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error('Invalid JSON spec')
    }
  }

  try {
    return parseYaml(trimmed)
  } catch {
    throw new Error('Invalid YAML spec')
  }
}

export function parseSpecResponse(
  text: string,
  url: string,
  contentType: string | null,
): unknown {
  if (isYamlSpecUrl(url) || contentTypeIsYaml(contentType)) {
    return parseSpecText(text)
  }

  try {
    return JSON.parse(text)
  } catch {
    if (looksLikeSpecText(text) && !text.trim().startsWith('{')) {
      return parseSpecText(text)
    }
    throw new Error('Response is not valid JSON or YAML')
  }
}
