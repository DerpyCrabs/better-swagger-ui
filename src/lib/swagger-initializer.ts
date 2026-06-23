import { fetchText } from './fetch-utils'
import { queryClient } from './query-client'

export interface SwaggerInitializerScript {
  url: string
  text: string
}

export function swaggerUiBasePath(pathname: string): string {
  const match = pathname.match(/^(.*?)\/swagger-ui\/?/i)
  return match?.[1] ?? ''
}

export function swaggerInitializerUrls(sourceUrl: string): string[] {
  const pageUrl = new URL(sourceUrl.trim())
  const basePath = swaggerUiBasePath(pageUrl.pathname)
  return [
    `${pageUrl.origin}${basePath}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}/swagger-ui/swagger-initializer.js`,
    `${pageUrl.origin}${basePath}/swagger-initializer.js`,
  ]
}

export const swaggerInitializerQueryKeys = {
  all: ['swagger-initializer'] as const,
  script: (url: string) => [...swaggerInitializerQueryKeys.all, url] as const,
}

const INITIALIZER_STALE_TIME_MS = 5 * 60 * 1000

async function fetchInitializerScript(url: string): Promise<string | null> {
  try {
    const text = await fetchText(url)
    return text ?? null
  } catch {
    return null
  }
}

export async function loadSwaggerInitializer(
  sourceUrl: string,
): Promise<SwaggerInitializerScript | null> {
  for (const url of swaggerInitializerUrls(sourceUrl)) {
    const text = await queryClient.fetchQuery({
      queryKey: swaggerInitializerQueryKeys.script(url),
      queryFn: () => fetchInitializerScript(url),
      staleTime: INITIALIZER_STALE_TIME_MS,
    })
    if (text) return { url, text }
  }

  return null
}
