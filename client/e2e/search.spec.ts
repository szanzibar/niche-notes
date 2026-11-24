import { expect } from '@playwright/test'
import { newNote, signIn, test, uid } from './helpers'

test('search matches titles and text as you type, and arrow keys open a result', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk and eggs')
  await newNote(page, 'Hardware', 'nails')
  const box = page.getByPlaceholder('Search notes')
  const options = page.getByRole('option')

  await box.fill('egg')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Groceries')
  await expect(options.first()).toContainText('milk and eggs')

  await box.fill('zzz')
  await expect(page.getByText('No matches')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(box).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hardware' })).toBeVisible()

  // A title match outranks a text match.
  await box.fill('a')
  await expect(options).toHaveCount(2)
  await expect(options.first()).toContainText('Hardware')
  await box.press('ArrowDown')
  await expect(page.getByRole('option', { selected: true })).toContainText('Groceries')
  await box.press('Enter')
  await expect(page.getByPlaceholder('Title')).toHaveValue('Groceries')
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type(' and bread')
  await expect(page.locator('.editor-body')).toContainText('milk and eggs and bread')

  // Trashed notes are found too, marked as such.
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await box.fill('bread')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Groceries')
  await expect(options.first()).toContainText('trash')
  await box.press('Enter')
  await expect(page.locator('main').getByRole('button', { name: 'Restore' })).toBeVisible()
})

test('the open note is the highlighted result, and the arrow keys go on from it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  for (const title of ['Apples', 'Apricots', 'Avocados']) await newNote(page, title)
  const box = page.getByPlaceholder('Search notes')
  const option = (title: string) => page.getByRole('option').filter({ hasText: title })
  const open = page.locator('aside [aria-current="page"]')
  const cursor = page.getByRole('option', { selected: true })

  await box.fill('a')
  await option('Apricots').click()
  await expect(open).toContainText('Apricots')
  await option('Apples').hover()
  await expect(cursor).toContainText('Apricots')

  await box.focus()
  await box.press('ArrowDown')
  await expect(cursor).toContainText('Avocados')
  await expect(open).toContainText('Apricots')
  await box.press('Enter')
  await expect(open).toContainText('Avocados')
})

test('search leaves out checked lines unless asked, and both choices follow the person to every device', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await newNote(page, 'Baking', 'flour')
  await page.getByRole('button', { name: 'Task list', exact: true }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('sugar')
  await page.getByRole('checkbox', { name: 'Task item checkbox for flour' }).click()
  await newNote(page, 'Old recipe', 'flour')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()

  const box = page.getByPlaceholder('Search notes')
  const options = page.getByRole('option')
  const checked = page.getByRole('button', { name: 'Include checked tasks' })
  const trash = page.getByRole('button', { name: 'Include trash' })
  const filters = page.getByRole('button', { name: 'Search filters' })
  await expect(filters).toHaveCount(0)
  await box.fill('flour')
  await filters.click()
  await expect(checked).toHaveAttribute('aria-pressed', 'false')
  await expect(trash).toHaveAttribute('aria-pressed', 'true')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Old recipe')

  await checked.click()
  await expect(options).toHaveCount(2)
  await trash.click()
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Baking')

  // Another device, where neither note is open, searches the same way.
  const other = await signIn(browser, name)
  await other.getByPlaceholder('Search notes').fill('flour')
  await other.getByRole('button', { name: 'Search filters' }).click()
  await expect(other.getByRole('button', { name: 'Include checked tasks' })).toHaveAttribute('aria-pressed', 'true')
  await expect(other.getByRole('button', { name: 'Include trash' })).toHaveAttribute('aria-pressed', 'false')
  await expect(other.getByRole('option')).toHaveCount(1)
  await expect(other.getByRole('option').first()).toContainText('Baking')
  await other.getByRole('button', { name: 'Include checked tasks' }).click()
  await expect(other.getByText('No matches')).toBeVisible()
})
