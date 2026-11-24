import { expect, type Page } from '@playwright/test'
import { lineEnd, newNote, signIn, test, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const body = (page: Page) => page.locator('.editor-body')

test('the text style row turns a line into a heading and back', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Styles', 'Big')

  await tool(page, 'Text style').click()
  await tool(page, 'Heading 3').click()
  await expect(body(page).locator('h3')).toHaveText('Big')
  await expect(tool(page, 'Heading 3')).toBeHidden()

  await tool(page, 'Text style').click()
  await tool(page, 'Text').click()
  await expect(body(page).locator('p').first()).toHaveText('Big')
  await expect(body(page).locator('h3')).toHaveCount(0)
})

test('Quote and Code block turn a line into one and back, and Divider adds a line', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Blocks', 'Big')

  await tool(page, 'Quote').click()
  await expect(body(page).locator('blockquote')).toHaveText('Big')
  await tool(page, 'Quote').click()
  await expect(body(page).locator('blockquote')).toHaveCount(0)

  await tool(page, 'Code block').click()
  await expect(body(page).locator('pre')).toHaveText('Big')
  await tool(page, 'Code block').click()
  await expect(body(page).locator('pre')).toHaveCount(0)

  await tool(page, 'Divider').click()
  await expect(body(page).locator('hr')).toHaveCount(1)
  await expect(body(page).locator('p').first()).toHaveText('Big')
})

test('Link adds, changes and removes a link, and a click on a link edits it while a box under it opens it', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Marks', 'see docs')
  const links = body(page).locator('a')
  const address = page.getByLabel('Link address')

  await body(page).getByText('see docs').dblclick({ position: { x: 50, y: 5 } })
  await tool(page, 'Link').click()
  await address.fill('example.com')
  await page.keyboard.press('Enter')
  await expect(links).toHaveText('docs')
  await expect(links).toHaveAttribute('href', 'https://example.com')

  await page.keyboard.press(lineEnd)
  await page.keyboard.press('ArrowLeft')
  await tool(page, 'Link').click()
  await expect(address).toHaveValue('https://example.com')
  await tool(page, 'Remove link').click()
  await expect(links).toHaveCount(0)
  await page.keyboard.press(lineEnd)
  await page.keyboard.type(' ')
  await tool(page, 'Link').click()
  await address.fill('https://tiptap.dev')
  await tool(page, 'Apply link').click()
  await expect(links).toHaveText('https://tiptap.dev')

  const open = page.getByTitle('Open link')
  await body(page).getByText('see docs').click({ position: { x: 5, y: 5 } })
  await expect(open).toBeHidden()
  const popup = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null)
  await links.click()
  await expect(open).toHaveAttribute('href', 'https://tiptap.dev')
  await expect(open).toHaveAttribute('target', '_blank')
  await expect(open).toHaveText('tiptap.dev')
  const [link, box] = [(await links.boundingBox())!, (await open.boundingBox())!]
  expect(box.y).toBeGreaterThanOrEqual(link.y + link.height)
  expect(box.y).toBeLessThan(link.y + link.height + 20)
  await page.keyboard.type('X')
  await expect(links).toContainText('X')
  expect(await popup).toBeNull()
})

test('Highlight marks the selection', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Marks', 'see docs')
  await body(page).getByText('see docs').dblclick({ position: { x: 5, y: 5 } })
  await tool(page, 'Highlight').click()
  await expect(body(page).locator('mark')).toHaveText('see')
})

test('Find in note marks each match outside hidden tasks and steps through them', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Baking', 'Apple pie')
  await page.keyboard.press('Enter')
  await tool(page, 'Task list').click()
  await page.keyboard.type('apple jam')
  await page.keyboard.press('Enter')
  await page.keyboard.type('apple tart')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('group', { name: 'Checked tasks' }).getByRole('button', { name: 'Hide' }).click()
  await page.getByRole('checkbox', { name: 'Task item checkbox for apple jam' }).check()
  const field = page.getByLabel('Find in note')

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Find in note' }).click()
  await expect(field).toBeFocused()
  await page.keyboard.type('APPLE')
  await expect(page.getByText('1 of 2')).toBeVisible()
  await expect(body(page).locator('.find-current')).toHaveText('Apple')
  await page.keyboard.press('Enter')
  await expect(page.getByText('2 of 2')).toBeVisible()
  await expect(body(page).locator('.find-current')).toHaveText('apple')

  await page.keyboard.press('Escape')
  await expect(field).toBeHidden()
  await expect(body(page).locator('.find-match, .find-current')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+f')
  await expect(field).toBeFocused()
})

test("a note's text asks for spell checking, which Android checks only where asked", async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Spelling', 'Thiss')
  await expect(body(page)).toHaveAttribute('spellcheck', 'true')
})

test('Enter starts a new line or task plain, while Shift+Enter and a split word keep their marks', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Marks')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('bold')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('still')
  await page.keyboard.press('Enter')
  await page.keyboard.type('plain')
  const lines = body(page).locator('p')
  await expect(lines.first().locator('strong')).toHaveText(['bold', 'still'])
  await expect(lines.nth(1)).toHaveText('plain')
  await expect(lines.nth(1).locator('strong')).toHaveCount(0)

  await page.keyboard.press('Enter')
  await tool(page, 'Task list').click()
  await page.keyboard.press('ControlOrMeta+i')
  await page.keyboard.type('eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.type('jam')
  await expect(body(page).locator('li').first().locator('em')).toHaveText('eggs')
  await expect(body(page).locator('li').nth(1)).toHaveText('jam')
  await expect(body(page).locator('li').nth(1).locator('em')).toHaveCount(0)

  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('word')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  // Chromium hands ProseMirror the caret move on the next frame.
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await expect(body(page).locator('li strong')).toHaveText(['wo', 'rd'])
})
