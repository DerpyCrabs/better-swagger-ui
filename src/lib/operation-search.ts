import type { HttpMethod, OperationItem } from './operations'

const HTTP_METHODS = new Set<string>(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

/** Ignore short queries — they match too broadly on large specs. */
export const MIN_OPERATION_SEARCH_LENGTH = 3

/** Higher score = better match. Path/URL beats summary/description. */
const SCORE = {
  methodBonus: 50,
  pathExact: 1000,
  pathPrefix: 850,
  pathSegment: 750,
  pathIncludes: 650,
  summaryExact: 450,
  summaryPrefix: 400,
  summaryIncludes: 300,
  operationIdIncludes: 250,
  descriptionIncludes: 100,
  tagNameExact: 500,
  tagNamePrefix: 420,
  tagNameIncludes: 350,
  tagDescriptionIncludes: 80,
} as const

export interface FilteredTagGroup {
  tag: string
  description?: string
  operations: OperationItem[]
  /** Best match score in this group (tag or operation). */
  score: number
}

interface ParsedQuery {
  method: HttpMethod | null
  text: string
  tokens: string[]
}

interface IndexedOperation {
  item: OperationItem
  path: string
  summary: string
  description: string
  operationId: string
  segments: string[]
  compactPath: string
}

export interface OperationSearchIndex {
  groups: IndexedGroup[]
}

interface IndexedGroup {
  tag: string
  tagLower: string
  description?: string
  descriptionLower: string
  operations: IndexedOperation[]
}

export function isActiveOperationSearch(query: string): boolean {
  return query.trim().length >= MIN_OPERATION_SEARCH_LENGTH
}

function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return { method: null, text: '', tokens: [] }

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean)
  let method: HttpMethod | null = null
  let textTokens = tokens

  if (tokens.length > 0 && HTTP_METHODS.has(tokens[0]!)) {
    method = tokens[0] as HttpMethod
    textTokens = tokens.slice(1)
  }

  return {
    method,
    text: textTokens.join(' '),
    tokens: textTokens,
  }
}

function includesScore(
  haystack: string,
  needle: string,
  scores: { exact: number; prefix: number; includes: number },
): number {
  if (!needle) return 0
  if (haystack === needle) return scores.exact
  if (haystack.startsWith(needle)) return scores.prefix
  if (haystack.includes(needle)) return scores.includes
  return 0
}

function segmentMatchScore(segment: string, token: string): number {
  const bare = segment.replace(/[{}]/g, '')
  if (bare === token || segment === token || segment === `{${token}}`) {
    return SCORE.pathSegment
  }
  if (token.length >= 2 && (bare.includes(token) || segment.includes(token))) {
    return SCORE.pathIncludes - 50
  }
  return 0
}

function pathScore(op: IndexedOperation, text: string, tokens: string[]): number {
  if (!text) return 0

  let best = includesScore(op.path, text, {
    exact: SCORE.pathExact,
    prefix: SCORE.pathPrefix,
    includes: SCORE.pathIncludes,
  })

  if (tokens.length <= 1) {
    const token = tokens[0] ?? text
    for (const segment of op.segments) {
      best = Math.max(best, segmentMatchScore(segment, token))
    }
  } else if (tokens.every((token) => op.path.includes(token))) {
    let segmentHits = 0
    for (const token of tokens) {
      if (op.segments.some((segment) => segmentMatchScore(segment, token) >= SCORE.pathSegment)) {
        segmentHits += 1
      }
    }
    best = Math.max(
      best,
      segmentHits === tokens.length ? SCORE.pathSegment : SCORE.pathIncludes,
    )
  }

  const compactText = text.replace(/[/{}]/g, '')
  if (compactText.length >= 2 && op.compactPath.includes(compactText)) {
    best = Math.max(best, SCORE.pathIncludes - 25)
  }

  return best
}

function textFieldScore(op: IndexedOperation, parsed: ParsedQuery): number {
  let score = pathScore(op, parsed.text, parsed.tokens)

  score += includesScore(op.summary, parsed.text, {
    exact: SCORE.summaryExact,
    prefix: SCORE.summaryPrefix,
    includes: SCORE.summaryIncludes,
  })

  if (op.operationId && op.operationId.includes(parsed.text)) {
    score += SCORE.operationIdIncludes
  }

  if (op.description && op.description.includes(parsed.text)) {
    score += SCORE.descriptionIncludes
  }

  if (score === 0 && parsed.tokens.length > 1) {
    const fields = [op.path, op.summary, op.description, op.operationId]
    const allHit = parsed.tokens.every((token) => fields.some((field) => field.includes(token)))
    if (allHit) {
      const pathHits = parsed.tokens.filter((token) => op.path.includes(token)).length
      score +=
        pathHits * (SCORE.pathIncludes / parsed.tokens.length) +
        (parsed.tokens.length - pathHits) * (SCORE.descriptionIncludes / parsed.tokens.length)
    }
  }

  return score
}

function operationScore(op: IndexedOperation, parsed: ParsedQuery): number {
  if (parsed.method && op.item.method !== parsed.method) return 0

  if (!parsed.text) {
    return parsed.method ? SCORE.methodBonus : 0
  }

  const fields = textFieldScore(op, parsed)
  if (fields === 0) return 0

  return fields + (parsed.method ? SCORE.methodBonus : 0)
}

function tagScore(group: IndexedGroup, parsed: ParsedQuery): number {
  if (!parsed.text) return 0

  let score = includesScore(group.tagLower, parsed.text, {
    exact: SCORE.tagNameExact,
    prefix: SCORE.tagNamePrefix,
    includes: SCORE.tagNameIncludes,
  })

  if (group.descriptionLower && group.descriptionLower.includes(parsed.text)) {
    score = Math.max(score, SCORE.tagDescriptionIncludes)
  }

  return score
}

function indexOperation(item: OperationItem): IndexedOperation {
  const path = item.path.toLowerCase()
  // Cap description scan — long markdown bodies dominate search cost on large specs
  const rawDescription = item.operation.description ?? ''
  const description = (
    rawDescription.length > 500 ? rawDescription.slice(0, 500) : rawDescription
  ).toLowerCase()

  return {
    item,
    path,
    summary: (item.operation.summary ?? '').toLowerCase(),
    description,
    operationId: (item.operation.operationId ?? '').toLowerCase(),
    segments: path.split('/').filter(Boolean),
    compactPath: path.replace(/[/{}]/g, ''),
  }
}

/** Precompute lowercase search fields once per loaded spec. */
export function buildOperationSearchIndex(
  grouped: Map<string, OperationItem[]>,
  descriptions: Map<string, string>,
): OperationSearchIndex {
  const groups: IndexedGroup[] = []
  for (const [tag, operations] of grouped) {
    const description = descriptions.get(tag)
    groups.push({
      tag,
      tagLower: tag.toLowerCase(),
      description,
      descriptionLower: (description ?? '').toLowerCase(),
      operations: operations.map(indexOperation),
    })
  }
  return { groups }
}

function unfilteredFromIndex(index: OperationSearchIndex): FilteredTagGroup[] {
  return index.groups.map((group) => ({
    tag: group.tag,
    description: group.description,
    operations: group.operations.map((op) => op.item),
    score: 0,
  }))
}

/**
 * Filter and rank tag groups / operations for the operations list search.
 *
 * Matching rules:
 * - Queries shorter than {@link MIN_OPERATION_SEARCH_LENGTH} are ignored
 * - Optional leading HTTP method ("get /users", "POST pets")
 * - Path/URL scores higher than summary; summary higher than description
 * - Tag name/description match includes the whole group
 * - Otherwise only matching operations are kept, sorted by score
 */
export function filterOperationGroups(
  index: OperationSearchIndex,
  query: string,
): FilteredTagGroup[] {
  if (!isActiveOperationSearch(query)) {
    return unfilteredFromIndex(index)
  }

  const parsed = parseQuery(query)
  if (!parsed.method && !parsed.text) {
    return unfilteredFromIndex(index)
  }

  const results: FilteredTagGroup[] = []

  for (const group of index.groups) {
    const groupScore = tagScore(group, parsed)

    const scoredOps: { item: OperationItem; score: number }[] = []
    for (const op of group.operations) {
      const score = operationScore(op, parsed)
      if (score > 0) scoredOps.push({ item: op.item, score })
    }
    scoredOps.sort((a, b) => b.score - a.score || a.item.path.localeCompare(b.item.path))

    if (groupScore > 0) {
      const ops = parsed.method
        ? group.operations.filter((op) => op.item.method === parsed.method).map((op) => op.item)
        : group.operations.map((op) => op.item)
      if (ops.length === 0) continue

      const scoreById = new Map(scoredOps.map((entry) => [entry.item.id, entry.score]))
      const rankedOps = [...ops].sort(
        (a, b) =>
          (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) ||
          a.path.localeCompare(b.path) ||
          a.method.localeCompare(b.method),
      )

      results.push({
        tag: group.tag,
        description: group.description,
        operations: rankedOps,
        score: Math.max(groupScore, scoredOps[0]?.score ?? 0),
      })
      continue
    }

    if (scoredOps.length === 0) continue

    results.push({
      tag: group.tag,
      description: group.description,
      operations: scoredOps.map((entry) => entry.item),
      score: scoredOps[0]!.score,
    })
  }

  return results.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
}
