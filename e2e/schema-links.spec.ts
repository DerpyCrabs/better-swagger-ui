import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { clearSchemaLinksStorage, specUrl } from './helpers'

test.describe('schema links catalog', () => {
  test.beforeEach(async ({ page }) => {
    await clearSchemaLinksStorage(page)
  })

  test('imports, selects, reveals active environment, and exports schema links', async ({ page }) => {
    await page.goto('/')
    const origin = new URL(page.url()).origin
    const catalog = {
      version: 1,
      items: [
        {
          type: 'link',
          name: 'Gateway',
          url: `${origin}${specUrl('minimal.json')}`,
        },
        {
          type: 'group',
          name: 'Product Type',
          links: [
            { name: 'dev', url: `${origin}${specUrl('minimal.yaml')}` },
            { name: 'stable', url: `${origin}${specUrl('minimal.json')}` },
          ],
        },
      ],
    }

    await page.getByTestId('schema-links-picker-button').click()
    await page.getByTestId('schema-links-open-settings').click()
    await page.getByTestId('schema-links-import-file').setInputFiles({
      name: 'schema-links.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(catalog)),
    })
    await page.getByLabel('Close schema link settings').click()

    await page.getByTestId('schema-links-picker-button').click()
    await page.getByRole('button', { name: /Gateway/ }).click()
    await expect(page.getByTestId('url-input')).toHaveValue(`${origin}${specUrl('minimal.json')}`)
    await expect(page.getByTestId('api-title')).toHaveText('Minimal API')

    await page.getByTestId('schema-links-picker-button').click()
    await page.getByTestId('schema-links-child-link').filter({ hasText: 'dev' }).click()
    await expect(page.getByTestId('url-input')).toHaveValue(`${origin}${specUrl('minimal.yaml')}`)

    await page.getByTestId('schema-links-picker-button').click()
    await expect(page.getByTestId('schema-links-child-link').filter({ hasText: 'dev' })).toBeVisible()
    await expect(page.getByTestId('schema-links-child-link').filter({ hasText: 'stable' })).toBeVisible()

    await page.getByTestId('schema-links-open-settings').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('schema-links-export').click()
    const download = await downloadPromise
    const path = await download.path()
    expect(download.suggestedFilename()).toBe('schema-links.json')
    expect(path).toBeTruthy()

    const content = path ? await readFile(path, 'utf8') : ''
    expect(JSON.parse(content)).toMatchObject({
      version: 1,
      items: [
        { type: 'link', name: 'Gateway' },
        { type: 'group', name: 'Product Type' },
      ],
    })
  })
})
