import { expect, test, type Browser } from '@playwright/test'
import { shareWith, uid } from './helpers'

const phone = async (browser: Browser, name: string) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=${name}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  return page
}

test('on a phone the header keeps the title, and the dots reveal the usual actions', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('A rather long title for a phone screen')

  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeHidden()
  expect((await page.getByPlaceholder('Title').boundingBox())!.width).toBeGreaterThan(250)
  await expect(page.getByRole('img', { name: 'Shared' })).toHaveCount(0)

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
})

test('a short title keeps the actions beside it until typing makes it too long', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Milk')
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0)

  await page.keyboard.type(' and everything else for the week')
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
})

test('a shared note shows a people icon beside the dots, for both sides', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await phone(browser, b)
  const alice = await phone(browser, a)
  await alice.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(alice.getByPlaceholder('Title')).toBeFocused()
  await alice.keyboard.type('Groceries for the whole week')
  await alice.getByRole('button', { name: 'More' }).click()
  await shareWith(alice, b)
  await expect(alice.getByRole('img', { name: 'Shared' })).toBeVisible()

  await bob.getByRole('button', { name: 'Groceries' }).click()
  await expect(bob.getByRole('img', { name: 'Shared' })).toBeVisible()
  await bob.getByRole('button', { name: 'More' }).click()
  await expect(bob.getByText(/^Shared by/)).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Leave' })).toBeVisible()
})
