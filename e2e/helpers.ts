import { expect, type Locator, type Page, type Route } from '@playwright/test'

export const FIXTURE_PATH = '/fixtures'

export function specPath(path: string) {
  return `${FIXTURE_PATH}${path.startsWith('/') ? path : `/${path}`}`
}

export async function absoluteFixtureUrl(page: Page, path: string) {
  const origin = new URL(page.url()).origin
  return `${origin}${specPath(path)}`
}

export async function loadSpec(page: Page, url: string) {
  await page.goto('/')
  await page.getByTestId('url-input').waitFor({ timeout: 10_000 })

  const target = url.startsWith('http')
    ? url
    : url.startsWith('/')
      ? `${new URL(page.url()).origin}${url}`
      : await absoluteFixtureUrl(page, url)

  await page.getByTestId('url-input').fill(target)
  await page.getByTestId('load-form').evaluate((form) => {
    ;(form as HTMLFormElement).requestSubmit()
  })
  await page.getByTestId('api-title').waitFor({ timeout: 15_000 })
}

export function operationLocator(page: Page, opId: string) {
  return page.getByTestId(`operation-${opId}`)
}

export async function expandOperation(page: Page, opId: string) {
  let op = operationLocator(page, opId)
  if (!(await op.isVisible().catch(() => false))) {
    const sections = page.locator('[data-testid^="tag-section-"]')
    const count = await sections.count()
    for (let i = 0; i < count; i++) {
      const section = sections.nth(i)
      if (await op.isVisible().catch(() => false)) break
      await section.getByRole('button').first().click()
    }
  }

  op = operationLocator(page, opId)
  await op.getByRole('button').first().click()
  await op.getByText('Parameters', { exact: true }).waitFor()
}

export async function openTryItOut(page: Page, opId: string) {
  const op = operationLocator(page, opId)
  await op.getByTestId('try-it-out').click()
}

export async function executeTryItOut(page: Page, opId: string) {
  const op = operationLocator(page, opId)
  await op.getByTestId('execute').click()
}

export async function mockApi(
  page: Page,
  handler: (route: Route) => Promise<void> | void,
) {
  await page.unroute('**/fixtures/mock-api/**')
  await page.route('**/fixtures/mock-api/**', handler)
}

export function specUrl(path: string) {
  return specPath(path.startsWith('/openapi/') ? path : `/openapi/${path}`)
}

export async function clearAuthStorage(page: Page) {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('better-swagger-auth:')) {
        localStorage.removeItem(key)
      }
    }
  })
}

export async function clearThemeStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('better-swagger-theme')
  })
}

/** Builds a multi-megabyte JSON payload that falls back to the flat virtualized viewer. */
export function buildLargeJsonBody(lineCount = 2500, padLength = 1300): string {
  const lines = Array.from({ length: lineCount }, (_, index) =>
    `line-${String(index).padStart(6, '0')}-${'x'.repeat(padLength)}`,
  )
  return JSON.stringify({ lines })
}

export function largeJsonLineCount(body: string): number {
  return JSON.stringify(JSON.parse(body), null, 2).split('\n').length
}

export function jsonEditorContent(editor: Locator) {
  return editor.getByTestId('json-textarea').or(editor.getByTestId('json-content'))
}

export function jsonEditorInnerText(editor: Locator) {
  return editor.evaluate((root) => {
    const textarea = root.querySelector('[data-testid="json-textarea"]') as HTMLTextAreaElement | null
    if (textarea) return textarea.value
    const content = root.querySelector('[data-testid="json-content"]') as HTMLElement | null
    return content?.innerText ?? root.textContent ?? ''
  })
}

export async function clickJsonFoldOnLineContaining(editor: Locator, text: string) {
  const line = editor.locator('[data-testid="json-line"]').filter({ hasText: text }).first()
  await line.waitFor()
  const lineNumber = await line.getAttribute('data-line-number')
  if (!lineNumber) throw new Error(`No line number for ${text}`)

  await editor.getByTestId(`json-fold-open-fold-${Number(lineNumber) - 1}`).click()
}

export async function clickJsonFoldCloseOnLineContaining(editor: Locator, text: string) {
  const line = editor.locator('[data-testid="json-line"]').filter({ hasText: text }).first()
  await line.waitFor()
  const lineNumber = await line.getAttribute('data-line-number')
  if (!lineNumber) throw new Error(`No line number for ${text}`)

  await editor.getByTestId(`json-fold-fold-${Number(lineNumber) - 1}`).click()
}

export function requestBodyJsonEditor(page: Page, opId: string) {
  return operationLocator(page, opId).getByTestId('json-text-editor')
}

export function requestBodyExampleViewer(page: Page, opId: string) {
  return operationLocator(page, opId)
    .locator('section')
    .filter({ hasText: 'Request body' })
    .getByTestId('json-viewer')
}

export function responseJsonViewer(page: Page, opId: string) {
  return operationLocator(page, opId).getByTestId('response-body').getByTestId('json-viewer')
}

/** Assert editable editor highlight + overlay do not both paint an opening bracket on one line. */
export async function expectEditableFoldLayers(
  editor: Locator,
  lineMarker: string,
  options?: { collapseAll?: boolean },
) {
  if (options?.collapseAll !== false) {
    await editor.getByTestId('json-toggle-all-folds').click()
  }

  const layers = await editor.evaluate((root, marker) => {
    const highlightLines = Array.from(
      root.querySelectorAll('[data-testid="json-content"] [data-testid="json-line"]'),
    )
    const overlayLines = Array.from(root.querySelectorAll('[data-testid="json-fold-overlay"] div.h-5'))
    const index = highlightLines.findIndex((line) => (line.textContent ?? '').includes(marker))
    if (index === -1) return null

    const highlight = highlightLines[index]?.textContent ?? ''
    const overlay = overlayLines[index]?.textContent ?? ''
    return {
      highlightBrackets: (highlight.match(/[\[{]/g) ?? []).length,
      overlayBrackets: (overlay.match(/[\[{]/g) ?? []).length,
      combinedBrackets: ((highlight + overlay).match(/[\[{]/g) ?? []).length,
    }
  }, lineMarker)

  expect(layers).not.toBeNull()
  expect(layers!.highlightBrackets).toBe(0)
  expect(layers!.overlayBrackets).toBe(1)
  expect(layers!.combinedBrackets).toBe(1)
}

/** Assert a read-only json line renders exactly one opening bracket (inline fold controls). */
export async function expectReadOnlyFoldBrackets(viewer: Locator, lineMarker: string, count = 1) {
  const line = viewer.locator('[data-testid="json-line"]').filter({ hasText: lineMarker }).first()
  await line.waitFor()
  const text = await line.textContent()
  expect((text?.match(/[\[{]/g) ?? []).length).toBe(count)
}

/** Returns true when syntax-highlight markup is present under json-content. */
export async function jsonEditorHasHighlightMarkup(editor: Locator) {
  return editor.getByTestId('json-content').evaluate((content) =>
    Boolean(content.querySelector('.hljs-attr, .hljs-string, .hljs-number, .hljs-literal')),
  )
}

/** Mirror layer translateY should track textarea scrollTop in editable mode. */
export async function jsonEditorMirrorOffset(editor: Locator) {
  return editor.evaluate((root) => {
    const textarea = root.querySelector('[data-testid="json-textarea"]') as HTMLTextAreaElement | null
    const mirror = root.querySelector('[data-testid="json-content"] div.min-w-min') as HTMLElement | null
    if (!textarea || !mirror) return null

    const transform = mirror.style.transform || getComputedStyle(mirror).transform
    const match = transform.match(/-?\d+\.?\d*/)
    const offset = match ? Number.parseFloat(match[0]) : 0
    return { scrollTop: textarea.scrollTop, mirrorOffset: Math.abs(offset) }
  })
}
