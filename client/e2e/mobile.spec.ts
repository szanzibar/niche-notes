import { expect, type Browser, type Locator } from '@playwright/test'
import { display, row, shareWith, test, uid } from './helpers'

const phone = async (browser: Browser, name: string) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=${name}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  return page
}

test('the header holds the title, Share and the dots, and the menu names each action', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Milk')

  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
  expect((await page.getByPlaceholder('Title').boundingBox())!.width).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toHaveText('Pin')
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await expect(page.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
})

test('deleting a note with notes under it asks whether they go too, and says how many', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Trips')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'New note inside' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Inside')
  await page.getByRole('button', { name: 'Back' }).click()

  await row(page, 'Trips').click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await page.getByRole('button', { name: 'With its 1 note' }).click()
  await expect(page.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
  await expect(row(page, 'Inside')).toHaveCount(0)
})

test('the offline cloud sits beside the dots, and the menu still sets what checked tasks do', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Groceries')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Task list', exact: true }).click()
  await page.keyboard.type('Eggs')

  await page.context().setOffline(true)
  await expect(page.locator('main').getByRole('img', { name: 'Offline' })).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  const hide = page.getByRole('group', { name: 'Checked tasks' }).getByRole('button', { name: 'Hide' })
  await hide.click()
  await expect(hide).toHaveAttribute('aria-pressed', 'true')
})

test('a shared note keeps Share for its owner, and names the owner for the other person', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await phone(browser, b)
  const alice = await phone(browser, a)
  await alice.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(alice.getByPlaceholder('Title')).toBeFocused()
  await alice.keyboard.type('Groceries')
  await shareWith(alice, b)
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()

  await bob.getByRole('button', { name: 'Groceries' }).click()
  await expect(bob.locator('main').getByRole('img', { name: `Shared by ${display(a)}` })).toHaveText(display(a))
  await bob.getByRole('button', { name: 'More' }).click()
  await expect(bob.getByRole('button', { name: 'Leave note' })).toBeVisible()
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

test('on a phone, back from a search result marks that result, not the first one opened', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  for (const title of ['Apples', 'Apricots']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    await page.getByRole('button', { name: 'Back' }).click()
  }
  await page.getByPlaceholder('Search notes').fill('ap')
  for (const title of ['Apples', 'Apricots']) {
    await page.getByRole('option').filter({ hasText: title }).tap()
    await expect(page.getByPlaceholder('Title')).toHaveValue(title)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('option', { selected: true })).toContainText(title)
  }
})

test('on a phone, back from a search result and clearing the search shows the last note open, highlighted', async ({
  browser,
}) => {
  const page = await phone(browser, `alice-${uid()}`)
  for (const title of ['Target', ...Array.from({ length: 20 }, (_, i) => `Filler ${i}`)]) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    await page.getByRole('button', { name: 'Back' }).click()
  }
  await expect(row(page, 'Target')).not.toBeInViewport()
  await page.getByPlaceholder('Search notes').fill('Target')
  await page.getByRole('option').filter({ hasText: 'Target' }).tap()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Target')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Clear search' }).tap()
  await expect(row(page, 'Target')).toHaveAttribute('aria-current', 'page')
  await expect(row(page, 'Target')).toBeInViewport()
  await expect(page.getByRole('list', { name: 'Recent' })).toHaveCount(0)

  // A desktop-width tree with no note open marks nothing.
  await page.setViewportSize({ width: 1200, height: 844 })
  await expect(page.locator('aside [aria-current="page"]')).toHaveCount(0)
})

test('on a phone, Recent under the list goes back to a note opened before, the last one first', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  for (const title of ['Groceries', 'Chores']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    await page.getByRole('button', { name: 'Back' }).click()
  }
  const recent = page.getByRole('list', { name: 'Recent' }).getByRole('button')
  await expect(recent).toHaveCount(0)
  await page.getByRole('button', { name: 'Recent', exact: true }).tap()
  await expect(recent).toHaveText(['Chores', 'Groceries'])

  await recent.last().tap()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Groceries')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(recent).toHaveText(['Groceries', 'Chores'])

  // The list stays open on this device.
  await page.reload()
  await expect(recent).toHaveText(['Groceries', 'Chores'])
})

test('on a phone, a tap on a link shows its box and a tap on the box opens the link', async ({ browser }) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.keyboard.type('Recipes')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await page.getByLabel('Link address').fill('https://example.com/turkey')
  await page.keyboard.press('Enter')

  await page.locator('.editor-body a').tap()
  const opened = page.context().waitForEvent('page')
  await page.getByTitle('Open link').tap()
  expect((await opened).url()).toBe('https://example.com/turkey')
})

test('on a phone, a fold chevron sits midway between its column and its grip dots, on every kind of line', async ({
  browser,
}) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Folds')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# Plan')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[] Groceries')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Milk')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Oat')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('Eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- Bullet')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('child')

  // A heading's grip is the handle that floats beside it once the heading is touched.
  await page.locator('.editor-body h1').tap()
  const edge = (await page.locator('.editor-body').boundingBox())!.x
  // The grip's dots are drawn from 7.9 on the svg's 24-unit grid: the left dots at 9, less half their round stroke.
  const box = async (fold: Locator, grip: Locator) => {
    const [f, svg, chevron] = await Promise.all([fold.boundingBox(), grip.boundingBox(), fold.locator('svg').boundingBox()])
    return { f: f!, y: svg!.y + svg!.height / 2, dots: svg!.x + (svg!.width * 7.9) / 24, middle: chevron!.x + chevron!.width / 2 }
  }
  const lines = page.locator('.editor-body li', { has: page.locator('p:text-is("Groceries")') }).last()
  const milk = page.locator('.editor-body li', { has: page.locator('p:text-is("Milk")') }).last()
  const bullet = page.locator('.editor-body li', { has: page.locator('p:text-is("Bullet")') }).last()
  const cases = [
    await box(page.locator('.editor-body h1 .line-fold'), page.locator('.drag-handle svg')),
    await box(lines.locator('.line-fold').first(), lines.locator('.line-grip svg').first()),
    await box(milk.locator('.line-fold').first(), milk.locator('.line-grip svg').first()),
    await box(bullet.locator('.line-fold').first(), bullet.locator('.line-grip svg').first()),
  ]
  // The chevron is midway between its column's left edge and the dots, and its box stops short of them.
  for (const { f, y, dots, middle } of cases.slice(1)) {
    expect(Math.abs(middle - (f.x + dots) / 2)).toBeLessThan(1)
    // A finger on the dots reaches the grip, not the chevron.
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.line-grip') != null, [dots + 1, y])).toBe(true)
  }
  expect(Math.abs(cases[0].middle - (cases[0].f.x + cases[0].dots) / 2)).toBeLessThan(1)
  // The top-level ones start at the editor's left edge.
  for (const i of [0, 1, 3]) expect(cases[i].f.x).toBeCloseTo(edge, 0)
})

test('on a phone, a list line shows its grip only while the selection is on it, and the hidden grip still ticks', async ({
  browser,
}) => {
  const page = await phone(browser, `alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Grips')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Task list', exact: true }).tap()
  await page.keyboard.type('One')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Two')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Three')
  const grips = page.locator('.editor-body .line-grip')
  const shown = () => grips.evaluateAll((all) => all.map((g) => getComputedStyle(g).opacity))

  await expect.poll(shown).toEqual(['0', '0', '1'])
  await page.keyboard.press('ArrowUp')
  await expect.poll(shown).toEqual(['0', '1', '0'])
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(shown).toEqual(['1', '1', '0'])

  await grips.last().tap()
  await expect(page.getByRole('checkbox', { name: 'Task item checkbox for Three' })).toBeChecked()
})
