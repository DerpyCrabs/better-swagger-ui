import { describe, expect, it } from 'vitest'
import {
  applyVisibleTextEdit,
  collapsedLineContent,
  collapsibleFoldDocRanges,
  directChildFoldRegions,
  findFoldRegions,
  foldDocRangeFromRegion,
  foldDocRangeOnLine,
  foldIdsToExpandWithParent,
  isRootFoldRegion,
  jsonTextFromValue,
  rootFoldRegion,
  splitJsonLines,
  visibleJsonLines,
  visibleTextFromLines,
} from './json-folding'

describe('json-folding', () => {
  it('finds multi-line object and array regions', () => {
    const lines = splitJsonLines(
      JSON.stringify(
        {
          code: '',
          nameInternal: { test: 'kek' },
          tags: ['a', 'b'],
        },
        null,
        2,
      ),
    )

    const regions = findFoldRegions(lines)
    expect(regions.length).toBeGreaterThanOrEqual(3)
    expect(regions.some((region) => region.openChar === '{')).toBe(true)
    expect(regions.some((region) => region.openChar === '[')).toBe(true)
  })

  it('hides collapsed lines and renders preview text', () => {
    const lines = splitJsonLines(
      '{\n  "nameInternal": {\n    "test": "kek"\n  }\n}',
    )
    const regions = findFoldRegions(lines)
    const nested = regions.find((region) => region.startLine === 1)
    expect(nested).toBeDefined()

    const visible = visibleJsonLines(lines, regions, new Set([nested!.id]))
    expect(visible.some((row) => row.content.includes('"nameInternal": { ... }'))).toBe(true)
    expect(visible.some((row) => row.content.includes('"test"'))).toBe(false)
  })

  it('builds collapsed previews for root and inline blocks', () => {
    const objectLines = splitJsonLines('{\n  "a": 1\n}')
    const objectRegion = findFoldRegions(objectLines)[0]!
    expect(collapsedLineContent(objectLines, objectRegion)).toBe('{ ... }')

    const propertyLines = splitJsonLines('  "productType": {\n    "id": 1\n  }')
    const propertyRegion = findFoldRegions(propertyLines)[0]!
    expect(collapsedLineContent(propertyLines, propertyRegion)).toBe('  "productType": { ... }')

    const arrayLines = splitJsonLines('  "items": [\n    1\n  ]')
    const arrayRegion = findFoldRegions(arrayLines)[0]!
    expect(collapsedLineContent(arrayLines, arrayRegion)).toBe('  "items": [ ... ]')
  })

  it('never collapses the root fold region', () => {
    const lines = splitJsonLines('{\n  "a": {\n    "b": 1\n  }\n}')
    const regions = findFoldRegions(lines)
    const root = rootFoldRegion(regions)

    expect(root?.startLine).toBe(0)
    expect(isRootFoldRegion(root!, regions)).toBe(true)

    const visible = visibleJsonLines(lines, regions, new Set(regions.map((region) => region.id)))
    expect(visible.some((row) => row.content.trim() === '{')).toBe(true)
    expect(visible.some((row) => row.content.includes('"a"'))).toBe(true)
    expect(visible.every((row) => row.foldId !== root?.id)).toBe(true)
  })

  it('maps fold regions to document ranges for single-child objects', () => {
    const text = JSON.stringify({ name: 'Widget', meta: { count: 1 } }, null, 2)
    const lines = splitJsonLines(text)
    const metaRegion = findFoldRegions(lines).find((region) => region.startLine === 2)
    expect(metaRegion).toBeDefined()

    const range = foldDocRangeFromRegion(lines, metaRegion!)
    expect(range).toBeTruthy()
    expect(text.slice(range!.from, range!.to)).toContain('"count"')

    const onMetaLine = foldDocRangeOnLine(text, metaRegion!.startLine)
    expect(onMetaLine).toEqual(range)
    expect(collapsibleFoldDocRanges(text).some((entry) => entry.region.id === metaRegion!.id)).toBe(
      true,
    )
  })

  it('maps widget request body folds on the meta line', () => {
    const text = JSON.stringify({ name: 'Widget', tags: ['a', 'b'], meta: { count: 1 } }, null, 2)
    const metaLine = splitJsonLines(text).findIndex((line) => line.includes('"meta"'))
    expect(metaLine).toBeGreaterThan(0)
    expect(foldDocRangeOnLine(text, metaLine)).toBeTruthy()
  })

  it('expands a sole collapsed object when expanding its parent array', () => {
    const lines = splitJsonLines(
      '[\n  {\n    "a": 1\n  }\n]',
    )
    const regions = findFoldRegions(lines)
    const arrayRegion = regions.find((region) => region.openChar === '[')!
    const objectRegion = regions.find((region) => region.openChar === '{' && region.startLine === 1)!

    expect(directChildFoldRegions(arrayRegion, regions)).toEqual([objectRegion])

    const collapsed = new Set([arrayRegion.id, objectRegion.id])
    expect(foldIdsToExpandWithParent(arrayRegion, regions, collapsed)).toEqual([
      arrayRegion.id,
      objectRegion.id,
    ])
    expect(foldIdsToExpandWithParent(objectRegion, regions, collapsed)).toEqual([
      objectRegion.id,
    ])
  })

  it('does not auto-expand when an array has multiple children', () => {
    const lines = splitJsonLines(
      '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]',
    )
    const regions = findFoldRegions(lines)
    const arrayRegion = regions.find((region) => region.openChar === '[')!
    const collapsed = new Set(regions.map((region) => region.id))

    expect(foldIdsToExpandWithParent(arrayRegion, regions, collapsed)).toEqual([
      arrayRegion.id,
    ])
  })

  it('builds visible text from folded lines', () => {
    const lines = splitJsonLines('{\n  "meta": {\n    "count": 1\n  }\n}')
    const regions = findFoldRegions(lines)
    const meta = regions.find((region) => region.startLine === 1)!

    const collapsed = new Set([meta.id])
    expect(visibleTextFromLines(lines, regions, collapsed)).toContain('"meta": { ... }')
    expect(visibleTextFromLines(lines, regions, collapsed)).not.toContain('"count"')
  })

  it('merges textarea edits back into folded line content', () => {
    const lines = splitJsonLines('{\n  "name": "Widget",\n  "meta": {\n    "count": 1\n  }\n}')
    const regions = findFoldRegions(lines)
    const visible = visibleJsonLines(lines, regions, new Set())

    const edited = applyVisibleTextEdit(lines, visible, [
      '{',
      '  "name": "Gadget",',
      '  "meta": {',
      '    "count": 1',
      '  }',
      '}',
    ])

    expect(edited.join('\n')).toContain('"name": "Gadget"')
    expect(edited.join('\n')).toContain('"count": 1')
  })

  it('preserves hidden lines when visible textarea line count changes', () => {
    const lines = splitJsonLines('{\n  "meta": {\n    "count": 1\n  }\n}')
    const regions = findFoldRegions(lines)
    const meta = regions.find((region) => region.startLine === 1)!
    const visible = visibleJsonLines(lines, regions, new Set([meta.id]))

    const edited = applyVisibleTextEdit(lines, visible, [
      '{',
      '  "meta": { ... }',
      '  "added": true,',
      '}',
    ])

    expect(edited.join('\n')).toContain('"count": 1')
    expect(edited.join('\n')).toContain('"added": true')
  })

  it('normalizes values into pretty json text', () => {
    expect(jsonTextFromValue({ a: 1 })).toEqual({
      text: '{\n  "a": 1\n}',
      language: 'json',
    })
    expect(jsonTextFromValue('plain')).toEqual({
      text: 'plain',
      language: 'plaintext',
    })
  })
})
