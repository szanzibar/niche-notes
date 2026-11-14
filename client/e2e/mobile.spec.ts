import { expect, test, type Browser } from '@playwright/test'
import { row, shareWith, uid } from './helpers'

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
  expect((await page.getByPlaceholder('Title').boundingBox())!.width).toBeGreaterThan(200)
  await expect(page.getByRole('img', { name: 'Shared' })).toHaveCount(0)
  // Share stays beside the dots, and only there.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(1)
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

test('every action folds behind the dots at once, and the offline cloud stays beside them', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Groceries for the whole week')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Checklist', exact: true }).click()
  await page.keyboard.type('Eggs')
  await expect(page.getByRole('button', { name: 'Checked lines' })).toBeHidden()

  await page.context().setOffline(true)
  await expect(page.locator('main').getByRole('img', { name: 'Offline' })).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide checked' }).click()
  await expect(page.getByRole('button', { name: 'Hide checked' })).toHaveAttribute('aria-pressed', 'true')
})

test('a shared note keeps Share beside the dots for its owner, and a people icon for the other person', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await phone(browser, b)
  const alice = await phone(browser, a)
  await alice.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(alice.getByPlaceholder('Title')).toBeFocused()
  await alice.keyboard.type('Groceries for the whole week')
  await shareWith(alice, b)
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()
  await expect(alice.getByRole('img', { name: 'Shared' })).toHaveCount(0)

  await bob.getByRole('button', { name: 'Groceries' }).click()
  await expect(bob.getByRole('img', { name: 'Shared' })).toBeVisible()
  await bob.getByRole('button', { name: 'More' }).click()
  await expect(bob.getByText(/^Shared by/)).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Leave' })).toBeVisible()
})

test('back from a note goes to the list and back again leaves, also when a widget opened the note', async ({
  browser,
}) => {
  const page = await phone(browser, `alice-${uid()}`)
  const entries = await page.evaluate(() => history.length)
  for (const title of ['First', 'Second']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    await page.getByRole('button', { name: 'Back' }).click()
  }
  await row(page, 'First').click()
  const note = page.url()
  // The phone's own back button.
  await page.goBack()
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  // Only the last note opened lies ahead of the list, so the next back leaves the app.
  expect(await page.evaluate(() => history.length)).toBe(entries + 1)

  const launched = await page.context().newPage()
  const blank = await launched.evaluate(() => history.length)
  await launched.goto(note)
  await expect(launched.getByPlaceholder('Title')).toHaveValue('First')
  await launched.goBack()
  await expect(launched.getByPlaceholder('Search notes')).toBeVisible()
  expect(await launched.evaluate(() => history.length)).toBe(blank + 2)
})

test('a link from a widget, calendar or alert that arrives while the app runs opens over the list, so back still leaves', async ({
  browser,
}) => {
  const page = await phone(browser, `alice-${uid()}`)
  // Chrome hands Android's link to the running app through its launch queue.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', {
      value: { setConsumer: (consumer: unknown) => Object.assign(window, { launch: consumer }) },
    })
  })
  await page.reload()
  const list = await page.evaluate(() => navigation.currentEntry!.index)
  const urls: string[] = []
  for (const title of ['First', 'Second']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    urls.push(page.url())
    await page.getByRole('button', { name: 'Back' }).click()
  }
  const launch = (url: string) =>
    page.evaluate((url) => (window as unknown as { launch(params: { targetURL: string }): void }).launch({ targetURL: url }), url)
  const title = page.getByPlaceholder('Title')
  const at = () => page.evaluate(() => navigation.currentEntry!.index)

  await row(page, 'Second').click()
  await launch(urls[0])
  await expect(title).toHaveValue('First')
  await page.evaluate(
    (url) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { open: url } })),
    urls[1],
  )
  await expect(title).toHaveValue('Second')
  await page.goBack()
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  expect(await at()).toBe(list)

  // The widget picker replaces the list rather than sitting over a note.
  await row(page, 'First').click()
  await launch(new URL('/widget/w1', page.url()).href)
  await expect(page).toHaveURL(/\/widget\/w1$/)
  expect(await at()).toBe(list)
})
