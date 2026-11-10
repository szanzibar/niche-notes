import { expect, test } from '@playwright/test'
import { newNote, signIn, uid } from './helpers'

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
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await box.fill('bread')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Groceries')
  await expect(options.first()).toContainText('trash')
  await box.press('Enter')
  await expect(page.locator('main').getByRole('button', { name: 'Restore' })).toBeVisible()
})
