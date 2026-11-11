import { expect, test, type Page } from '@playwright/test'
import { newNote, signIn, uid } from './helpers'

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

test('Link adds, changes and removes a link, and a click on a link edits it while the bar opens it', async ({
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

  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await tool(page, 'Link').click()
  await expect(address).toHaveValue('https://example.com')
  await tool(page, 'Remove link').click()
  await expect(links).toHaveCount(0)
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await tool(page, 'Link').click()
  await address.fill('https://tiptap.dev')
  await tool(page, 'Apply link').click()
  await expect(links).toHaveText('https://tiptap.dev')

  const open = page.getByTitle('Open link')
  await page.keyboard.press('Home')
  await expect(open).toBeHidden()
  const popup = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null)
  await links.click()
  await expect(open).toHaveAttribute('href', 'https://tiptap.dev')
  await expect(open).toHaveAttribute('target', '_blank')
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
