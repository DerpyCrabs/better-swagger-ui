/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readRoute, subscribeRoute, writeRoute } from './router'

describe('router', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
  })

  it('reads url, op, and definition from query params', () => {
    history.replaceState(null, '', '/?url=https%3A%2F%2Fx.com&op=get%3A%2Fpets&definition=API+A')
    expect(readRoute()).toEqual({
      url: 'https://x.com',
      op: 'get:/pets',
      definition: 'API A',
    })
  })

  it('writes route params', () => {
    writeRoute({
      url: 'https://example.com',
      op: 'post:/items',
      definition: 'default',
    })
    expect(window.location.search).toContain('url=https%3A%2F%2Fexample.com')
    expect(window.location.search).toContain('op=post%3A%2Fitems')
    expect(window.location.search).toContain('definition=default')
  })

  it('clears query when route is empty', () => {
    history.replaceState(null, '', '/?url=https%3A%2F%2Fx.com')
    writeRoute({ url: null, op: null, definition: null })
    expect(window.location.search).toBe('')
  })

  it('notifies on popstate', () => {
    let seen = readRoute()
    const unsubscribe = subscribeRoute((route) => {
      seen = route
    })

    history.pushState(null, '', '/?url=https%3A%2F%2Fchanged.com')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(seen.url).toBe('https://changed.com')
    unsubscribe()
  })
})
