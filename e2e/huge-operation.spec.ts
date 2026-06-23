import { expect, test } from '@playwright/test'
import { loadSpec, operationLocator, specUrl } from './helpers'

const FIRST_OP = 'post:/big-a'
const SECOND_OP = 'post:/big-b'

function operationHeaderMetrics(page: import('@playwright/test').Page, opId: string) {
  return page.evaluate((id) => {
    const header = document.querySelector(`[data-op-id="${CSS.escape(id)}"] [data-op-header]`) as HTMLElement | null
    const stickyTop = document.querySelector('header')?.getBoundingClientRect().height ?? 0
    const rect = header?.getBoundingClientRect()
    return {
      scrollY: window.scrollY,
      headerTop: rect?.top ?? -1,
      headerBottom: rect?.bottom ?? -1,
      stickyTop,
    }
  }, opId)
}

test.describe('huge operation expand', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('huge-operation.json'))
    await page.getByTestId('tag-section-big').getByRole('button').click()
  })

  test('expanding a huge operation does not scroll the page or move the header', async ({ page }) => {
    const op = operationLocator(page, FIRST_OP)
    await op.scrollIntoViewIfNeeded()

    const before = await operationHeaderMetrics(page, FIRST_OP)

    await op.getByRole('button').first().click()
    await expect(op.getByTestId('execute')).toBeVisible()
    await expect(op.getByText('Request body')).toBeVisible()
    await expect(op.getByText('Responses')).toBeVisible()

    const after = await operationHeaderMetrics(page, FIRST_OP)

    expect(after.scrollY).toBe(before.scrollY)
    expect(after.headerTop).toBeGreaterThanOrEqual(before.headerTop - 2)
  })

  test('opening a second huge operation keeps its header on screen after the first is expanded', async ({ page }) => {
    const first = operationLocator(page, FIRST_OP)
    const second = operationLocator(page, SECOND_OP)

    await first.getByRole('button').first().click()
    await expect(first.getByTestId('execute')).toBeVisible()

    await second.scrollIntoViewIfNeeded()

    const before = await operationHeaderMetrics(page, SECOND_OP)
    expect(before.headerTop).toBeGreaterThanOrEqual(before.stickyTop)

    await second.getByRole('button').first().click()
    await expect(first.getByTestId('execute')).not.toBeVisible()
    await expect(second.getByTestId('execute')).toBeVisible()
    await expect(second.getByText('Request body')).toBeVisible()

    const after = await operationHeaderMetrics(page, SECOND_OP)

    expect(after.headerTop).toBeGreaterThanOrEqual(after.stickyTop)
    expect(after.headerBottom).toBeGreaterThan(after.stickyTop)
  })

  test('re-expanding after deep link does not scroll the page', async ({ page }) => {
    const spec = `${new URL(page.url()).origin}${specUrl('huge-operation.json')}`
    await page.goto(`/?url=${encodeURIComponent(spec)}&op=${encodeURIComponent(FIRST_OP)}`)
    await expect(page.getByTestId('api-title')).toHaveText('Huge Operation API')

    const op = operationLocator(page, FIRST_OP)
    await expect(op.getByTestId('execute')).toBeVisible()
    await op.scrollIntoViewIfNeeded()

    const before = await operationHeaderMetrics(page, FIRST_OP)

    await op.getByRole('button').first().click()
    await expect(op.getByTestId('execute')).not.toBeVisible()
    await op.getByRole('button').first().click()
    await expect(op.getByTestId('execute')).toBeVisible()

    const after = await operationHeaderMetrics(page, FIRST_OP)

    expect(after.headerTop).toBeGreaterThanOrEqual(before.headerTop - 2)
  })
})
