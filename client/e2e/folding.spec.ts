import { expect, type Page } from '@playwright/test'
import type { Editor } from '@tiptap/react'
import { lineEnd, lineStart, newNote, phoneOnly, row, shareWith, signIn, test, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const body = (page: Page) => page.locator('.editor-body')
const line = (page: Page, text: string) => body(page).locator('li p').getByText(text, { exact: true })
// The deepest list item holding the text is the line's.
const item = (page: Page, text: string) => body(page).locator('li', { has: page.locator(`p:text-is("${text}")`) }).last()
const chevron = (page: Page, text: string) => item(page, text).locator('.line-fold').first()

// Groceries holds Milk and Eggs, and Hardware holds nothing.
async function groceries(page: Page) {
  await newNote(page, 'Lists', 'Groceries')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Milk')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('Hardware')
}

test('a line with lines nested under it folds them away with its chevron and back, and Undo leaves the fold', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await expect(body(page).locator('.line-fold')).toHaveCount(1)
  await expect(item(page, 'Hardware').locator('.line-fold')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Task item checkbox for Milk' }).check()
  await line(page, 'Hardware').click()
  await page.keyboard.press(lineEnd)
  // A typing pause, so Undo takes back only what comes next.
  await page.waitForTimeout(600)
  await page.keyboard.type('!')

  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()
  await expect(line(page, 'Eggs')).toBeHidden()
  await expect(chevron(page, 'Groceries')).toHaveAttribute('aria-label', 'Expand')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(line(page, 'Hardware')).toBeVisible()
  await expect(line(page, 'Milk')).toBeHidden()

  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeVisible()
  await expect(chevron(page, 'Groceries')).toHaveAttribute('aria-label', 'Collapse')
  await line(page, 'Eggs').click()
  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Eggs')).toBeHidden()
  // The cursor left the folded lines for the end of the line that hides them.
  await page.keyboard.type(' list')
  await expect(line(page, 'Groceries list')).toBeVisible()

  // A folded line shows its chevron without the pointer on it.
  await page.mouse.move(0, 0)
  await expect(chevron(page, 'Groceries list')).toHaveCSS('opacity', '1')

  await expect(item(page, 'Groceries list').locator('> .task-count')).toHaveAttribute('data-label', '1/2')

  // Enter at its end starts a line below the lines it hides, which offers the tasks checked before.
  await page.keyboard.press('Enter')
  await page.keyboard.type('Mi')
  await expect(page.getByRole('group', { name: 'Suggestions' }).getByRole('button')).toHaveText(['Milk'])
  await expect(line(page, 'Milk')).toBeHidden()
  await expect(body(page).locator('> ul > li > div > p')).toHaveText(['Groceries list', 'Mi', 'Hardware'])
})

test('a line indented into a folded line unfolds it, and Find in note skips folded lines', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()

  const field = page.getByLabel('Find in note')
  await page.keyboard.press('ControlOrMeta+f')
  await page.keyboard.type('eggs')
  await expect(page.getByText('No matches.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(field).toBeHidden()

  await line(page, 'Hardware').click()
  await page.keyboard.press('Tab')
  await expect(line(page, 'Milk')).toBeVisible()
  await expect(line(page, 'Eggs')).toBeVisible()
  await expect(item(page, 'Groceries')).toContainText('Hardware')
})

test('a fold follows its person to their other devices and never hides lines from the people they share with', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const bob = `bob-${uid()}`
  const page = await signIn(browser, name)
  const other = await signIn(browser, bob)
  await groceries(page)
  await shareWith(page, bob)
  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()

  const second = await signIn(browser, name)
  await row(second, 'Lists').click()
  await expect(line(second, 'Hardware')).toBeVisible()
  await expect(line(second, 'Milk')).toBeHidden()
  await line(second, 'Hardware').click()
  await chevron(second, 'Groceries').click()
  await expect(line(second, 'Milk')).toBeVisible()
  await expect(line(page, 'Milk')).toBeVisible()

  await row(other, 'Lists').click()
  await expect(line(other, 'Hardware')).toBeVisible()
  await chevron(other, 'Groceries').click()
  await expect(line(other, 'Milk')).toBeHidden()
  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()
  await chevron(other, 'Groceries').click()
  await expect(line(other, 'Milk')).toBeVisible()
  await expect(line(page, 'Milk')).toBeHidden()
  await expect(line(second, 'Milk')).toBeHidden()
})

test('a tap on a chevron folds its line without ticking it, and a tap on the grip still ticks', async ({ browser }) => {
  phoneOnly()
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await groceries(page)
  await body(page).blur()

  const box = page.getByRole('checkbox', { name: 'Task item checkbox for Groceries' })
  const fold = (await chevron(page, 'Groceries').boundingBox())!
  await page.touchscreen.tap(fold.x + fold.width / 2, fold.y + fold.height / 2)
  await expect(line(page, 'Milk')).toBeHidden()
  await expect(box).not.toBeChecked()
  await expect(body(page)).not.toBeFocused()

  const grip = (await item(page, 'Groceries').locator('.line-grip').first().boundingBox())!
  await page.touchscreen.tap(grip.x + grip.width - 8, grip.y + grip.height / 2)
  await expect(box).toBeChecked()
  await expect(line(page, 'Milk')).toBeHidden()
})

// The line's text and offset the cursor is at, as the editor has it. A key sent before the editor has seen the caret
// move acts where it was, so each step waits for it.
const caret = (page: Page) =>
  body(page).evaluate((el) => {
    const { $from } = (el as unknown as { editor: Editor }).editor.state.selection
    return `${$from.parent.textContent}@${$from.parentOffset}`
  })

for (const [width, height] of [
  [1280, 800],
  [390, 844],
])
  test(`the arrows step over folded lines, and Backspace into them unfolds them, ${width} wide`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
    await page.goto(`/auth/login?as=alice-${uid()}`)
    await groceries(page)
    await chevron(page, 'Groceries').click()
    await line(page, 'Groceries').click()
    await page.keyboard.press(lineEnd)
    await expect.poll(() => caret(page)).toBe('Groceries@9')

    await page.keyboard.press('ArrowDown')
    await expect.poll(() => caret(page)).toBe('Hardware@8')
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => caret(page)).toBe('Groceries@9')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => caret(page)).toBe('Hardware@0')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => caret(page)).toBe('Groceries@9')

    // The first Backspace takes Hardware out of the list, and the second joins it to Eggs, which unfolds Groceries.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press(lineStart)
    await expect.poll(() => caret(page)).toBe('Hardware@0')
    await page.keyboard.press('Backspace')
    await expect(body(page).locator('> p').getByText('Hardware', { exact: true })).toBeVisible()
    await expect(line(page, 'Milk')).toBeHidden()
    await page.keyboard.press('Backspace')
    await expect(line(page, 'EggsHardware')).toBeVisible()
    await expect(line(page, 'Milk')).toBeVisible()
  })

test('a click beside a line’s text, below it or after its date, puts the cursor in that text and keeps its fold', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await page.keyboard.press('Escape')

  // A line with lines under it shows their count, so the space right of its text belongs to the line, and every
  // place the cursor goes on the way is that line's text, never the line below.
  await body(page).evaluate((el) => {
    const editor = (el as unknown as { editor: Editor }).editor
    const seen: string[] = ((window as unknown as { seen: string[] }).seen = [])
    editor.on('selectionUpdate', () => seen.push(editor.state.selection.$from.parent.textContent))
    document.addEventListener('selectionchange', () => seen.push(getSelection()!.anchorNode?.textContent ?? ''))
  })
  const parent = (await line(page, 'Groceries').boundingBox())!
  const row = (await item(page, 'Groceries').boundingBox())!
  await page.mouse.click(row.x + row.width - 10, parent.y + parent.height / 2, { delay: 150 })
  await expect.poll(() => caret(page)).toBe('Groceries@9')
  expect(await page.evaluate(() => [...new Set((window as unknown as { seen: string[] }).seen)])).toEqual(['Groceries'])

  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()

  const text = (await line(page, 'Groceries').boundingBox())!
  const folded = (await item(page, 'Groceries').boundingBox())!
  await page.mouse.click(text.x + text.width / 2, folded.y + folded.height - 2)
  await expect.poll(() => caret(page)).toMatch(/^Groceries@[1-8]$/)
  await page.keyboard.type('!')
  await expect(line(page, 'Milk')).toBeHidden()
  await expect(body(page).locator('> ul > li > div > p').first()).toContainText('!')

  const dated = (await item(page, 'Hardware').boundingBox())!
  await page.mouse.click(dated.x + dated.width - 10, dated.y + 10)
  await expect.poll(() => caret(page)).toBe('Hardware@8')
})

test('ticking a sibling below a folded line keeps it folded, and opening a folded line via Due unfolds it', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await line(page, 'Milk').click()
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('group', { name: 'Checked tasks' }).getByRole('button', { name: 'Hide' }).click()
  await page.keyboard.press('Escape')

  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()
  await line(page, 'Hardware').click()
  await page.getByRole('checkbox', { name: 'Task item checkbox for Hardware' }).check()
  await expect(line(page, 'Milk')).toBeHidden()
  await expect.poll(() => caret(page)).toBe('Groceries@9')

  await page.getByRole('button', { name: /^Due \(/ }).click()
  await page.getByRole('list', { name: 'Today', exact: true }).getByRole('button', { name: /Milk/ }).click()
  await expect(line(page, 'Milk')).toBeVisible()
  await expect.poll(() => caret(page)).toBe('Milk@4')

  // Switching the list kind keeps a folded line folded.
  await chevron(page, 'Groceries').click()
  await expect(line(page, 'Milk')).toBeHidden()
  await tool(page, 'Bullet list').click()
  await expect(line(page, 'Milk')).toBeHidden()
})
