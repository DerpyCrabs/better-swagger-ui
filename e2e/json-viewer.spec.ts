import { expect, test } from '@playwright/test'
import {
  buildLargeJsonBody,
  clickJsonFoldCloseOnLineContaining,
  clickJsonFoldOnLineContaining,
  executeOperation,
  expandOperation,
  expectReadOnlyFoldBrackets,
  jsonEditorContent,
  jsonEditorInnerText,
  largeJsonLineCount,
  loadSpec,
  mockApi,
  operationLocator,
  responseJsonViewer,
  specUrl,
} from './helpers'

test.describe('json viewer', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))
  })

  test('uses foldable json viewer for normal-sized JSON responses', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'hello', nested: { value: 1 } }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const responseBody = operationLocator(page, 'get:/json').getByTestId('response-body')
    await expect(responseBody.getByTestId('json-viewer')).toBeVisible()
    await expect(responseBody.getByTestId('json-toggle-all-folds')).toBeVisible()
  })

  test('renders all lines for small payloads', async ({ page }) => {
    const body = JSON.stringify({ message: 'hello', nested: { value: 1 } })

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body,
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = operationLocator(page, 'get:/json')
      .getByTestId('response-body')
      .getByTestId('json-viewer')

    const totalLines = JSON.stringify(JSON.parse(body), null, 2).split('\n').length
    await expect(viewer.locator('[data-testid="json-line"]')).toHaveCount(totalLines)
  })

  test('supports selecting text across response lines', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'hello', nested: { value: 1 } }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const content = jsonEditorContent(
      operationLocator(page, 'get:/json').getByTestId('response-body').getByTestId('json-viewer'),
    )

    await content.focus()
    await content.selectText()

    const selection = await content.evaluate((element) => {
      if (element instanceof HTMLTextAreaElement) {
        return element.value.slice(element.selectionStart, element.selectionEnd)
      }
      return window.getSelection()?.toString() ?? ''
    })

    expect(selection).toContain('"message"')
    expect(selection).toContain('"value"')
  })

  test('virtualizes large json and renders scrolled content', async ({ page }) => {
    const body = buildLargeJsonBody()
    const totalLines = largeJsonLineCount(body)

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body,
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = operationLocator(page, 'get:/json')
      .getByTestId('response-body')
      .getByTestId('json-viewer')

    await expect(viewer).toBeVisible()

    const renderedLines = viewer.locator('[data-testid="json-line"]')
    await expect(renderedLines).not.toHaveCount(0)
    await expect.poll(async () => renderedLines.count()).toBeLessThan(totalLines / 2)

    await viewer.evaluate((element) => {
      const scroller = element.querySelector('.overflow-auto')
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    })

    await expect.poll(async () => {
      const numbers = await viewer.locator('[data-testid="json-line"]').evaluateAll((lines) =>
        lines
          .map((line) => Number.parseInt(line.getAttribute('data-line-number') ?? '', 10))
          .filter((value) => !Number.isNaN(value)),
      )
      return Math.max(...numbers)
    }).toBeGreaterThan(totalLines - 100)
  })

  test('does not render doubled fold brackets in collapsed response json', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tags: ['alpha', 'beta'],
          nested: { secret: 'hidden' },
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await viewer.getByTestId('json-toggle-all-folds').click()

    await expectReadOnlyFoldBrackets(viewer, '"tags"')
    await expectReadOnlyFoldBrackets(viewer, '"nested"')
  })

  test('collapses and expands array folds from the opening bracket in responses', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tags: ['alpha', 'beta'], ok: true }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('alpha')

    await clickJsonFoldOnLineContaining(viewer, '"tags"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('alpha')).toBe(false)

    await clickJsonFoldOnLineContaining(viewer, '"tags"')
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('alpha')
  })

  test('collapses and expands from the collapsed preview in responses', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nested: { secret: 'hidden' }, ok: true }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await clickJsonFoldOnLineContaining(viewer, '"nested"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('secret')).toBe(false)

    await clickJsonFoldCloseOnLineContaining(viewer, '"nested"')
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('secret')
  })

  test('collapse all keeps root response fields visible', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'hello',
          nested: { secret: 'hidden' },
          tags: ['a'],
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('secret')

    await viewer.getByTestId('json-toggle-all-folds').click()
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('"message"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('secret')).toBe(false)

    await viewer.getByTestId('json-toggle-all-folds').click()
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('secret')
  })
})
