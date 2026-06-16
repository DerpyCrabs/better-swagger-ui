export interface AppRoute {
  url: string | null
  op: string | null
  definition: string | null
}

export function readRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search)
  return {
    url: params.get('url'),
    op: params.get('op'),
    definition: params.get('definition'),
  }
}

export function writeRoute(route: AppRoute) {
  const params = new URLSearchParams()

  if (route.url) {
    params.set('url', route.url)
  }

  if (route.definition) {
    params.set('definition', route.definition)
  }

  if (route.op) {
    params.set('op', route.op)
  }

  const query = params.toString()
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname

  if (next !== `${window.location.pathname}${window.location.search}`) {
    history.replaceState(null, '', next)
  }
}

export function subscribeRoute(onChange: (route: AppRoute) => void) {
  const handler = () => onChange(readRoute())
  window.addEventListener('popstate', handler)
  return () => window.removeEventListener('popstate', handler)
}
