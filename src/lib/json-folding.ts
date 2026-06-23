export interface FoldRegion {
  id: string
  startLine: number
  endLine: number
  openChar: '{' | '['
  closeChar: '}' | ']'
}

export interface VisibleJsonLine {
  lineIndex: number
  sourceLine: number
  content: string
  foldId?: string
  collapsed?: boolean
}

export function splitJsonLines(text: string): string[] {
  if (text.length === 0) return ['']
  return text.replace(/\r\n/g, '\n').split('\n')
}

export function findFoldRegions(lines: string[]): FoldRegion[] {
  const regions: FoldRegion[] = []
  const stack: { startLine: number; openChar: '{' | '[' }[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let inString = false
    let escaped = false
    const line = lines[lineIndex] ?? ''

    for (let i = 0; i < line.length; i++) {
      const char = line[i]!

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === '"') inString = false
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{' || char === '[') {
        stack.push({ startLine: lineIndex, openChar: char })
        continue
      }

      if (char === '}' || char === ']') {
        const open = stack.pop()
        if (!open) continue
        const closeChar = char as '}' | ']'
        if (open.openChar === '{' && closeChar !== '}') continue
        if (open.openChar === '[' && closeChar !== ']') continue
        if (lineIndex <= open.startLine) continue

        regions.push({
          id: `fold-${open.startLine}`,
          startLine: open.startLine,
          endLine: lineIndex,
          openChar: open.openChar,
          closeChar,
        })
      }
    }
  }

  return regions
}

export function rootFoldRegion(regions: FoldRegion[]): FoldRegion | undefined {
  if (regions.length === 0) return undefined
  return regions.reduce((root, region) => (region.startLine < root.startLine ? region : root))
}

export function isRootFoldRegion(region: FoldRegion, regions: FoldRegion[]): boolean {
  return rootFoldRegion(regions)?.id === region.id
}

export function collapsibleFoldRegions(regions: FoldRegion[]): FoldRegion[] {
  return regions.filter((region) => !isRootFoldRegion(region, regions))
}

/** Document offsets for the content hidden when a fold region is collapsed. */
export function foldDocRangeFromRegion(
  lines: string[],
  region: FoldRegion,
): { from: number; to: number } | null {
  const openLine = lines[region.startLine] ?? ''
  const openIndex = openLine.lastIndexOf(region.openChar)
  if (openIndex === -1) return null

  let from = 0
  for (let lineIndex = 0; lineIndex < region.startLine; lineIndex++) {
    from += (lines[lineIndex] ?? '').length + 1
  }
  from += openIndex + 1

  const closeLine = lines[region.endLine] ?? ''
  const closeIndex = closeLine.lastIndexOf(region.closeChar)
  if (closeIndex === -1) return null

  let to = 0
  for (let lineIndex = 0; lineIndex < region.endLine; lineIndex++) {
    to += (lines[lineIndex] ?? '').length + 1
  }
  to += closeIndex

  return to > from ? { from, to } : null
}

export function collapsibleFoldDocRanges(
  text: string,
): { region: FoldRegion; from: number; to: number }[] {
  const lines = splitJsonLines(text)
  const regions = collapsibleFoldRegions(findFoldRegions(lines))
  const ranges: { region: FoldRegion; from: number; to: number }[] = []

  for (const region of regions) {
    const range = foldDocRangeFromRegion(lines, region)
    if (range) ranges.push({ region, ...range })
  }

  return ranges
}

export function foldDocRangeOnLine(
  text: string,
  lineIndex: number,
): { from: number; to: number } | null {
  const lines = splitJsonLines(text)
  const region = collapsibleFoldRegions(findFoldRegions(lines)).find(
    (candidate) => candidate.startLine === lineIndex,
  )
  return region ? foldDocRangeFromRegion(lines, region) : null
}

export function regionsInsideParent(
  parent: FoldRegion,
  regions: FoldRegion[],
): FoldRegion[] {
  return regions.filter(
    (region) =>
      region.startLine > parent.startLine && region.endLine < parent.endLine,
  )
}

export function directChildFoldRegions(
  parent: FoldRegion,
  regions: FoldRegion[],
): FoldRegion[] {
  const inside = regionsInsideParent(parent, regions)
  return inside.filter(
    (child) =>
      !inside.some(
        (other) =>
          other.id !== child.id &&
          other.startLine < child.startLine &&
          other.endLine > child.endLine,
      ),
  )
}

/** When expanding an array, also expand a sole collapsed object child. */
export function foldIdsToExpandWithParent(
  parent: FoldRegion,
  regions: FoldRegion[],
  collapsed: ReadonlySet<string>,
): string[] {
  const ids = [parent.id]
  if (parent.openChar !== '[') return ids

  const children = directChildFoldRegions(parent, regions)
  if (children.length !== 1) return ids

  const child = children[0]!
  if (child.openChar === '{' && collapsed.has(child.id)) {
    ids.push(child.id)
  }

  return ids
}

export function collapsedLineContent(lines: string[], region: FoldRegion): string {
  const line = lines[region.startLine] ?? ''
  const openIndex = line.lastIndexOf(region.openChar)
  if (openIndex === -1) {
    return `${line.trimEnd()} ... ${region.closeChar}`
  }

  const prefix = line.slice(0, openIndex + 1)
  const suffix = line.slice(openIndex + 1).trim()

  if (suffix.length === 0) {
    if (line.trim() === region.openChar) {
      return `${line.trimEnd()} ... ${region.closeChar}`
    }
    return `${prefix} ... ${region.closeChar}`
  }

  return `${prefix} ... ${region.closeChar}`
}

export function visibleJsonLines(
  lines: string[],
  regions: FoldRegion[],
  collapsed: ReadonlySet<string>,
): VisibleJsonLine[] {
  const hiddenLines = new Set<number>()

  for (const region of regions) {
    if (!collapsed.has(region.id) || isRootFoldRegion(region, regions)) continue
    for (let lineIndex = region.startLine + 1; lineIndex <= region.endLine; lineIndex++) {
      hiddenLines.add(lineIndex)
    }
  }

  const regionByStart = new Map(regions.map((region) => [region.startLine, region]))
  const visible: VisibleJsonLine[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (hiddenLines.has(lineIndex)) continue

    const region = regionByStart.get(lineIndex)
    const collapsible = region && !isRootFoldRegion(region, regions)
    const isCollapsed = Boolean(collapsible && collapsed.has(region.id))

    visible.push({
      lineIndex,
      sourceLine: lineIndex + 1,
      content: isCollapsed && region ? collapsedLineContent(lines, region) : (lines[lineIndex] ?? ''),
      foldId: collapsible ? region.id : undefined,
      collapsed: isCollapsed,
    })
  }

  return visible
}

export function visibleTextFromLines(
  lines: string[],
  regions: FoldRegion[],
  collapsed: ReadonlySet<string>,
  collapsible = true,
): string {
  const visible = collapsible
    ? visibleJsonLines(lines, regions, collapsed)
    : lines.map((content, lineIndex) => ({
        lineIndex,
        sourceLine: lineIndex + 1,
        content,
      }))
  return visible.map((row) => row.content).join('\n')
}

export function applyVisibleTextEdit(
  fullLines: string[],
  visible: VisibleJsonLine[],
  newContents: string[],
): string[] {
  if (visible.length === 0) return newContents

  if (newContents.length === visible.length) {
    const result = [...fullLines]
    for (let index = 0; index < visible.length; index++) {
      const row = visible[index]!
      if (row.collapsed) continue
      result[row.lineIndex] = newContents[index]!
    }
    return result
  }

  const result = [...fullLines]
  const minLine = visible[0]!.lineIndex
  const maxLine = visible[visible.length - 1]!.lineIndex
  const visibleSourceLines = new Set(visible.map((row) => row.lineIndex))
  const editedLines: string[] = []
  let newIndex = 0

  for (const row of visible) {
    if (row.collapsed) {
      if (newIndex < newContents.length && newContents[newIndex] === row.content) {
        newIndex++
      }
      continue
    }
    if (newIndex < newContents.length) {
      editedLines.push(newContents[newIndex]!)
      newIndex++
    }
  }

  while (newIndex < newContents.length) {
    editedLines.push(newContents[newIndex]!)
    newIndex++
  }

  const nextMiddle: string[] = []
  let editedIndex = 0
  for (let lineIndex = minLine; lineIndex <= maxLine; lineIndex++) {
    if (!visibleSourceLines.has(lineIndex)) {
      nextMiddle.push(result[lineIndex] ?? '')
      continue
    }
    if (editedIndex < editedLines.length) {
      nextMiddle.push(editedLines[editedIndex]!)
      editedIndex++
      continue
    }
    nextMiddle.push(result[lineIndex] ?? '')
  }

  while (editedIndex < editedLines.length) {
    nextMiddle.push(editedLines[editedIndex]!)
    editedIndex++
  }

  return [...result.slice(0, minLine), ...nextMiddle, ...result.slice(maxLine + 1)]
}

export function formatJsonText(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

export function jsonTextFromValue(data: unknown): { text: string; language: 'json' | 'plaintext' } {
  if (typeof data === 'string') {
    try {
      return {
        text: JSON.stringify(JSON.parse(data), null, 2),
        language: 'json',
      }
    } catch {
      return { text: data, language: 'plaintext' }
    }
  }

  try {
    return {
      text: JSON.stringify(data, null, 2),
      language: 'json',
    }
  } catch {
    return { text: String(data), language: 'plaintext' }
  }
}
