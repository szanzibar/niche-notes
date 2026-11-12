import { expect, test, type Page } from '@playwright/test'
import { newNote, row, signIn, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const body = (page: Page) => page.locator('.editor-body')

// Which list buttons the bar shows as on.
async function pressed(page: Page) {
  const on: string[] = []
  for (const name of ['Checklist', 'Bullet list', 'Numbered list']) {
    if ((await tool(page, name).getAttribute('aria-pressed')) === 'true') on.push(name)
  }
  return on
}

async function checklist(page: Page, first: string, ...rest: string[]) {
  await newNote(page, 'Lists', first)
  await tool(page, 'Checklist').click()
  for (const line of rest) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
}

test('a bullet under a checkbox shows its bullet, and the bar marks only the line it is on', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Parent', 'Child')
  await tool(page, 'Indent').click()
  expect(await pressed(page)).toEqual(['Checklist'])

  await tool(page, 'Bullet list').click()
  const bullet = body(page).locator('ul[data-type="taskList"] ul:not([data-type]) > li')
  await expect(bullet).toHaveText('Child')
  expect(await bullet.evaluate((li) => getComputedStyle(li).display)).toBe('list-item')
  expect(await pressed(page)).toEqual(['Bullet list'])

  // Off again: a plain line under the parent. The parent keeps its checkbox.
  await tool(page, 'Bullet list').click()
  await expect(body(page).locator('li')).toHaveCount(1)
  await expect(body(page).locator('input[type="checkbox"]')).toHaveCount(1)
  expect(await pressed(page)).toEqual([])

  // And a checkbox of its own, nested under the parent, which still has its own.
  await tool(page, 'Checklist').click()
  await expect(body(page).locator('ul[data-type="taskList"] ul[data-type="taskList"] > li p')).toHaveText('Child')
  await expect(body(page).locator('input[type="checkbox"]')).toHaveCount(2)
  expect(await pressed(page)).toEqual(['Checklist'])
})

test('switching list type converts the whole level and leaves nested lists alone', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'One', 'Two', 'Sub')
  await tool(page, 'Indent').click()
  await page.keyboard.press('ArrowUp')

  await tool(page, 'Bullet list').click()
  await expect(body(page).locator('> ul:not([data-type]) > li')).toHaveCount(2)
  await expect(body(page).locator('input[type="checkbox"]')).toHaveCount(1)
  expect(await pressed(page)).toEqual(['Bullet list'])
})

test('Tab indents the bullet the cursor is on, not the checkbox above it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'One', 'Two', 'b1')
  await tool(page, 'Indent').click()
  await tool(page, 'Bullet list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('b2')
  await page.keyboard.press('Tab')
  await expect(body(page).locator('ul:not([data-type]) ul:not([data-type]) > li')).toHaveText('b2')
  await expect(body(page).locator('input[type="checkbox"]')).toHaveCount(2)
})

test('dragging a line by its handle moves it, with what is nested under it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'One', 'Two', 'Child')
  await tool(page, 'Indent').click()
  await page.keyboard.press('Enter')
  await tool(page, 'Outdent').click()
  await page.keyboard.type('Three')
  const line = (text: string) => body(page).locator('li p').getByText(text, { exact: true })

  await line('Two').hover()
  await page.locator('.drag-handle').dragTo(line('One'), { targetPosition: { x: 5, y: 2 } })
  await expect(body(page).locator('li p')).toHaveText(['Two', 'Child', 'One', 'Three'])
  await expect(body(page).locator('li li p')).toHaveText('Child')
})

test('on a touch screen a finger drags a line by its handle', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await checklist(page, 'One', 'Two')
  const line = (text: string) => body(page).locator('li p').getByText(text, { exact: true })

  // A phone's tap sends this mouse move. Tapping here would leave Playwright's mouse on the toolbar.
  await line('Two').hover()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  const from = (await page.locator('.drag-handle').boundingBox())!
  const to = (await line('One').boundingBox())!
  // Playwright has no touch drag, so the touches go straight to Chrome.
  const cdp = await context.newCDPSession(page)
  const touch = (type: string, x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const [x0, y0, x1, y1] = [from.x + from.width / 2, from.y + from.height / 2, to.x + 5, to.y + 2]
  await touch('touchStart', x0, y0)
  for (let step = 1; step <= 8; step++) await touch('touchMove', x0 + ((x1 - x0) * step) / 8, y0 + ((y1 - y0) * step) / 8)
  await touch('touchEnd')
  await expect(body(page).locator('li p')).toHaveText(['Two', 'One'])
})

test('the pointer crossing a nested checkbox on the way to the handle keeps the handle on that line', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Parent', 'Kid A')
  await tool(page, 'Indent').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Kid B')
  const line = (text: string) => body(page).locator('li p').getByText(text, { exact: true })

  await line('Kid B').hover()
  await page.getByRole('checkbox', { name: 'Task item checkbox for Kid B' }).hover()
  // The handle follows the pointer on the next frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.locator('.drag-handle').dragTo(line('Kid A'), { targetPosition: { x: 5, y: 2 } })
  await expect(body(page).locator('li p')).toHaveText(['Parent', 'Kid B', 'Kid A'])
  await expect(body(page).locator('li li p')).toHaveText(['Kid B', 'Kid A'])
})

test('a note set to hide checked lines hides each one as it is checked, on every device', async ({ browser }) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await checklist(page, 'Milk', 'Eggs')
  const line = (text: string, on = page) => body(on).locator('li p').getByText(text, { exact: true })
  const hide = page.getByRole('button', { name: 'Hide checked' })
  await hide.click()
  await expect(hide).toHaveAttribute('aria-pressed', 'true')

  await line('Eggs').click()
  await page.getByRole('checkbox', { name: 'Task item checkbox for Eggs' }).click()
  await expect(line('Eggs')).toBeHidden()
  // The cursor left the hidden line for the end of the one above.
  await page.keyboard.type(' and bread')
  await expect(line('Milk and bread')).toBeVisible()

  const other = await signIn(browser, name)
  await row(other, 'Lists').click()
  await expect(line('Milk and bread', other)).toBeVisible()
  await expect(line('Eggs', other)).toBeHidden()

  await hide.click()
  await expect(line('Eggs')).toBeVisible()
})

test('Uncheck all clears every box in one step that Undo takes back', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Socks', 'Charger')
  for (const item of ['Socks', 'Charger']) await page.getByRole('checkbox', { name: `Task item checkbox for ${item}` }).check()
  const checked = body(page).locator('input[type="checkbox"]:checked')
  // Undo merges edits made within half a second of each other.
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Uncheck all' }).click()
  await expect(checked).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Uncheck all' })).toBeHidden()
  await tool(page, 'Undo').click()
  await expect(checked).toHaveCount(2)
})

test('a checkbox carries no hidden text, which Android keyboards would read into the line', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk')
  await expect(body(page).locator('li > label')).toHaveText('')
  await expect(page.getByRole('checkbox', { name: 'Task item checkbox for Milk' })).toBeVisible()
})
