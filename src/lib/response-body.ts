export interface ParsedResponseBody {
  body: unknown
  blob?: Blob
  fileName: string | null
  contentDisposition: string | null
  isFile: boolean
  copyText: string
  contentType: string | null
}

function baseMime(contentType: string | null): string {
  return contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
}

function getContentDisposition(response: Response): string | null {
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'content-disposition') return value
  }
  return response.headers.get('content-disposition')
}

export function fileNameFromDisposition(header: string | null | undefined): string | null {
  if (!header?.trim()) return null

  const value = header.trim()

  const star = value.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\n]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      return star[1].trim()
    }
  }

  const quoted = value.match(/filename\s*=\s*"([^"]*)"/i) ?? value.match(/filename\s*=\s*'([^']*)'/i)
  if (quoted?.[1]) return quoted[1]

  const plain = value.match(/filename\s*=\s*([^;\n]+)/i)
  if (plain?.[1]) return plain[1].trim().replace(/^["']|["']$/g, '')

  return null
}

export function fileNameFromResponse(response: Response): string | null {
  return fileNameFromDisposition(getContentDisposition(response))
}

function extensionFromContentType(contentType: string | null): string {
  const mime = baseMime(contentType)
  if (mime.includes('csv')) return 'csv'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('json')) return 'json'
  if (mime.includes('xml')) return 'xml'
  if (mime.startsWith('image/')) return mime.split('/')[1] ?? 'bin'
  if (mime.includes('zip')) return 'zip'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'xlsx'
  if (mime.includes('word') || mime.includes('msword')) return 'docx'
  return 'bin'
}

export function defaultDownloadName(contentType: string | null): string {
  return `download.${extensionFromContentType(contentType)}`
}

/** e.g. /v1/provider/csv → provider.csv */
export function inferFileNameFromUrl(url: string, contentType: string | null): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    if (parts.length === 0) return null

    const last = parts[parts.length - 1].toLowerCase()
    const ext = extensionFromContentType(contentType)

    if (last.includes('.')) return parts[parts.length - 1]

    if (last === 'csv' && parts.length >= 2) {
      return `${parts[parts.length - 2]}.csv`
    }

    if (last === 'csv') return 'download.csv'

    if (ext !== 'bin') return `${last}.${ext}`

    return null
  } catch {
    return null
  }
}

function resolveFileName(
  contentDisposition: string | null,
  requestUrl: string | undefined,
  contentType: string | null,
): string | null {
  const fromHeader = fileNameFromDisposition(contentDisposition)
  if (fromHeader) return fromHeader
  if (requestUrl) return inferFileNameFromUrl(requestUrl, contentType)
  return null
}

function looksLikeCsv(text: string): boolean {
  const sample = text.trim().slice(0, 4096)
  if (!sample) return false

  const lines = sample.split(/\r?\n/).filter(Boolean).slice(0, 5)
  if (lines.length === 0) return false

  return lines.every((line) => /"[^"]*"[;,]/.test(line) || /^[^;\n]+;[^;\n]+/.test(line))
}

function looksLikeBinary(text: string): boolean {
  return /[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 512))
}

function asTextFile(
  raw: string,
  mime: string,
  fileName: string | null,
  contentDisposition: string | null,
  contentType: string | null,
): ParsedResponseBody {
  const blob = new Blob([raw], { type: `${mime};charset=utf-8` })
  return {
    body: null,
    blob,
    fileName,
    contentDisposition,
    isFile: true,
    copyText: raw,
    contentType: contentType ?? mime,
  }
}

function isLikelyFileResponse(contentType: string | null, disposition: string | null): boolean {
  const mime = baseMime(contentType)

  if (/attachment/i.test(disposition ?? '')) return true

  if (!mime) return false

  if (
    mime === 'application/json' ||
    mime === 'application/problem+json' ||
    mime.endsWith('+json') ||
    mime === 'application/xml' ||
    mime === 'text/xml'
  ) {
    return false
  }

  if (mime.startsWith('text/') && !mime.includes('csv')) {
    return false
  }

  return (
    mime === 'application/octet-stream' ||
    mime.includes('csv') ||
    mime.startsWith('image/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    mime.includes('zip') ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.includes('msword') ||
    mime.includes('officedocument')
  )
}

export async function parseResponseBody(
  response: Response,
  requestUrl?: string,
): Promise<ParsedResponseBody> {
  const headerContentType = response.headers.get('content-type')
  const contentDisposition = getContentDisposition(response)
  const fileName = resolveFileName(contentDisposition, requestUrl, headerContentType)

  if (isLikelyFileResponse(headerContentType, contentDisposition)) {
    const blob = await response.blob()
    const mime = baseMime(headerContentType)
    const textMime = mime.includes('csv') ? 'text/csv' : mime || blob.type
    return {
      body: null,
      blob,
      fileName,
      contentDisposition,
      isFile: true,
      copyText: textMime.startsWith('text/') ? await blob.text() : '',
      contentType: headerContentType,
    }
  }

  const raw = await response.text()
  const mime = baseMime(headerContentType)

  if (mime.includes('json') || mime.endsWith('+json')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return {
        body: parsed,
        fileName,
        contentDisposition,
        isFile: false,
        copyText: JSON.stringify(parsed, null, 2),
        contentType: headerContentType,
      }
    } catch {
      if (looksLikeCsv(raw)) {
        return asTextFile(raw, 'text/csv', fileName, contentDisposition, 'text/csv')
      }
      if (looksLikeBinary(raw)) {
        const blob = new Blob([raw], { type: 'application/octet-stream' })
        return {
          body: null,
          blob,
          fileName,
          contentDisposition,
          isFile: true,
          copyText: '',
          contentType: 'application/octet-stream',
        }
      }
      return {
        body: raw,
        fileName,
        contentDisposition,
        isFile: false,
        copyText: raw,
        contentType: 'text/plain',
      }
    }
  }

  if (mime.includes('csv') || looksLikeCsv(raw)) {
    return asTextFile(raw, 'text/csv', fileName, contentDisposition, 'text/csv')
  }

  return {
    body: raw,
    fileName,
    contentDisposition,
    isFile: false,
    copyText: raw,
    contentType: headerContentType,
  }
}

export function resolveDownloadName(
  fileName: string | null | undefined,
  contentDisposition: string | null | undefined,
  contentType: string | null,
  requestUrl?: string,
): string {
  return (
    fileName ??
    fileNameFromDisposition(contentDisposition ?? null) ??
    (requestUrl ? inferFileNameFromUrl(requestUrl, contentType) : null) ??
    defaultDownloadName(contentType)
  )
}
