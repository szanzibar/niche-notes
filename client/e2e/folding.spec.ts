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

test('a folded heading leaves the blank lines at the end of its section showing and hides the ones inside it', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Shop', '# Fruit')
  // One blank line between Apples and Lemons, two before Veg.
  await page.keyboard.press('Enter')
  await page.keyboard.type('Apples')
  for (const key of ['Enter', 'Enter']) await page.keyboard.press(key)
  await page.keyboard.type('Lemons')
  for (const key of ['Enter', 'Enter', 'Enter']) await page.keyboard.press(key)
  await page.keyboard.type('# Veg')
  // The editor ends on a blank line of its own.
  const blank = body(page).locator('> p:has(br.ProseMirror-trailingBreak:only-child)').locator('visible=true')
  await expect(blank).toHaveCount(4)

  await fold(page, 'Fruit').click()
  await expect(para(page, 'Lemons')).toBeHidden()
  await expect(blank).toHaveCount(3)
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

test('a line that shares its id with another, as a copy does, folds alone', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await line(page, 'Eggs').click()
  await page.keyboard.press(lineEnd)
  await expect.poll(() => caret(page)).toBe('Eggs@4')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Brown')
  await chevron(page, 'Eggs').click()
  await expect(line(page, 'Brown')).toBeHidden()
  await chevron(page, 'Eggs').click()
  await expect(line(page, 'Brown')).toBeVisible()
  // Groceries and Eggs get one id, as a copied tree's lines and their originals have.
  await body(page).evaluate((el) => {
    const { state, view } = (el as unknown as { editor: Editor }).editor
    const tr = state.tr
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'taskItem' && ['Groceries', 'Eggs'].includes(node.firstChild!.textContent))
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: 'copied' })
    })
    view.dispatch(tr)
  })

  await chevron(page, 'Eggs').click()
  await expect(line(page, 'Brown')).toBeHidden()
  await expect(line(page, 'Milk')).toBeVisible()
  await expect(chevron(page, 'Groceries')).toHaveAttribute('aria-label', 'Collapse')
  await chevron(page, 'Eggs').click()
  await expect(line(page, 'Brown')).toBeVisible()
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

// Fruit holds Apples and Citrus, which holds Lemons, and Veg holds Kale.
async function outline(page: Page) {
  await newNote(page, 'Shop', '# Fruit')
  for (const text of ['Apples', '## Citrus', 'Lemons', '# Veg', 'Kale']) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(text)
  }
}
const heading = (page: Page, text: string) => body(page).locator('h1, h2', { hasText: text })
const fold = (page: Page, text: string) => heading(page, text).locator('.line-fold')
const para = (page: Page, text: string) => body(page).locator('> p').getByText(text, { exact: true })

test('a heading folds everything down to the next heading of its level or higher, per person and per device', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const bob = `bob-${uid()}`
  const page = await signIn(browser, name)
  const other = await signIn(browser, bob)
  await outline(page)
  await shareWith(page, bob)
  await expect(body(page).locator('.line-fold')).toHaveCount(3)
  await expect(fold(page, 'Veg')).toHaveCount(1)

  await fold(page, 'Citrus').click()
  await expect(para(page, 'Lemons')).toBeHidden()
  await expect(para(page, 'Apples')).toBeVisible()
  await expect(heading(page, 'Veg')).toBeVisible()
  await expect(fold(page, 'Citrus')).toHaveAttribute('aria-label', 'Expand')
  await fold(page, 'Fruit').click()
  await expect(para(page, 'Apples')).toBeHidden()
  await expect(heading(page, 'Citrus')).toBeHidden()
  await expect(para(page, 'Kale')).toBeVisible()
  // A folded heading shows its chevron without the pointer on it.
  await page.mouse.move(0, 0)
  await expect(fold(page, 'Fruit')).toHaveCSS('opacity', '1')

  // The fold stays across a reload, and an H2 folded inside an H1 stays folded when the H1 opens.
  await page.reload()
  await expect(para(page, 'Kale')).toBeVisible()
  await expect(para(page, 'Apples')).toBeHidden()
  await fold(page, 'Fruit').click()
  await expect(para(page, 'Apples')).toBeVisible()
  await expect(heading(page, 'Citrus')).toBeVisible()
  await expect(para(page, 'Lemons')).toBeHidden()

  const second = await signIn(browser, name)
  await row(second, 'Shop').click()
  await expect(para(second, 'Kale')).toBeVisible()
  await expect(para(second, 'Lemons')).toBeHidden()
  await para(second, 'Kale').click()
  await fold(second, 'Veg').click()
  await expect(para(page, 'Kale')).toBeHidden()

  await row(other, 'Shop').click()
  await expect(para(other, 'Kale')).toBeVisible()
  await expect(para(other, 'Lemons')).toBeVisible()
})

for (const [width, height] of [
  [1280, 800],
  [390, 844],
])
  test(`Enter, the arrows and Backspace work around a folded heading, ${width} wide`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
    await page.goto(`/auth/login?as=alice-${uid()}`)
    await outline(page)
    await fold(page, 'Fruit').click()
    await heading(page, 'Fruit').click()
    await page.keyboard.press(lineEnd)
    await expect.poll(() => caret(page)).toBe('Fruit@5')

    await page.keyboard.press('ArrowDown')
    await expect.poll(() => caret(page)).toBe('Veg@3')
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => caret(page)).toBe('Fruit@5')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => caret(page)).toBe('Veg@0')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => caret(page)).toBe('Fruit@5')

    // Backspace at the start of Veg joins it to Lemons, which unfolds Fruit.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press(lineStart)
    await expect.poll(() => caret(page)).toBe('Veg@0')
    await page.keyboard.press('Backspace')
    await expect(para(page, 'LemonsVeg')).toBeVisible()
    await expect(para(page, 'Apples')).toBeVisible()

    // Enter at the end of a folded heading unfolds it and starts a line right under it.
    await fold(page, 'Fruit').click()
    await expect(para(page, 'Apples')).toBeHidden()
    await heading(page, 'Fruit').click()
    await page.keyboard.press(lineEnd)
    await expect.poll(() => caret(page)).toBe('Fruit@5')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Between')
    await expect(para(page, 'Between')).toBeVisible()
    await expect(para(page, 'Apples')).toBeVisible()
    await expect(body(page).locator('> :is(h1, h2, p):not(:has(br.ProseMirror-trailingBreak:only-child))')).toHaveText([
      'Fruit',
      'Between',
      'Apples',
      'Citrus',
      'LemonsVeg',
      'Kale',
    ])
  })

test('Find in note skips a folded heading’s section, and opening a note at a line inside it unfolds it', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await outline(page)
  await para(page, 'Apples').click()
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await page.keyboard.press('Escape')
  await fold(page, 'Fruit').click()
  await expect(line(page, 'Apples')).toBeHidden()

  await page.keyboard.press('ControlOrMeta+f')
  await page.keyboard.type('lemons')
  await expect(page.getByText('No matches.')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Due \(/ }).click()
  await page.getByRole('list', { name: 'Today', exact: true }).getByRole('button', { name: /Apples/ }).click()
  await expect(line(page, 'Apples')).toBeVisible()
  await expect(para(page, 'Lemons')).toBeVisible()
  await expect(fold(page, 'Fruit')).toHaveAttribute('aria-label', 'Collapse')
})

const order = (page: Page) => body(page).locator('> :is(h1, h2, p):not(:has(br.ProseMirror-trailingBreak:only-child))')

test('dragging a folded heading by its handle takes its section along and leaves it folded', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await outline(page)
  await fold(page, 'Fruit').click()
  await heading(page, 'Fruit').hover()
  const handle = page.locator('.drag-handle')
  await expect(handle).toBeVisible()
  const from = (await handle.boundingBox())!
  const to = (await para(page, 'Kale').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 })
  await page.mouse.move(to.x + 20, to.y + to.height + 8, { steps: 12 })
  await page.mouse.up()

  await expect(order(page)).toHaveText(['Veg', 'Kale', 'Fruit', 'Apples', 'Citrus', 'Lemons'])
  await expect(fold(page, 'Fruit')).toHaveAttribute('aria-label', 'Expand')
  await expect(para(page, 'Apples')).toBeHidden()
  await expect(para(page, 'Kale')).toBeVisible()

  // An unfolded heading drags alone.
  await fold(page, 'Fruit').click()
  await heading(page, 'Veg').hover()
  const veg = (await handle.boundingBox())!
  const end = (await para(page, 'Lemons').boundingBox())!
  await page.mouse.move(veg.x + veg.width / 2, veg.y + veg.height / 2)
  await page.mouse.down()
  await page.mouse.move(veg.x + 20, veg.y + 20, { steps: 4 })
  await page.mouse.move(end.x + 20, end.y + end.height + 8, { steps: 12 })
  await page.mouse.up()
  await expect(order(page)).toHaveText(['Kale', 'Fruit', 'Apples', 'Citrus', 'Lemons', 'Veg'])
})

test('the shortcut folds the line or heading at the cursor, or the one it sits under, and unfolds it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await groceries(page)
  await line(page, 'Eggs').click()
  await expect.poll(() => caret(page)).toMatch(/^Eggs@/)

  // From a leaf line the parent folds, and the cursor ends at its end.
  await page.keyboard.press('ControlOrMeta+Shift+[')
  await expect(line(page, 'Eggs')).toBeHidden()
  await expect.poll(() => caret(page)).toBe('Groceries@9')
  await page.keyboard.press('ControlOrMeta+Shift+]')
  await expect(line(page, 'Eggs')).toBeVisible()
  // Nothing is folded, so Expand does nothing and leaves the key to the browser.
  await page.keyboard.press('ControlOrMeta+Shift+]')
  await expect(line(page, 'Eggs')).toBeVisible()
  await line(page, 'Groceries').click()
  await expect.poll(() => caret(page)).toMatch(/^Groceries@/)
  await page.keyboard.press('ControlOrMeta+Shift+[')
  await expect(line(page, 'Milk')).toBeHidden()
  await page.keyboard.press('ControlOrMeta+Shift+]')
  await expect(line(page, 'Milk')).toBeVisible()

  await tool(page, 'Task list').click()
  await outline(page)
  await para(page, 'Lemons').click()
  await expect.poll(() => caret(page)).toBe('Lemons@6')
  await page.keyboard.press('ControlOrMeta+Shift+[')
  await expect(para(page, 'Lemons')).toBeHidden()
  await expect(para(page, 'Apples')).toBeVisible()
  await expect.poll(() => caret(page)).toBe('Citrus@6')
  await page.keyboard.press('ControlOrMeta+Shift+[')
  await expect(para(page, 'Apples')).toBeHidden()
  await expect.poll(() => caret(page)).toBe('Fruit@5')
  await page.keyboard.press('ControlOrMeta+Shift+]')
  await expect(para(page, 'Apples')).toBeVisible()
  await expect(para(page, 'Lemons')).toBeHidden()
})
