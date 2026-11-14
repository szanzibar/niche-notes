import { expect, test } from '@playwright/test'
import { drag, newNote, row, rowTitles, shareWith, signIn, uid } from './helpers'

test('dragging a note onto another nests it, and onto the header puts it back at the top', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Parent')
  await newNote(page, 'Child')

  await drag(page, row(page, 'Child'), row(page, 'Parent'))
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Child')).toBeHidden()
  await page.getByRole('button', { name: 'Expand' }).click()

  await drag(page, row(page, 'Child'), page.locator('aside header'))
  await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0)
  await expect(row(page, 'Child')).toBeVisible()
})

test('dropping on the edge of a row makes a sibling, in the order you dropped it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  expect(await rowTitles(page)).toEqual(['Cherry', 'Banana', 'Apple'])

  await drag(page, row(page, 'Apple'), row(page, 'Cherry'), 'top')
  expect(await rowTitles(page)).toEqual(['Apple', 'Cherry', 'Banana'])

  await drag(page, row(page, 'Cherry'), row(page, 'Banana'), 'bottom')
  expect(await rowTitles(page)).toEqual(['Apple', 'Banana', 'Cherry'])
  await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0)
})

test('a pinned note sits above its siblings until unpinned', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  await row(page, 'Apple').click()
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  expect(await rowTitles(page)).toEqual(['Apple', 'Cherry', 'Banana'])
  await page.getByRole('button', { name: 'Unpin' }).click()
  expect(await rowTitles(page)).toEqual(['Cherry', 'Banana', 'Apple'])
})

test('on a touch screen every row has a grip on its left, like the lines of a note, that a finger drags at once', async ({
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  for (const title of ['Apple', 'Banana']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(title)
    await page.getByRole('button', { name: 'Back' }).click()
  }
  const grip = row(page, 'Banana').locator('..').locator('[data-handle]')
  const from = (await grip.boundingBox())!
  const to = (await row(page, 'Apple').boundingBox())!
  expect(from.x).toBeLessThan(to.x)

  // A touch that starts moving straight away, with no long press.
  const cdp = await context.newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: from.x + from.width / 2, y }] })
  const [y0, y1] = [from.y + from.height / 2, to.y + to.height * 0.9]
  await touch('touchStart', y0)
  for (let step = 1; step <= 8; step++) await touch('touchMove', y0 + ((y1 - y0) * step) / 8)
  await touch('touchEnd')
  expect(await rowTitles(page)).toEqual(['Apple', 'Banana'])
})

test('a note dropped inside another becomes its first child, and the header puts it on top', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Old')
  await newNote(page, 'Parent')
  await page.getByRole('button', { name: 'New note inside' }).first().click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Kid')
  expect(await rowTitles(page)).toEqual(['Parent', 'Kid', 'Old'])

  // Old is the oldest note. Where it lands follows the drop, not its age.
  await drag(page, row(page, 'Old'), row(page, 'Parent'))
  expect(await rowTitles(page)).toEqual(['Parent', 'Old', 'Kid'])
  await drag(page, row(page, 'Old'), page.locator('aside header'))
  expect(await rowTitles(page)).toEqual(['Old', 'Parent', 'Kid'])
})

test('dropping just under the pinned notes puts a note at the top of the rest, unpinned', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Top')
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  expect(await rowTitles(page)).toEqual(['Top', 'Cherry', 'Banana', 'Apple'])

  await drag(page, row(page, 'Apple'), row(page, 'Cherry'), 'top')
  expect(await rowTitles(page)).toEqual(['Top', 'Apple', 'Cherry', 'Banana'])
  await row(page, 'Apple').click()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
})

test('notes someone shared reorder like any other', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  for (const title of ['One', 'Two', 'Three']) {
    await newNote(alice, title)
    await shareWith(alice, b)
  }
  for (const title of ['One', 'Two', 'Three']) await expect(row(bob, title)).toBeVisible()

  await drag(bob, row(bob, 'One'), row(bob, 'Two'), 'top')
  let titles = await rowTitles(bob)
  expect(titles.indexOf('One')).toBe(titles.indexOf('Two') - 1)
  await drag(bob, row(bob, 'Three'), row(bob, 'Two'), 'bottom')
  titles = await rowTitles(bob)
  expect(titles).toEqual(['One', 'Two', 'Three'])
})

test('a launch draws the tree with saved titles, without waiting for the notes', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Draft')
  await page.getByPlaceholder('Title').fill('Final')
  await newNote(page, 'Old')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  // Lets the saved titles land before the reload.
  await page.waitForTimeout(500)
  // The rows of the first draw, before any note has loaded.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const rows = document.querySelectorAll('aside [aria-roledescription="draggable"] > span:first-child')
      if (rows.length === 0) return
      sessionStorage.setItem('firstRows', JSON.stringify([...rows].map((r) => r.textContent)))
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('firstRows'))).toBe('["Final"]')
})
