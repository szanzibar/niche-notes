import { expect, test, type Page } from '@playwright/test'
import { newNote, row, signIn, uid } from './helpers'

test('a new note starts in the title, Enter moves to the body, and it survives a reload', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await expect(row(page, 'Groceries')).toBeVisible()

  await page.reload()
  await row(page, 'Groceries').click()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Groceries')
  await expect(page.locator('.editor-body')).toContainText('milk')
})

test('a note this device has not opened yet opens at the end of its text, ready to type', async ({ browser }) => {
  const name = `alice-${uid()}`
  await newNote(await signIn(browser, name), 'Journal', 'one')
  const page = await signIn(browser, name)
  await row(page, 'Journal').click()
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type(' two')
  await expect(page.locator('.editor-body')).toContainText('one two')
})

test('a note reopens where this device left the cursor, even after a reload and a line added above it', async ({
  browser,
}) => {
  // The editor takes a click or an arrow key a moment later. A new saved cursor shows it has.
  const saved = (p: Page) =>
    p.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cursor:'))?.[1])
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await newNote(page, 'Long', 'top')
  for (const line of ['first', 'second']) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  const typed = await saved(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('End')
  await expect.poll(() => saved(page)).not.toBe(typed)
  await page.goto('/')

  const phone = await signIn(browser, name)
  await row(phone, 'Long').click()
  await expect(phone.locator('.editor-body p')).toHaveText(['top', 'first', 'second'])
  const opened = await saved(phone)
  await phone.locator('.editor-body p').first().click()
  await phone.keyboard.press('End')
  await expect.poll(() => saved(phone)).not.toBe(opened)
  await phone.keyboard.press('Enter')
  await phone.keyboard.type('zero')

  // Search finds the new line once it has reached this device.
  const search = page.getByPlaceholder('Search notes')
  await expect(async () => {
    await search.fill('')
    await search.fill('zero')
    await page.getByRole('option').filter({ hasText: 'Long' }).click({ timeout: 500 })
  }).toPass()
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('!')
  // The phone's caret and name sit on its own line.
  await expect(page.locator('.editor-body p')).toHaveText(['top', /zero/, 'first!', 'second'])
})

test('Tab from the title goes to the body, not to Share', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Tabbed')
  await page.keyboard.press('Tab')
  await expect(page.locator('.editor-body')).toBeFocused()
})

test('checked items are crossed out, but not their children or the line typed after them', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Shopping')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Checklist' }).click()
  await page.keyboard.type('eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.type('brown')
  await page.getByRole('button', { name: 'Indent' }).click()
  await page.locator('.editor-body input[type="checkbox"]').first().click()

  const struck = (text: string) =>
    page.locator('.editor-body p', { hasText: text }).evaluate((p) => getComputedStyle(p).textDecorationLine)
  await expect(page.locator('.editor-body li[data-checked="true"] > div > p')).toHaveText('eggs')
  expect(await struck('eggs')).toBe('line-through')
  expect(await struck('brown')).toBe('none')

  await page.locator('.editor-body p', { hasText: 'eggs' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('milk')
  await expect(page.locator('.editor-body li[data-checked="true"]')).toHaveCount(1)
  expect(await struck('milk')).toBe('none')
})

test('a note opened while another is open takes its place, so back returns to the list', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'First')
  await newNote(page, 'Second')
  await row(page, 'First').click()
  await page.goBack()
  await expect(page.getByText('Pick a note, or make a new one.')).toBeVisible()
})

test('+ on a row makes a nested note', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Parent')
  await page.getByRole('button', { name: 'New note inside' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await expect(page.getByPlaceholder('Title')).toHaveValue('')
  await page.keyboard.type('Child')
  await expect(row(page, 'Child')).toBeVisible()

  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Child')).toBeHidden()
})

test('undo history survives leaving and reopening a note', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'First', 'milk')
  await newNote(page, 'Second')
  await row(page, 'First').click()
  await expect(page.locator('.editor-body')).toContainText('milk')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.editor-body')).not.toContainText('milk')
})

test('delete goes to the trash without asking; a trashed note is read-only until restored or emptied', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Doomed', 'keep me')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row(page, 'Doomed')).toHaveCount(0)
  await expect(page.getByText('No notes yet')).toBeVisible()

  await page.getByRole('button', { name: 'Trash (1)' }).click()
  await page.getByRole('button', { name: 'Doomed' }).click()
  await expect(page.getByRole('button', { name: 'Doomed' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('main').getByRole('button', { name: 'Restore' })).toBeVisible()
  await expect(page.locator('.editor-body')).toContainText('keep me')
  await expect(page.getByRole('button', { name: 'Checklist' })).toHaveCount(0)
  await page.locator('.editor-body').click()
  await page.keyboard.type('zzz')
  await expect(page.locator('.editor-body')).not.toContainText('zzz')

  await page.locator('main').getByRole('button', { name: 'Restore' }).click()
  await expect(row(page, 'Doomed')).toBeVisible()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Doomed')
  await expect(page.getByRole('button', { name: 'Checklist' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.locator('aside').getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByRole('button', { name: /^Trash/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No notes yet')).toBeVisible()
})
