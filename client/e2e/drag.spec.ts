import { expect, type Browser, type Page } from '@playwright/test'
import { newNote, phoneOnly, signIn, test, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const body = (page: Page) => page.locator('.editor-body')
const line = (page: Page, text: string) => body(page).locator('li p').getByText(text, { exact: true })
// A line's own grip, in the margin beside it. The deepest list item holding the text is the line's.
const grip = (page: Page, text: string) =>
  body(page).locator('li', { has: page.locator(`p:text-is("${text}")`) }).last().locator('.line-grip').first()

async function checklist(page: Page, first: string, ...rest: string[]) {
  await newNote(page, 'Lists', first)
  await tool(page, 'Checklist').click()
  for (const text of rest) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(text)
  }
}

// Each line's first text, indented two spaces per level.
const shape = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.editor-body li')].map((li) => {
      let depth = 0
      for (let up = li.parentElement; up; up = up.parentElement) if (up.tagName === 'LI') depth++
      return '  '.repeat(depth) + (li.querySelector(':scope > div > p, :scope > p')?.firstChild?.textContent ?? '')
    }),
  )

const phone = async (browser: Browser) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  return page
}

// Where a hand drags to: straight down or up the margin from the grip, `at` of the way down the other line's row.
async function path(page: Page, text: string, onto: string, at: number) {
  const from = (await grip(page, text).boundingBox())!
  const to = (await line(page, onto).boundingBox())!
  const x = from.x + from.width / 2
  return { x, y0: from.y + from.height / 2, y1: to.y + to.height * at }
}

// With `check`, looks at the note while the line is still held over its landing place.
async function drag(page: Page, text: string, onto: string, at: number, check?: () => Promise<void>) {
  const { x, y0, y1 } = await path(page, text, onto, at)
  await page.mouse.move(x, y0)
  await page.mouse.down()
  for (let step = 1; step <= 6; step++) await page.mouse.move(x, y0 + ((y1 - y0) * step) / 6)
  // Chrome passes on the last move with the next one, as a hand that holds still keeps doing.
  await page.mouse.move(x, y1 + 1)
  await check?.()
  await page.mouse.up()
}

// Playwright has no touch drag, so the touches go straight to Chrome. The finger holds the grip first, which lifts the
// line. `check` gets where the finger is.
async function touchDrag(page: Page, text: string, onto: string, at: number, check?: (y: number) => Promise<void>) {
  const { x, y0, y1 } = await path(page, text, onto, at)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', y0)
  await page.waitForTimeout(400)
  for (let step = 1; step <= 6; step++) await touch('touchMove', y0 + ((y1 - y0) * step) / 6)
  await check?.(y1)
  await touch('touchEnd')
}

// The row of the line a drop goes into is outlined, like the note a drop goes into in the tree.
const outlines = async (page: Page, text: string) => {
  const box = (await page.locator('.line-into').boundingBox())!
  const words = (await line(page, text).boundingBox())!
  return box.y <= words.y && box.y + box.height >= words.y + words.height
}

test('a line dropped on the bottom of the next line moves down one, and on the top of the line before moves up one', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'A', 'B', 'C', 'D')

  await drag(page, 'B', 'C', 0.85)
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'B', 'D'])
  // Beside a top-level line it goes into none, so nothing is outlined.
  await drag(page, 'D', 'B', 0.15, () => expect(page.locator('.line-into')).toBeHidden())
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'D', 'B'])
  // Dropped where it already is, a line stays.
  await drag(page, 'A', 'C', 0.15)
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'D', 'B'])
})

test('a line dropped on the middle of another becomes its first child, outlined while the mark shows where it lands', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'A', 'B', 'C', 'D')
  const mark = page.locator('.line-drop')

  // Into a line with nothing under it, the outline alone shows where it goes.
  await drag(page, 'D', 'B', 0.5, async () => {
    await expect(mark).toBeHidden()
    await expect(page.locator('.prosemirror-dropcursor-block')).toBeHidden()
    expect(await outlines(page, 'B')).toBe(true)
    // The line being dragged stays in place, dimmed, as a note does in the tree.
    await expect(body(page).locator('li', { has: page.locator('p:text-is("D")') }).last()).toHaveCSS('opacity', '0.4')
  })
  await expect(page.locator('.line-into')).toBeHidden()
  await expect(body(page).locator('li', { has: page.locator('p:text-is("D")') }).last()).toHaveCSS('opacity', '1')
  await expect(mark).toBeHidden()
  await expect.poll(() => shape(page)).toEqual(['A', 'B', '  D', 'C'])

  // Below the middle of a line with lines under it is where its first child goes, which the mark shows.
  await drag(page, 'A', 'B', 0.85, async () => {
    await expect(mark).toBeVisible()
    await expect(mark).toHaveAttribute('data-inside')
    expect(await outlines(page, 'B')).toBe(true)
  })
  await expect.poll(() => shape(page)).toEqual(['B', '  A', '  D', 'C'])

  // The top of a nested line is next to it, in its list, so the line above them is outlined.
  await drag(page, 'C', 'D', 0.15, async () => {
    await expect(mark).not.toHaveAttribute('data-inside')
    expect(await outlines(page, 'B')).toBe(true)
  })
  await expect.poll(() => shape(page)).toEqual(['B', '  A', '  C', '  D'])
})

test('dragging a line moves what is nested under it, and never into itself', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'One', 'Two', 'Child')
  await tool(page, 'Indent').click()
  await page.keyboard.press('Enter')
  await tool(page, 'Outdent').click()
  await page.keyboard.type('Three')

  await drag(page, 'Two', 'One', 0.15)
  await expect.poll(() => shape(page)).toEqual(['Two', '  Child', 'One', 'Three'])
  await drag(page, 'Two', 'Child', 0.5)
  await expect.poll(() => shape(page)).toEqual(['Two', '  Child', 'One', 'Three'])
})

test('a checkbox line dropped among bullets becomes a bullet', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Task')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Note')
  await tool(page, 'Bullet list').click()

  await drag(page, 'Task', 'Note', 0.85)
  await expect(body(page).locator('ul:not([data-type]) > li')).toHaveCount(2)
  await expect(body(page).locator('input[type="checkbox"]')).toHaveCount(0)
})

test('pointing at the margin beside a nested line shows the grip of that line, not of its parent', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Parent', 'Kid A')
  await tool(page, 'Indent').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Kid B')

  const at = (await grip(page, 'Kid B').boundingBox())!
  await page.mouse.move(at.x + 4, at.y + at.height / 2)
  await expect(grip(page, 'Kid B')).toHaveCSS('opacity', '1')
  await expect(grip(page, 'Parent')).toHaveCSS('opacity', '0')
  await expect(page.locator('.drag-handle')).toBeHidden()
  await drag(page, 'Kid B', 'Kid A', 0.15)
  await expect.poll(() => shape(page)).toEqual(['Parent', '  Kid B', '  Kid A'])
})

test('the floating handle shows for paragraphs and never over a list line', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Mixed', 'Plain words')
  await page.keyboard.press('Enter')
  await tool(page, 'Checklist').click()
  await page.keyboard.type('Task')
  const handle = page.locator('.drag-handle')

  const words = body(page).locator('p').getByText('Plain words')
  await words.hover()
  await expect(handle).toBeVisible()
  await line(page, 'Task').hover()
  await expect(handle).toBeHidden()
  // Back on the paragraph, it shows beside the paragraph, not where it was worked out while unseen.
  await words.hover()
  await expect(handle).toBeVisible()
  const [at, beside] = [(await handle.boundingBox())!, (await words.boundingBox())!]
  expect(Math.abs(at.x + at.width - beside.x)).toBeLessThan(8)
  expect(Math.abs(at.y - beside.y)).toBeLessThan(8)

  // A phone shows it after a tap, with no pointer hovering anywhere. A phone has no mouse, and a click here would have
  // Chrome move the pointer back to where it clicked after each tap, hiding the handle.
  const touch = await phone(browser)
  await touch.getByRole('button', { name: 'New note', exact: true }).tap()
  await expect(touch.getByPlaceholder('Title')).toBeFocused()
  await touch.keyboard.type('Mixed')
  await touch.keyboard.press('Enter')
  await expect(body(touch)).toBeFocused()
  await touch.keyboard.type('Plain words')
  await touch.keyboard.press('Enter')
  await tool(touch, 'Checklist').tap()
  await touch.keyboard.type('Task')
  await body(touch).locator('p').getByText('Plain words').tap()
  await expect(touch.locator('.drag-handle')).toBeVisible()
  await line(touch, 'Task').tap()
  await expect(touch.locator('.drag-handle')).toBeHidden()
  await body(touch).locator('p').getByText('Plain words').tap()
  await expect(touch.locator('.drag-handle')).toBeVisible()
})

test('on a touch screen every list line shows its grip, and a finger moves a line down one or under another', async ({
  browser,
}) => {
  phoneOnly()
  const page = await phone(browser)
  await checklist(page, 'A', 'B', 'C')
  await expect(grip(page, 'A')).toHaveCSS('opacity', '1')

  // The line rides as a box with its text, a row above the finger.
  const ghost = page.locator('.line-ghost')
  await touchDrag(page, 'A', 'B', 0.85, async (finger) => {
    await expect(ghost).toHaveText('A')
    const box = (await ghost.boundingBox())!
    expect(box.y + box.height).toBeLessThan(finger)
  })
  await expect(ghost).toBeHidden()
  await expect.poll(() => shape(page)).toEqual(['B', 'A', 'C'])
  await touchDrag(page, 'C', 'B', 0.5)
  await expect.poll(() => shape(page)).toEqual(['B', '  C', 'A'])
})

test('a finger that moves off a grip at once scrolls the note, and a tap on the grip ticks its line', async ({
  browser,
}) => {
  phoneOnly()
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 500 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  const lines = Array.from({ length: 20 }, (_, n) => `Line ${n + 1}`)
  await checklist(page, ...lines)
  await body(page).blur()
  await body(page).evaluate((el) => el.parentElement!.scrollTo(0, 0))
  const scrolled = () => body(page).evaluate((el) => el.parentElement!.scrollTop)

  const at = (await grip(page, 'Line 6').boundingBox())!
  const x = at.x + at.width / 2
  const cdp = await context.newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', at.y + at.height / 2)
  for (let step = 1; step <= 6; step++) await touch('touchMove', at.y + at.height / 2 - step * 30)
  // The finger stops before it lifts, so the note doesn't coast on under the next tap.
  await page.waitForTimeout(100)
  await touch('touchEnd')
  await expect.poll(scrolled).toBeGreaterThan(0)
  expect(await shape(page)).toEqual(lines)
  await expect(page.locator('.line-ghost')).toBeHidden()

  // A flick carries on after the finger lets go.
  const before = await scrolled()
  const flick = (await grip(page, 'Line 12').boundingBox())!
  await touch('touchStart', flick.y + flick.height / 2)
  for (let step = 1; step <= 4; step++) await touch('touchMove', flick.y + flick.height / 2 - step * 20)
  await touch('touchEnd')
  const released = await scrolled()
  expect(released).toBeGreaterThan(before)
  await expect.poll(scrolled).toBeGreaterThan(released + 20)
  const still = async () => {
    const was = await scrolled()
    await page.waitForTimeout(100)
    return was === (await scrolled())
  }
  await expect.poll(still).toBe(true)
  await body(page).evaluate((el) => el.parentElement!.scrollTo(0, 0))

  // A tick there leaves the keyboard down, as a tick on the box does.
  const box = body(page).locator('li', { has: page.locator('p:text-is("Line 8")') }).locator('input')
  await expect(box).not.toBeChecked()
  const tap = (await grip(page, 'Line 8').boundingBox())!
  await page.touchscreen.tap(tap.x + tap.width / 2, tap.y + tap.height / 2)
  await expect(box).toBeChecked()
  await expect(body(page)).not.toBeFocused()

  // So does a tap between the box and the line's text.
  const words = (await line(page, 'Line 9').boundingBox())!
  await page.touchscreen.tap(words.x - 3, words.y + words.height / 2)
  await expect(body(page).locator('li', { has: page.locator('p:text-is("Line 9")') }).locator('input')).toBeChecked()
  await expect(body(page)).not.toBeFocused()
})

test('a line dragged to the bottom of the note scrolls it, so it can land below what was in view', async ({ browser }) => {
  phoneOnly()
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 500 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  const lines = Array.from({ length: 20 }, (_, n) => `Line ${n + 1}`)
  await checklist(page, ...lines)
  await body(page).blur()
  await body(page).evaluate((el) => el.parentElement!.scrollTo(0, 0))
  const bottom = await body(page).evaluate((el) => el.parentElement!.getBoundingClientRect().bottom)
  const atEnd = () => body(page).evaluate(({ parentElement: note }) => note!.scrollTop + note!.clientHeight >= note!.scrollHeight - 1)

  const from = (await grip(page, 'Line 1').boundingBox())!
  const x = from.x + from.width / 2
  const cdp = await context.newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', from.y + from.height / 2)
  await page.waitForTimeout(400)
  for (let step = 1; step <= 6; step++) await touch('touchMove', from.y + ((bottom - 5 - from.y) * step) / 6)
  await expect.poll(atEnd).toBe(true)
  const to = (await line(page, 'Line 14').boundingBox())!
  for (let step = 0; step < 3; step++) await touch('touchMove', to.y + to.height * 0.85 + step)
  await touch('touchEnd')
  await expect.poll(() => shape(page)).toEqual([...lines.slice(1, 14), 'Line 1', ...lines.slice(14)])
})
