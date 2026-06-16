export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
  return fetch(proxyUrl, init)
}

export async function proxyFetchText(url: string): Promise<string> {
  const response = await proxyFetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.text()
}

export async function proxyFetchJson<T = unknown>(url: string): Promise<T> {
  const response = await proxyFetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.json() as Promise<T>
}
