import { expect, test, type Page } from '@playwright/test'
import { newNote, signIn, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const body = (page: Page) => page.locator('.editor-body')

test('the text style row turns a line into a heading or a code block, and back', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Styles', 'Big')

  await tool(page, 'Text style').click()
  await tool(page, 'Heading 3').click()
  await expect(body(page).locator('h3')).toHaveText('Big')
  await expect(tool(page, 'Heading 3')).toBeHidden()

  await tool(page, 'Text style').click()
  await tool(page, 'Code block').click()
  await expect(body(page).locator('pre')).toHaveText('Big')

  await tool(page, 'Text style').click()
  await tool(page, 'Text').click()
  await expect(body(page).locator('p').first()).toHaveText('Big')
  await expect(body(page).locator('pre, h3')).toHaveCount(0)
})

test('Link links the selection or types the address, Link again removes it, and Highlight marks text', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Marks', 'see docs')
  const answer = (address: string) => page.once('dialog', (dialog) => void dialog.accept(address))

  await body(page).getByText('see docs').dblclick({ position: { x: 50, y: 5 } })
  answer('example.com')
  await tool(page, 'Link').click()
  await expect(body(page).locator('a')).toHaveText('docs')
  await expect(body(page).locator('a')).toHaveAttribute('href', 'https://example.com')

  // Inside the link, the button removes the whole link.
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await tool(page, 'Link').click()
  await expect(body(page).locator('a')).toHaveCount(0)

  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  answer('https://tiptap.dev')
  await tool(page, 'Link').click()
  await expect(body(page).locator('a')).toHaveText('https://tiptap.dev')

  await body(page).getByText('see docs').dblclick({ position: { x: 5, y: 5 } })
  await tool(page, 'Highlight').click()
  await expect(body(page).locator('mark')).toHaveText('see')
})
