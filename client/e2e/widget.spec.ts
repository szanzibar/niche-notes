import { expect, test, type Page } from '@playwright/test'
import { newNote, row, signIn, uid } from './helpers'

// Desktop Chromium can't open the Android app, so the hand-off shows up as a failed request.
const handOff = async (page: Page) => {
  const request = await page.waitForEvent('requestfailed', (r) => r.url().startsWith('intent://'))
  return new URL(request.url().replace('intent://', 'https://')).searchParams
}

test('the widget picker is the tree: choosing a note hands it to the app instead of opening it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  const groceries = page.url().split('/n/')[1]
  await newNote(page, 'Chores')
  const chores = page.url().split('/n/')[1]

  await page.goto('/widget/7')
  await expect(page.getByText('Tap a note to show it in the widget')).toBeVisible()
  const fromRow = handOff(page)
  await row(page, 'Groceries').click()
  expect(Object.fromEntries(await fromRow)).toEqual({ id: '7', note: groceries, title: 'Groceries' })
  await expect(page.locator('.editor-body')).toHaveCount(0)

  const fromSearch = handOff(page)
  await page.getByPlaceholder('Search notes').fill('chor')
  await page.keyboard.press('Enter')
  expect((await fromSearch).get('note')).toBe(chores)
})
