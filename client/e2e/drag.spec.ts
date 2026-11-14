import { expect, test, type Browser, type Page } from '@playwright/test'
import { newNote, row, signIn, uid } from './helpers'

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

// Playwright has no touch drag, so the touches go straight to Chrome.
async function touchDrag(page: Page, text: string, onto: string, at: number) {
  const { x, y0, y1 } = await path(page, text, onto, at)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: string, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', y0)
  for (let step = 1; step <= 6; step++) await touch('touchMove', y0 + ((y1 - y0) * step) / 6)
  await touch('touchEnd')
}

test('a line dropped on the bottom of the next line moves down one, and on the top of the line before moves up one', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'A', 'B', 'C', 'D')

  await drag(page, 'B', 'C', 0.85)
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'B', 'D'])
  await drag(page, 'D', 'B', 0.15)
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'D', 'B'])
  // Dropped where it already is, a line stays.
  await drag(page, 'A', 'C', 0.15)
  await expect.poll(() => shape(page)).toEqual(['A', 'C', 'D', 'B'])
})

test('a line dropped on the middle of another becomes its first child, and a mark shows where it will land', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'A', 'B', 'C', 'D')
  const mark = page.locator('.line-drop')

  await drag(page, 'D', 'B', 0.5, async () => {
    await expect(mark).toBeVisible()
    await expect(mark).toHaveAttribute('data-inside')
    await expect(page.locator('.prosemirror-dropcursor-block')).toBeHidden()
  })
  await expect(mark).toBeHidden()
  await expect.poll(() => shape(page)).toEqual(['A', 'B', '  D', 'C'])

  // Below the middle of a line with lines under it is where its first child goes.
  await drag(page, 'A', 'B', 0.85, async () => {
    await expect(mark).toHaveAttribute('data-inside')
  })
  await expect.poll(() => shape(page)).toEqual(['B', '  A', '  D', 'C'])

  // The top of a nested line is next to it, in its list.
  await drag(page, 'C', 'D', 0.15, async () => {
    await expect(mark).not.toHaveAttribute('data-inside')
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

  // A phone shows it after a tap, with no pointer hovering anywhere.
  const touch = await phone(browser)
  await newNote(touch, 'Mixed', 'Plain words')
  await touch.keyboard.press('Enter')
  await tool(touch, 'Checklist').click()
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
  const page = await phone(browser)
  await checklist(page, 'A', 'B', 'C')
  await expect(grip(page, 'A')).toHaveCSS('opacity', '1')

  await touchDrag(page, 'A', 'B', 0.85)
  await expect.poll(() => shape(page)).toEqual(['B', 'A', 'C'])
  await touchDrag(page, 'C', 'B', 0.5)
  await expect.poll(() => shape(page)).toEqual(['B', '  C', 'A'])
})

test('a tap on the grip of a line moves it to the end of the note picked for it, into the list there', async ({ browser }) => {
  const page = await phone(browser)
  await newNote(page, 'Groceries', 'Milk')
  await tool(page, 'Checklist').click()
  await page.getByRole('button', { name: 'Back' }).click()
  await checklist(page, 'Eggs', 'Bread')

  await grip(page, 'Eggs').tap()
  const dialog = page.getByRole('dialog', { name: 'Move to note' })
  await expect(dialog.getByRole('button', { name: 'Lists' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Groceries' }).tap()
  await expect(dialog).toBeHidden()
  await expect(body(page).locator('li p')).toHaveText(['Bread'])

  await page.getByRole('button', { name: 'Back' }).click()
  await row(page, 'Groceries').click()
  await expect(body(page).locator('li p')).toHaveText(['Milk', 'Eggs'])
  await expect(body(page).locator('ul')).toHaveCount(1)
})

test('dropping a line on a note in the tree moves it there', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Packing', 'Socks')
  await checklist(page, 'Charger', 'Bread')

  // Playwright's dragTo jumps in one move, which Chrome never turns into a drop.
  const from = (await grip(page, 'Charger').boundingBox())!
  const to = (await row(page, 'Packing').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(from.x + ((to.x + 40 - from.x) * step) / 6, from.y + ((to.y + to.height / 2 - from.y) * step) / 6)
  }
  await page.mouse.up()
  await expect(body(page).locator('li p')).toHaveText(['Bread'])
  await row(page, 'Packing').click()
  await expect(body(page).locator('p').first()).toHaveText('Socks')
  await expect(body(page).locator('li p')).toHaveText(['Charger'])
})
