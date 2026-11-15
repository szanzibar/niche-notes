import { expect, type Page } from '@playwright/test'
import { newNote, signIn, test, uid } from './helpers'

const cells = (page: Page) =>
  page
    .locator('.editor-body table tr')
    .evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent)))

test('on a phone, Return fills a table cell by cell, adds a row at the end, and leaves on an empty row', async ({
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const name = `alice-${uid()}`
  await page.goto(`/auth/login?as=${name}`)
  await newNote(page, 'Espresso log')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add row' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Checklist' })).toBeDisabled()

  for (const text of ['Date', 'Dose', 'Yield', 'Mon', '18g', '36g', 'Tue', '18g', '40g']) {
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Enter')
  await page.keyboard.type('Tasty')
  expect(await cells(page)).toEqual([
    ['Date', 'Dose', 'Yield'],
    ['Mon', '18g', '36g'],
    ['Tue', '18g', '40g'],
  ])
  await expect(page.locator('.editor-body .tableWrapper + p')).toHaveText('Tasty')
  await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0)

  // Back in the table, its tools scroll into view from the start of the bar.
  await page.getByRole('button', { name: 'Checklist' }).locator('xpath=../..').evaluate((bar) => (bar.scrollLeft = 0))
  await page.locator('.editor-body td').filter({ hasText: '40g' }).click()
  await expect(page.getByRole('button', { name: 'Add row' })).toBeInViewport()
})

test('the table tools add and delete rows and columns, and another device sees the table', async ({ browser }) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await newNote(page, 'Grind chart')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await page.keyboard.type('Beans')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Grind')

  // Each tool acts at the cursor: here the second column of the first row.
  await page.getByRole('button', { name: 'Add column' }).click()
  await page.getByRole('button', { name: 'Add row' }).click()
  expect(await cells(page)).toEqual([
    ['Beans', 'Grind', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
  ])
  await page.getByRole('button', { name: 'Delete column' }).click()
  await page.getByRole('button', { name: 'Delete row' }).click()
  expect(await cells(page)).toEqual([
    ['', '', ''],
    ['', '', ''],
  ])
  await page.keyboard.type('Ethiopia')

  const other = await signIn(browser, name)
  await other.getByText('Grind chart').click()
  await expect(other.locator('.editor-body table')).toContainText('Ethiopia')

  await page.locator('.editor-body td').first().click()
  await page.getByRole('button', { name: 'Delete table' }).click()
  await expect(other.locator('.editor-body table')).toHaveCount(0)
})
