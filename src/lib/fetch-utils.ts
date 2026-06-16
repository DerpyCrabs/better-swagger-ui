import { proxyFetch } from './proxy-fetch'

function wrapFetchError(url: string, err: unknown): Error {
  if (err instanceof TypeError) {
    return new Error(
      `Could not fetch ${url}. The server may block cross-origin requests (CORS). Try the direct spec URL instead.`,
    )
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function fetchResponse(url: string): Promise<Response> {
  try {
    return await proxyFetch(url)
  } catch (err) {
    throw wrapFetchError(url, err)
  }
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetchResponse(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.text()
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const response = await fetchResponse(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.json() as Promise<T>
}
