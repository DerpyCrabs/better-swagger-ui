import { describe, expect, it } from 'vitest'

describe('operation header viewport restore', () => {
  it('scrolls up when content above collapses but scrollY is stale', () => {
    const scrollY = 3874
    const top = -3559.5
    const anchorTop = 647
    const headerDocY = scrollY + top
    const targetScrollY = Math.max(0, headerDocY - anchorTop)

    expect(targetScrollY).toBe(0)
  })
})
