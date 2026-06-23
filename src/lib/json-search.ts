import { type FoldRegion, isRootFoldRegion } from './json-folding'

export interface JsonSearchMatch {
  lineIndex: number
  start: number
  end: number
  globalIndex: number
}

export function findJsonSearchMatches(
  lines: string[],
  query: string,
  options?: { caseSensitive?: boolean },
): JsonSearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const caseSensitive = options?.caseSensitive ?? false
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
  const matches: JsonSearchMatch[] = []
  let globalIndex = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ''
    const haystack = caseSensitive ? line : line.toLowerCase()
    let start = 0

    while (start <= haystack.length - needle.length) {
      const index = haystack.indexOf(needle, start)
      if (index === -1) break

      matches.push({
        lineIndex,
        start: index,
        end: index + needle.length,
        globalIndex,
      })
      globalIndex++
      start = index + Math.max(needle.length, 1)
    }
  }

  return matches
}

/** Keep a few lines of context above the active match when scrolling. */
export const SEARCH_MATCH_SCROLL_CONTEXT_LINES = 3

export function searchMatchScrollTop(
  rowIndex: number,
  lineHeight: number,
  contextLines = SEARCH_MATCH_SCROLL_CONTEXT_LINES,
): number {
  return Math.max(0, rowIndex * lineHeight - contextLines * lineHeight)
}

export function foldIdsToRevealLine(
  lineIndex: number,
  regions: FoldRegion[],
  collapsed: ReadonlySet<string>,
): string[] {
  return regions
    .filter((region) => !isRootFoldRegion(region, regions))
    .filter((region) => collapsed.has(region.id))
    .filter((region) => lineIndex > region.startLine && lineIndex <= region.endLine)
    .map((region) => region.id)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function searchMarkOpen(isActive: boolean, segment: 'solo' | 'start' | 'middle' | 'end'): string {
  const classes = [
    'json-search-mark',
    `json-search-mark-${segment}`,
    isActive ? 'json-search-mark-active' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<span data-search-highlight class="${classes}">`
}

const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&apos;': "'",
}

function decodeHtmlEntityAt(
  html: string,
  start: number,
): { decoded: string; length: number } | null {
  if (html[start] !== '&') return null

  const end = html.indexOf(';', start)
  if (end === -1) return null

  const entity = html.slice(start, end + 1)
  const named = HTML_ENTITIES[entity]
  if (named !== undefined) return { decoded: named, length: entity.length }

  if (entity.startsWith('&#x')) {
    const code = Number.parseInt(entity.slice(3, -1), 16)
    if (!Number.isNaN(code)) return { decoded: String.fromCodePoint(code), length: entity.length }
  }

  if (entity.startsWith('&#')) {
    const code = Number.parseInt(entity.slice(2, -1), 10)
    if (!Number.isNaN(code)) return { decoded: String.fromCodePoint(code), length: entity.length }
  }

  return null
}

function collectMatchHtmlSegments(
  html: string,
  plainText: string,
  match: JsonSearchMatch,
): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = []
  let textPos = 0
  let htmlPos = 0
  let segmentStart: number | null = null

  const inMatch = () => textPos >= match.start && textPos < match.end

  while (htmlPos < html.length && textPos < plainText.length) {
    if (html[htmlPos] === '<') {
      if (segmentStart !== null) {
        segments.push({ start: segmentStart, end: htmlPos })
        segmentStart = null
      }
      const close = html.indexOf('>', htmlPos)
      if (close === -1) break
      htmlPos = close + 1
      continue
    }

    if (html[htmlPos] === '&') {
      const entity = decodeHtmlEntityAt(html, htmlPos)
      if (!entity || plainText[textPos] !== entity.decoded) break
      if (inMatch() && segmentStart === null) segmentStart = htmlPos
      textPos += 1
      htmlPos += entity.length
    } else if (html[htmlPos] === plainText[textPos]) {
      if (inMatch() && segmentStart === null) segmentStart = htmlPos
      textPos += 1
      htmlPos += 1
    } else {
      break
    }

    if (!inMatch() && segmentStart !== null) {
      segments.push({ start: segmentStart, end: htmlPos })
      segmentStart = null
    }
  }

  if (segmentStart !== null) {
    segments.push({ start: segmentStart, end: htmlPos })
  }

  return segments
}

/** Insert search marks into already syntax-highlighted HTML without re-tokenizing the line. */
export function injectSearchMarksInHighlightedLine(
  html: string,
  plainText: string,
  lineIndex: number,
  matches: JsonSearchMatch[],
  activeGlobalIndex: number,
): string {
  const lineMatches = matches
    .filter((match) => match.lineIndex === lineIndex)
    .sort((left, right) => left.start - right.start)

  if (lineMatches.length === 0) return html

  type Insert = { pos: number; text: string }
  const inserts: Insert[] = []

  for (const match of lineMatches) {
    const segments = collectMatchHtmlSegments(html, plainText, match)
    const isActive = match.globalIndex === activeGlobalIndex
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      const role =
        segments.length === 1
          ? 'solo'
          : index === 0
            ? 'start'
            : index === segments.length - 1
              ? 'end'
              : 'middle'
      inserts.push({ pos: segment.start, text: searchMarkOpen(isActive, role) })
      inserts.push({ pos: segment.end, text: '</span>' })
    }
  }

  inserts.sort((left, right) => right.pos - left.pos)
  let result = html
  for (const insert of inserts) {
    result = result.slice(0, insert.pos) + insert.text + result.slice(insert.pos)
  }
  return result
}

export function highlightSearchInLine(
  text: string,
  lineIndex: number,
  matches: JsonSearchMatch[],
  activeGlobalIndex: number,
): string {
  return injectSearchMarksInHighlightedLine(
    escapeHtml(text),
    text,
    lineIndex,
    matches,
    activeGlobalIndex,
  )
}
