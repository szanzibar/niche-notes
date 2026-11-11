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
  expect(Object.fromEntries(await fromRow)).toEqual({ id: '7', note: groceries, title: 'Groceries', token: expect.any(String) })
  await expect(page.locator('.editor-body')).toHaveCount(0)

  const fromSearch = handOff(page)
  await page.getByPlaceholder('Search notes').fill('chor')
  await page.keyboard.press('Enter')
  expect((await fromSearch).get('note')).toBe(chores)

  await page.context().setOffline(true)
  await expect(page.getByText('Connect to the internet to pick a note')).toBeVisible()
})

test('a widget reads its note as lines with the token from the hand-off, without a session', async ({
  browser,
  request,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await page.getByRole('button', { name: 'Checklist', exact: true }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('eggs')
  await page.getByRole('button', { name: 'Indent', exact: true }).click()
  await page.getByRole('button', { name: 'Bullet list', exact: true }).click()
  await page.locator('.editor-body input[type="checkbox"]').click()

  await page.goto('/widget/7')
  const picked = handOff(page)
  await row(page, 'Groceries').click()
  const headers = { authorization: `Bearer ${(await picked).get('token')}` }
  await expect
    .poll(async () => (await request.get('/api/widget', { headers })).json())
    .toEqual({ title: 'Groceries', lines: ['☑ milk', '    • eggs'] })
})
