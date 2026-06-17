import { isAuthEntryValid, type StoredAuthEntry } from './auth-storage'

export function applyAuthToRequest(
  url: string,
  headers: Record<string, string>,
  entries: Iterable<StoredAuthEntry>,
  now = Date.now(),
): {
  url: string
  headers: Record<string, string>
  cookies: Array<{ name: string; value: string }>
} {
  const nextHeaders = { ...headers }
  const cookies: Array<{ name: string; value: string }> = []
  let nextUrl = url

  for (const entry of entries) {
    if (!isAuthEntryValid(entry, now)) continue

    if (entry.type === 'bearer') {
      nextHeaders.Authorization = `Bearer ${entry.token}`
    } else if (entry.type === 'basic' && entry.username !== undefined) {
      nextHeaders.Authorization = `Basic ${btoa(`${entry.username}:${entry.password ?? ''}`)}`
    } else if (entry.type === 'apiKey' && entry.apiKeyName) {
      if (entry.apiKeyIn === 'header') {
        nextHeaders[entry.apiKeyName] = entry.token
      } else if (entry.apiKeyIn === 'cookie') {
        cookies.push({ name: entry.apiKeyName, value: entry.token })
      } else if (entry.apiKeyIn === 'query') {
        const urlObj = new URL(nextUrl)
        urlObj.searchParams.set(entry.apiKeyName, entry.token)
        nextUrl = urlObj.toString()
      }
    }
  }

  return { url: nextUrl, headers: nextHeaders, cookies }
}
