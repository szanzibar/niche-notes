import { expect, type Page } from '@playwright/test'
import { drag, newNote, row, rowTitles, shareWith, signIn, test, uid } from './helpers'

// A row's nesting, from the indent it is drawn with.
const depth = async (page: Page, title: string) =>
  (parseInt(await row(page, title).locator('..').evaluate((el) => getComputedStyle(el).paddingLeft)) - 4) / 16

test('dragging a note onto another nests it, stays folded across a reload, and onto the header goes back to the top', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Parent')
  await newNote(page, 'Child')

  await drag(page, row(page, 'Child'), row(page, 'Parent'))
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Child')).toBeHidden()
  await page.reload()
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

test('a new pin goes below the other pins, and an unpinned note goes on top of the rest', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  for (const title of ['Apple', 'Banana', 'Cherry', 'Date']) await newNote(page, title)
  const pin = async (title: string, name: 'Pin' | 'Unpin') => {
    await row(page, title).click()
    await page.getByRole('button', { name, exact: true }).click()
  }
  await pin('Banana', 'Pin')
  await pin('Apple', 'Pin')
  expect(await rowTitles(page)).toEqual(['Banana', 'Apple', 'Date', 'Cherry'])
  await pin('Banana', 'Unpin')
  expect(await rowTitles(page)).toEqual(['Apple', 'Banana', 'Date', 'Cherry'])
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

test('a drop keeps a note pinned or not, and the line shows the end of its own group where it lands', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  for (const title of ['Apple', 'Banana', 'Next', 'Top']) {
    await newNote(page, title)
    if (title === 'Next' || title === 'Top') await page.getByRole('button', { name: 'Pin', exact: true }).click()
  }
  expect(await rowTitles(page)).toEqual(['Next', 'Top', 'Banana', 'Apple'])
  const line = (title: string) => row(page, title).locator('..').locator('[data-drop-line]')

  await drag(page, row(page, 'Next'), row(page, 'Apple'), 'bottom', () => expect(line('Banana')).toBeVisible())
  expect(await rowTitles(page)).toEqual(['Top', 'Next', 'Banana', 'Apple'])
  await drag(page, row(page, 'Apple'), row(page, 'Top'), 'top', () => expect(line('Banana')).toBeVisible())
  expect(await rowTitles(page)).toEqual(['Top', 'Next', 'Apple', 'Banana'])
  await row(page, 'Next').click()
  await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toBeVisible()
  await row(page, 'Apple').click()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
})

test('the note a drop goes into is outlined, and under an open one the note goes in first where the line shows', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Loose')
  await newNote(page, 'Parent')
  await page.getByRole('button', { name: 'New note inside' }).first().click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Kid')
  expect(await rowTitles(page)).toEqual(['Parent', 'Kid', 'Loose'])
  const into = page.locator('aside [data-drop-into]')

  await drag(page, row(page, 'Loose'), row(page, 'Parent'), 'bottom', async () => {
    await expect(into).toHaveCount(1)
    await expect(into.getByRole('button', { name: /^Parent/ })).toBeVisible()
    await expect(row(page, 'Kid').locator('..').locator('[data-drop-line]')).toBeVisible()
  })
  await expect(into).toHaveCount(0)
  expect(await rowTitles(page)).toEqual(['Parent', 'Loose', 'Kid'])
  expect(await depth(page, 'Loose')).toBe(1)

  // A drop beside a top-level note outlines nothing, since it goes into no note.
  await drag(page, row(page, 'Loose'), row(page, 'Parent'), 'top', () => expect(into).toHaveCount(0))
  expect(await rowTitles(page)).toEqual(['Loose', 'Parent', 'Kid'])
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

test('a device that only opens the app writes nothing, so every note stays where it was put', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  for (const title of ['Homework', 'Recipes', 'Old list']) {
    await newNote(alice, title)
    await shareWith(alice, b)
  }
  await expect(row(bob, 'Old list')).toBeVisible()
  // Bob puts one of Alice's notes inside a note of his, pins another and leaves the third.
  await newNote(bob, 'Kids')
  await drag(bob, row(bob, 'Homework'), row(bob, 'Kids'))
  await row(bob, 'Recipes').click()
  await bob.getByRole('button', { name: 'Pin', exact: true }).click()
  await row(bob, 'Old list').click()
  await bob.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(bob.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
  expect(await rowTitles(bob)).toEqual(['Recipes', 'Kids', 'Homework'])

  // Everything the server sends the new device is late, so it hears who shared what before its tree arrives.
  const phone = await (await browser.newContext()).newPage()
  const sent: string[] = []
  await phone.routeWebSocket(/\/socket/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (JSON.parse(String(message))[3] === 'update') sent.push(String(message))
      server.send(message)
    })
    server.onMessage((message) => setTimeout(() => ws.send(message), 500))
  })
  const same = async () => {
    await expect.poll(() => rowTitles(phone)).toEqual(['Recipes', 'Kids', 'Homework'])
    expect(await depth(phone, 'Homework')).toBe(1)
    await expect(phone.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
  }
  const offline = phone.locator('aside').getByRole('img', { name: 'Offline' })

  await phone.goto(`/auth/login?as=${b}`)
  await same()
  await phone.reload()
  await same()
  await phone.context().setOffline(true)
  await expect(offline).toBeVisible()
  await phone.context().setOffline(false)
  await expect(offline).toBeHidden()
  await same()
  // Long enough for anything it wrote on the way to have gone out.
  await phone.waitForTimeout(1000)
  expect(sent).toEqual([])
})

test('a note that is no longer shared leaves a tree that is behind without moving a note that was under it', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const desk = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(alice, 'Homework')
  await shareWith(alice, b)
  await expect(row(desk, 'Homework')).toBeVisible()
  await newNote(desk, 'Kids')
  await newNote(desk, 'Essay')
  await drag(desk, row(desk, 'Essay'), row(desk, 'Homework'))
  expect(await depth(desk, 'Essay')).toBe(1)

  // Everything the server sends the phone is late. Of two places written without knowing of each other, Y.js
  // keeps the one from the higher client id, which the phone is given.
  const phone = await (await browser.newContext()).newPage()
  await phone.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T) =>
      array instanceof Uint32Array && array.length === 1 ? (array.fill(0xffffffff) as T) : random(array)
  })
  await phone.routeWebSocket(/\/socket/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => server.send(message))
    server.onMessage((message) => setTimeout(() => ws.send(message), 500))
  })
  await phone.goto(`/auth/login?as=${b}`)
  await expect.poll(() => rowTitles(phone)).toEqual(['Kids', 'Homework', 'Essay'])
  const offline = phone.locator('aside').getByRole('img', { name: 'Offline' })
  await phone.context().setOffline(true)
  await expect(offline).toBeVisible()

  // While the phone is away, Essay moves into Kids and Alice takes Homework back.
  await drag(desk, row(desk, 'Essay'), row(desk, 'Kids'))
  await shareWith(alice, b)
  await expect(row(desk, 'Homework')).toHaveCount(0)
  await phone.context().setOffline(false)
  await expect(row(phone, 'Homework')).toHaveCount(0)
  // Long enough for a place written by the phone to reach the desk.
  await phone.waitForTimeout(1500)
  for (const page of [phone, desk]) {
    expect(await rowTitles(page)).toEqual(['Kids', 'Essay'])
    expect(await depth(page, 'Essay')).toBe(1)
  }
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

test('a finger dragging a note can still drop it inside another after the list scrolls', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 500 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  for (let n = 1; n <= 12; n++) {
    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByPlaceholder('Title')).toBeFocused()
    await page.keyboard.type(`Note ${n}`)
    await page.getByRole('button', { name: 'Back' }).click()
  }

  const grip = (await row(page, 'Note 12').locator('..').locator('[data-handle]').boundingBox())!
  const x = grip.x + grip.width / 2
  const cdp = await context.newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', grip.y + grip.height / 2)
  await touch('touchMove', grip.y + grip.height)
  await page.locator('nav').evaluate((nav) => nav.scrollBy(0, 200))
  const to = (await row(page, 'Note 2').boundingBox())!
  for (let step = 0; step < 3; step++) await touch('touchMove', to.y + to.height / 2 + step)
  await touch('touchEnd')

  await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(1)
  expect(await depth(page, 'Note 12')).toBe(1)
})

test('a drop on a device that is behind leaves a move made on another device alone', async ({ browser }) => {
  const name = `alice-${uid()}`
  const desk = await signIn(browser, name)
  for (const title of ['P', 'X', 'Y']) await newNote(desk, title)
  const phone = await signIn(browser, name)
  await expect(row(phone, 'P')).toBeVisible()
  expect(await rowTitles(phone)).toEqual(['Y', 'X', 'P'])

  await phone.context().setOffline(true)
  await expect(phone.locator('aside').getByRole('img', { name: 'Offline' })).toBeVisible()
  await drag(desk, row(desk, 'X'), row(desk, 'P'))
  expect(await depth(desk, 'X')).toBe(1)
  await drag(phone, row(phone, 'Y'), row(phone, 'P'), 'bottom')
  expect(await rowTitles(phone)).toEqual(['X', 'P', 'Y'])
  await phone.context().setOffline(false)

  for (const page of [desk, phone]) {
    await expect.poll(() => rowTitles(page)).toEqual(['P', 'X', 'Y'])
    expect(await depth(page, 'X')).toBe(1)
  }
})
