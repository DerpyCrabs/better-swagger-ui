export function stickyHeaderHeight(): number {
  return document.querySelector('header')?.getBoundingClientRect().height ?? 0
}

export function operationHeaderElement(opId: string): HTMLElement | null {
  const el = document.querySelector(`[data-op-id="${CSS.escape(opId)}"]`)
  if (!el) return null
  return (el.querySelector('[data-op-header]') as HTMLElement | null) ?? (el as HTMLElement)
}

export function scrollToOperationHeader(opId: string) {
  const headerEl = operationHeaderElement(opId)
  if (!headerEl) return

  const topInset = stickyHeaderHeight()
  const rect = headerEl.getBoundingClientRect()
  const targetTop = window.scrollY + rect.top - topInset

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'instant',
  })
}

/** Keep an operation header at the same viewport Y after expand/collapse layout shifts. */
export function restoreOperationHeaderViewportPosition(opId: string, anchorTop: number) {
  const headerEl = operationHeaderElement(opId)
  if (!headerEl) return true

  const top = headerEl.getBoundingClientRect().top
  if (Math.abs(top - anchorTop) <= 1) return true

  const headerDocY = window.scrollY + top
  const targetScrollY = Math.max(0, headerDocY - anchorTop)

  window.scrollTo({
    top: targetScrollY,
    behavior: 'instant',
  })

  const nextTop = headerEl.getBoundingClientRect().top
  return (
    Math.abs(nextTop - anchorTop) <= 2 ||
    (targetScrollY === 0 && nextTop >= stickyHeaderHeight())
  )
}

/** Restore after expand/collapse layout continues to shift while child content mounts. */
export function stabilizeOperationHeaderViewportPosition(opId: string, anchorTop: number) {
  let done = false

  const restore = () => {
    if (done) return
    if (restoreOperationHeaderViewportPosition(opId, anchorTop)) done = true
  }

  restore()
  requestAnimationFrame(() => {
    restore()
    requestAnimationFrame(restore)
  })

  const opEl = document.querySelector(`[data-op-id="${CSS.escape(opId)}"]`)
  if (!opEl) return

  const observer = new ResizeObserver(() => restore())
  observer.observe(opEl)
  window.setTimeout(() => {
    done = true
    observer.disconnect()
  }, 500)
}

let pendingViewportRestore: { opId: string; anchorTop: number } | null = null

export function scheduleOperationHeaderViewportRestore(opId: string, anchorTop: number) {
  pendingViewportRestore = { opId, anchorTop }
}

export function runPendingOperationHeaderViewportRestore() {
  const pending = pendingViewportRestore
  if (!pending) return
  pendingViewportRestore = null
  stabilizeOperationHeaderViewportPosition(pending.opId, pending.anchorTop)
}
