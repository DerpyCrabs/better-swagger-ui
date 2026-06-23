import { describe, expect, it } from 'vitest'
import { findFoldRegions, splitJsonLines } from './json-folding'
import {
  findJsonSearchMatches,
  foldIdsToRevealLine,
  highlightSearchInLine,
  injectSearchMarksInHighlightedLine,
  searchMatchScrollTop,
} from './json-search'

describe('json-search', () => {
  it('finds matches across lines case-insensitively by default', () => {
    const lines = splitJsonLines('{\n  "Name": "Alice",\n  "name": "bob"\n}')
    const matches = findJsonSearchMatches(lines, 'name')

    expect(matches).toHaveLength(2)
    expect(matches.map((match) => [match.lineIndex, match.start])).toEqual([
      [1, 3],
      [2, 3],
    ])
  })

  it('returns no matches for blank queries', () => {
    const lines = splitJsonLines('{"a": 1}')
    expect(findJsonSearchMatches(lines, '')).toEqual([])
    expect(findJsonSearchMatches(lines, '   ')).toEqual([])
  })

  it('scrolls matches with context lines above', () => {
    expect(searchMatchScrollTop(0, 20)).toBe(0)
    expect(searchMatchScrollTop(5, 20)).toBe(40)
    expect(searchMatchScrollTop(10, 20, 2)).toBe(160)
  })

  it('finds folds that hide a line', () => {
    const lines = splitJsonLines('{\n  "nested": {\n    "secret": true\n  }\n}')
    const regions = findFoldRegions(lines)
    const nested = regions.find((region) => region.startLine === 1)
    expect(nested).toBeDefined()

    const ids = foldIdsToRevealLine(2, regions, new Set([nested!.id]))
    expect(ids).toEqual([nested!.id])
  })

  it('wraps active and inactive matches in mark tags', () => {
    const matches = findJsonSearchMatches(['alpha beta alpha'], 'alpha')
    const html = highlightSearchInLine('alpha beta alpha', 0, matches, 1)

    expect(html).toContain('data-search-highlight')
    expect(html.match(/data-search-highlight/g)?.length).toBe(2)
    expect(html).toContain('json-search-mark-active')
    expect(html).toContain('json-search-mark')
  })

  it('injects marks into highlighted html without splitting tokens', () => {
    const plain = '      "legalEntityId": null,'
    const html =
      '      <span class="hljs-attr">&quot;legalEntityId&quot;</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">null</span></span><span class="hljs-punctuation">,</span>'
    const matches = findJsonSearchMatches([plain], 'legalEntityId')
    const result = injectSearchMarksInHighlightedLine(html, plain, 0, matches, 0)

    expect(result).toContain('data-search-highlight class="json-search-mark json-search-mark-solo json-search-mark-active">legalEntityId</span>')
    expect(result).toContain('<span class="hljs-literal"><span class="hljs-keyword">null</span></span>')
  })

  it('highlights matches that include quotes and punctuation after hljs entities', () => {
    const plain = '      "legalEntityId": null,'
    const html =
      '      <span class="hljs-attr">&quot;legalEntityId&quot;</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">null</span></span><span class="hljs-punctuation">,</span>'
    const matches = findJsonSearchMatches([plain], 'legalEntityId": null')
    const result = injectSearchMarksInHighlightedLine(html, plain, 0, matches, 0)

    expect(matches).toHaveLength(1)
    expect(result.match(/data-search-highlight/g)?.length).toBe(4)
    expect(result).toContain('data-search-highlight class="json-search-mark json-search-mark-start json-search-mark-active">legalEntityId&quot;</span>')
    expect(result).toContain('<span class="hljs-punctuation"><span data-search-highlight class="json-search-mark json-search-mark-middle json-search-mark-active">:</span></span>')
    expect(result).toContain('<span class="hljs-keyword"><span data-search-highlight class="json-search-mark json-search-mark-end json-search-mark-active">null</span></span>')
  })
})
