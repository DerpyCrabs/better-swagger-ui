const PROXY_PATH = '/__proxy'

export function isDevProxyEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE === 'proxy'
}

export function shouldProxyUrl(url: string): boolean {
  if (!isDevProxyEnabled()) return false
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin !== window.location.origin
  } catch {
    return false
  }
}

export function toProxyUrl(url: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(url)}`
}

export function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!isDevProxyEnabled()) {
    return fetch(url, init)
  }

  const requestUrl = shouldProxyUrl(url) ? toProxyUrl(url) : url
  return fetch(requestUrl, init)
}
