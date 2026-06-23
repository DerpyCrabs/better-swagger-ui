import { expect, test } from '@playwright/test'
import {
  executeOperation,
  expandOperation,
  jsonEditorHasHighlightMarkup,
  jsonSearchActiveMarkText,
  jsonSearchMarks,
  loadSpec,
  mockApi,
  openJsonSearch,
  requestBodyJsonEditor,
  responseJsonViewer,
  searchJsonEditor,
  specUrl,
} from './helpers'

test.describe('json search', () => {
  test('highlights matches in response json viewer', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { legalEntityId: null, agreementNumber: 'A-1' },
            { legalEntityId: 'LE-2', agreementNumber: 'A-2' },
          ],
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'legalEntityId')

    await expect(viewer.getByTestId('json-search-count')).toHaveText('1/2')
    await expect(jsonSearchMarks(viewer)).toHaveCount(2)
    await expect(jsonSearchActiveMarkText(viewer)).resolves.toBe('legalEntityId')
  })

  test('preserves syntax highlighting while searching response json', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ legalEntityId: null, agreementNumber: '343423/56' }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'legalEntityId')

    await expect(jsonSearchMarks(viewer)).toHaveCount(1)
    expect(await jsonEditorHasHighlightMarkup(viewer)).toBe(true)

    const highlightedLine = viewer
      .locator('[data-testid="json-line"]')
      .filter({ hasText: 'legalEntityId' })
      .first()
    await expect(highlightedLine.locator('.hljs-attr')).toHaveCount(1)
    await expect(highlightedLine.locator('[data-search-highlight]')).toHaveCount(1)
  })

  test('navigates between response matches', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          legalEntityId: null,
          nested: { legalEntityId: 'inner' },
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'legalEntityId')

    await expect(viewer.getByTestId('json-search-count')).toHaveText('1/2')
    await expect(jsonSearchActiveMarkText(viewer)).resolves.toBe('legalEntityId')

    await viewer.getByTestId('json-search-next').click()
    await expect(viewer.getByTestId('json-search-count')).toHaveText('2/2')

    const activeMarks = viewer
      .getByTestId('json-content')
      .locator('[data-search-highlight].json-search-mark-active')
    await expect(activeMarks).toHaveCount(1)
    await expect(activeMarks.first()).toHaveText('legalEntityId')
  })

  test('scrolls to the first match with lines of context above', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    const body = JSON.stringify({
      items: Array.from({ length: 40 }, (_, index) => ({
        id: index,
        note: `line-${index}`,
        ...(index === 15 ? { marker: 'SEARCH-TARGET' } : {}),
      })),
    })

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body,
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'SEARCH-TARGET')

    await expect(viewer.getByTestId('json-search-count')).toHaveText('1/1')

    const scroll = await viewer.evaluate((root) => {
      const scroller = root.querySelector('.overflow-auto') as HTMLElement | null
      const activeLine = root.querySelector('[data-search-highlight].json-search-mark-active')
      const line = activeLine?.closest('[data-testid="json-line"]') as HTMLElement | null
      if (!scroller || !line) return null

      const lineTop = line.offsetTop
      return {
        scrollTop: scroller.scrollTop,
        lineTop,
      }
    })

    expect(scroll).not.toBeNull()
    expect(scroll!.scrollTop).toBeLessThan(scroll!.lineTop)
  })

  test('searches request body json editor', async ({ page }) => {
    await loadSpec(page, specUrl('request-body.json'))
    await expandOperation(page, 'post:/items')

    const editor = requestBodyJsonEditor(page, 'post:/items')
    await searchJsonEditor(editor, 'name')

    await expect(editor.getByTestId('json-search-count')).not.toHaveText('No results')
    await expect(jsonSearchMarks(editor)).not.toHaveCount(0)
    expect(await jsonEditorHasHighlightMarkup(editor)).toBe(true)
  })

  test('opens search with ctrl+f and closes with escape', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'hello' }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await viewer.click()
    await page.keyboard.press('ControlOrMeta+f')
    await expect(viewer.getByTestId('json-search-bar')).toBeVisible()

    await viewer.getByTestId('json-search-input').fill('message')
    await expect(jsonSearchMarks(viewer)).toHaveCount(1)

    await viewer.getByTestId('json-search-input').press('Escape')
    await expect(viewer.getByTestId('json-search-bar')).toBeHidden()
    await expect(jsonSearchMarks(viewer)).toHaveCount(0)
  })

  test('expands collapsed json to reveal a hidden match', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          legalEntityId: null,
          nested: { legalEntityId: 'hidden-value' },
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await viewer.getByTestId('json-toggle-all-folds').click()
    await expect(viewer.locator('[data-testid="json-line"]').filter({ hasText: 'hidden-value' })).toHaveCount(0)

    await searchJsonEditor(viewer, 'hidden-value')
    await expect(viewer.getByTestId('json-search-count')).toHaveText('1/1')
    await expect(viewer.locator('[data-testid="json-line"]').filter({ hasText: 'hidden-value' })).toHaveCount(1)
    await expect(jsonSearchMarks(viewer)).toHaveCount(1)
  })

  test('highlights matches that include quotes and punctuation', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ legalEntityId: null, agreementNumber: '345356/17' }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'legalEntityId": null')

    await expect(viewer.getByTestId('json-search-count')).toHaveText('1/1')
    await expect(jsonSearchMarks(viewer)).toHaveCount(4)

    const highlightedText = await jsonSearchMarks(viewer).allInnerTexts()
    expect(highlightedText.join('')).toBe('legalEntityId": null')

    const line = viewer.locator('[data-testid="json-line"]').filter({ hasText: 'legalEntityId' }).first()
    await expect(line.locator('.hljs-attr')).toHaveCount(1)
    await expect(line.locator('.hljs-punctuation [data-search-highlight]')).toHaveCount(1)
    await expect(line.locator('.hljs-keyword [data-search-highlight]')).toHaveCount(1)
  })

  test('active search marks use background only without inner outlines', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ legalEntityId: null }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await searchJsonEditor(viewer, 'legalEntityId": null')

    const styles = await viewer
      .getByTestId('json-content')
      .locator('[data-search-highlight].json-search-mark-active')
      .evaluateAll((marks) =>
      marks.map((mark) => {
        const computed = getComputedStyle(mark)
        return {
          outlineWidth: computed.outlineWidth,
          borderWidth: computed.borderTopWidth,
          boxShadow: computed.boxShadow,
        }
      }),
    )

    expect(styles.length).toBeGreaterThan(0)
    for (const style of styles) {
      expect(style.outlineWidth).toBe('0px')
      expect(style.borderWidth).toBe('0px')
      expect(style.boxShadow).toBe('none')
    }
  })

  test('search bar does not sit under floating toolbar buttons', async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))

    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ legalEntityId: null }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const viewer = responseJsonViewer(page, 'get:/json')
    await openJsonSearch(viewer)

    const overlap = await viewer.evaluate(() => {
      const searchInput = document.querySelector('[data-testid="json-search-input"]') as HTMLElement | null
      const foldButton = document.querySelector('[data-testid="json-toggle-all-folds"]') as HTMLElement | null
      if (!searchInput || !foldButton) return false

      const inputBox = searchInput.getBoundingClientRect()
      const buttonBox = foldButton.getBoundingClientRect()
      return !(
        inputBox.right <= buttonBox.left ||
        inputBox.left >= buttonBox.right ||
        inputBox.bottom <= buttonBox.top ||
        inputBox.top >= buttonBox.bottom
      )
    })

    expect(overlap).toBe(false)
  })
})
