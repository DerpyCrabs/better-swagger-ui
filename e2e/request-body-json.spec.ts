import { expect, test } from '@playwright/test'
import {
  clickJsonFoldCloseOnLineContaining,
  clickJsonFoldOnLineContaining,
  expectEditableFoldLayers,
  expectReadOnlyFoldBrackets,
  expandOperation,
  jsonEditorHasHighlightMarkup,
  jsonEditorInnerText,
  jsonEditorMirrorOffset,
  loadSpec,
  openTryItOut,
  operationLocator,
  requestBodyExampleViewer,
  requestBodyJsonEditor,
  specUrl,
} from './helpers'

test.describe('request body json editor', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('request-body.json'))
  })

  test('shows foldable editor in try it out mode', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await expect(editor).toBeVisible()
    await expect(editor.getByTestId('json-content')).toContainText('"name"')
    await expect(editor.getByTestId('json-textarea')).toBeVisible()
    await expect(editor.getByTestId('json-toggle-all-folds')).toBeVisible()
    await expect(editor.locator('[data-testid="json-line"]')).not.toHaveCount(0)
  })

  test('supports selecting text across the request body', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    const textarea = editor.getByTestId('json-textarea')

    await textarea.focus()
    await textarea.selectText()

    const selection = await textarea.inputValue()
    expect(selection).toContain('"name"')
    expect(selection).toContain('"meta"')
  })

  test('does not render doubled fold brackets in editable mode', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = requestBodyJsonEditor(page, 'post:/items')
    const bracketCounts = await editor.getByTestId('json-content').evaluate((content) => {
      const lines = Array.from(content.querySelectorAll('[data-testid="json-line"]'))
      return lines.map((line) => ({
        text: line.textContent ?? '',
        brackets: (line.textContent?.match(/[\[{]/g) ?? []).length,
      }))
    })

    for (const line of bracketCounts) {
      if (line.text.includes('"tags"') || line.text.includes('"meta"')) {
        expect(line.brackets).toBe(0)
      }
    }

    await expectEditableFoldLayers(editor, '"tags"')
    await expectEditableFoldLayers(editor, '"meta"', { collapseAll: false })
  })

  test('keeps syntax highlighting and overlay while resizing the request body editor', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = requestBodyJsonEditor(page, 'post:/items')
    const textarea = editor.getByTestId('json-textarea')
    const resize = editor.getByTestId('json-textarea-resize')

    await expect(jsonEditorHasHighlightMarkup(editor)).resolves.toBe(true)

    await resize.evaluate((element) => {
      element.style.height = '20rem'
    })

    await expect(jsonEditorHasHighlightMarkup(editor)).resolves.toBe(true)
    await expect(editor.getByTestId('json-fold-overlay')).toBeVisible()
    await expect(textarea).toHaveClass(/text-transparent/)

    await textarea.evaluate((element) => {
      element.scrollTop = 40
    })

    await expect.poll(async () => {
      const offset = await jsonEditorMirrorOffset(editor)
      if (!offset) return false
      return Math.abs(offset.scrollTop - offset.mirrorOffset) < 1
    }).toBe(true)
  })

  test('keeps highlight layers aligned with textarea scroll position', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = requestBodyJsonEditor(page, 'post:/items')
    const textarea = editor.getByTestId('json-textarea')

    await textarea.evaluate((element) => {
      element.scrollTop = 64
    })

    await expect.poll(async () => {
      const offset = await jsonEditorMirrorOffset(editor)
      if (!offset) return false
      return Math.abs(offset.scrollTop - offset.mirrorOffset) < 1
    }).toBe(true)
  })

  test('updates request body content when editing json', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = requestBodyJsonEditor(page, 'post:/items')
    const textarea = editor.getByTestId('json-textarea')

    await textarea.focus()
    await textarea.fill('{\n  "name": "Changed",\n  "tags": [],\n  "meta": { "count": 2 }\n}')
    await textarea.blur()

    await expect(jsonEditorInnerText(editor)).resolves.toContain('"name": "Changed"')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"count": 2')
  })

  test('shows validation error for invalid json on blur', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const op = operationLocator(page, 'post:/items')
    const textarea = requestBodyJsonEditor(page, 'post:/items').getByTestId('json-textarea')

    await textarea.fill('{ "name": ')
    await textarea.blur()

    await expect(op.getByText('Request body must be valid JSON')).toBeVisible()
  })

  test('clears validation error after fixing json', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const op = operationLocator(page, 'post:/items')
    const textarea = requestBodyJsonEditor(page, 'post:/items').getByTestId('json-textarea')
    const validBody = '{\n  "name": "Fixed",\n  "tags": [],\n  "meta": { "count": 1 }\n}'

    await textarea.fill('{ invalid')
    await textarea.blur()
    await expect(op.getByText('Request body must be valid JSON')).toBeVisible()

    await textarea.evaluate((element, body) => {
      element.value = body
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, validBody)
    await textarea.blur()

    await expect(op.getByText('Request body must be valid JSON')).not.toBeVisible()
  })

  test('supports vertical resize on the request body textarea', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    const resize = await editor.getByTestId('json-textarea-resize').evaluate((element) => getComputedStyle(element).resize)
    expect(resize).toBe('vertical')
  })

  test('shows copy in the editor toolbar', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await expect(editor.getByTitle('Copy')).toBeVisible()
  })

  test('collapses nested request body json', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"count"')

    await clickJsonFoldOnLineContaining(editor, '"meta"')
    await expect.poll(async () => (await jsonEditorInnerText(editor)).includes('"count"')).toBe(false)
  })

  test('collapses and expands from the opening bracket in editable mode', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"a"')

    await clickJsonFoldOnLineContaining(editor, '"tags"')
    await expect.poll(async () => (await jsonEditorInnerText(editor)).includes('"a"')).toBe(false)

    await clickJsonFoldOnLineContaining(editor, '"tags"')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"a"')
  })

  test('collapses and expands from the collapsed preview in editable mode', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await clickJsonFoldOnLineContaining(editor, '"tags"')
    await expect.poll(async () => (await jsonEditorInnerText(editor)).includes('"a"')).toBe(false)

    await clickJsonFoldCloseOnLineContaining(editor, '"tags"')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"a"')
  })

  test('collapses and expands nested folds from toolbar without hiding root', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')

    const editor = operationLocator(page, 'post:/items').getByTestId('json-text-editor')
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"count"')

    await editor.getByTestId('json-toggle-all-folds').click()
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"name"')
    await expect.poll(async () => (await jsonEditorInnerText(editor)).includes('"count"')).toBe(false)

    await editor.getByTestId('json-toggle-all-folds').click()
    await expect(jsonEditorInnerText(editor)).resolves.toContain('"count"')
  })

  test('shows foldable example value before try it out', async ({ page }) => {
    await expandOperation(page, 'post:/items')

    const op = operationLocator(page, 'post:/items')
    await op.getByTestId('request-body-tab-example').click()

    const viewer = op.locator('section').filter({ hasText: 'Request body' }).getByTestId('json-viewer')
    await expect(viewer).toBeVisible()
    await expect(viewer.getByTestId('json-toggle-all-folds')).toBeVisible()
    await expect(viewer.locator('[data-testid="json-line"]')).not.toHaveCount(0)
    await expect(viewer.getByTestId('json-content')).toContainText('"name"')
  })

  test('collapses nested json in the example viewer', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await operationLocator(page, 'post:/items').getByTestId('request-body-tab-example').click()

    const viewer = operationLocator(page, 'post:/items')
      .locator('section')
      .filter({ hasText: 'Request body' })
      .getByTestId('json-viewer')

    await expect(jsonEditorInnerText(viewer)).resolves.toContain('"count"')
    await clickJsonFoldOnLineContaining(viewer, '"meta"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('"count"')).toBe(false)
  })

  test('does not render doubled fold brackets in the example viewer', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await operationLocator(page, 'post:/items').getByTestId('request-body-tab-example').click()

    const viewer = requestBodyExampleViewer(page, 'post:/items')
    await viewer.getByTestId('json-toggle-all-folds').click()

    await expectReadOnlyFoldBrackets(viewer, '"tags"')
    await expectReadOnlyFoldBrackets(viewer, '"meta"')
  })

  test('collapses and expands from the opening bracket in read-only viewer', async ({ page }) => {
    await expandOperation(page, 'post:/items')
    await operationLocator(page, 'post:/items').getByTestId('request-body-tab-example').click()

    const viewer = operationLocator(page, 'post:/items')
      .locator('section')
      .filter({ hasText: 'Request body' })
      .getByTestId('json-viewer')

    await clickJsonFoldOnLineContaining(viewer, '"tags"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('"a"')).toBe(false)

    await clickJsonFoldOnLineContaining(viewer, '"tags"')
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('"a"')
  })
})
