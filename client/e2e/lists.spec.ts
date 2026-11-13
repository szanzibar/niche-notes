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

test('a note set to hide checked lines hides each one a moment after it is checked, on every device', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await checklist(page, 'Milk', 'Eggs')
  const line = (text: string, on = page) => body(on).locator('li p').getByText(text, { exact: true })
  await page.getByRole('button', { name: 'Checked lines' }).click()
  const hide = page.getByRole('button', { name: 'Hide checked' })
  await hide.click()
  await expect(hide).toHaveAttribute('aria-pressed', 'true')

  await line('Eggs').click()
  await page.getByRole('checkbox', { name: 'Task item checkbox for Eggs' }).click()
  await expect(line('Eggs')).toBeVisible()
  await expect(line('Eggs')).toBeHidden()
  // The cursor left the checked line for the end of the one above.
  await page.keyboard.type(' and bread')
  await expect(line('Milk and bread')).toBeVisible()

  // A line checked before the note opened is hidden from the start.
  const other = await signIn(browser, name)
  await row(other, 'Lists').click()
  await expect(line('Milk and bread', other)).toBeVisible()
  expect(await line('Eggs', other).isVisible()).toBe(false)

  await page.getByRole('button', { name: 'Checked lines' }).click()
  await hide.click()
  await expect(line('Eggs')).toBeVisible()
})

test('lines ticked in a row stay put until the note is still, then leave together', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs', 'Bread')
  const shown = body(page).locator('li p:visible')
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Hide checked' }).click()

  await page.getByRole('checkbox', { name: 'Task item checkbox for Milk' }).check()
  await page.waitForTimeout(1200)
  await page.getByRole('checkbox', { name: 'Task item checkbox for Eggs' }).check()
  await page.waitForTimeout(1200)
  // Milk was ticked long enough ago to leave, but the tick on Eggs kept the note moving.
  await expect(shown).toHaveText(['Milk', 'Eggs', 'Bread'])
  await expect(shown).toHaveText(['Bread'])
})

test('a note set to delete checked lines hides them, then deletes them the next time it opens', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs')
  const hide = page.getByRole('button', { name: 'Hide checked' })
  const remove = page.getByRole('button', { name: 'Delete when checked' })
  // Both are offered as soon as the note has a checkbox, before anything is checked.
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await hide.click()
  await remove.click()
  await expect(hide).toHaveAttribute('aria-pressed', 'false')
  await expect(remove).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('checkbox', { name: 'Task item checkbox for Eggs' }).check()
  await expect(body(page).locator('li p:visible')).toHaveText(['Milk'])
  await expect(body(page).locator('li p')).toHaveText(['Milk', 'Eggs'])

  await page.goBack()
  await row(page, 'Lists').click()
  await expect(body(page).locator('li p')).toHaveText(['Milk'])
})

test('a checked line hides only once every line under it is checked, and only then goes with Delete checked', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Trip', 'Socks')
  await tool(page, 'Indent').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Charger')
  const box = (text: string) => page.getByRole('checkbox', { name: `Task item checkbox for ${text}` })
  const shown = body(page).locator('li p:visible')
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Hide checked' }).click()

  await box('Trip').check()
  await expect(body(page).locator('[data-lingering]')).toHaveCount(0)
  await expect(shown).toHaveText(['Trip', 'Socks', 'Charger'])
  await box('Socks').check()
  await expect(shown).toHaveText(['Trip', 'Charger'])

  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Delete checked' }).click()
  await expect(body(page).locator('li p')).toHaveText(['Trip', 'Charger'])

  // The last line under Trip shows its check before both go.
  await box('Charger').check()
  await expect(shown).toHaveText(['Trip', 'Charger'])
  await expect(shown).toHaveCount(0)
})

test('the checked lines panel opens over the note and closes on a tap back in the note', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs')
  const top = async () => (await body(page).boundingBox())!.y
  const before = await top()
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await expect(page.getByRole('button', { name: 'Hide checked' })).toBeVisible()
  expect(await top()).toBe(before)

  await body(page).locator('li p').getByText('Eggs', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hide checked' })).toBeHidden()
})

test('Uncheck all clears every box in one step that Undo takes back', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Socks', 'Charger')
  for (const item of ['Socks', 'Charger']) await page.getByRole('checkbox', { name: `Task item checkbox for ${item}` }).check()
  const checked = body(page).locator('input[type="checkbox"]:checked')
  // Undo merges edits made within half a second of each other.
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Uncheck all' }).click()
  await expect(checked).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Uncheck all' })).toBeHidden()
  await tool(page, 'Undo').click()
  await expect(checked).toHaveCount(2)
})

test('Delete checked shows hidden checked lines for a moment, then removes them in one step that Undo takes back', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs', 'Bread')
  for (const item of ['Eggs', 'Bread']) await page.getByRole('checkbox', { name: `Task item checkbox for ${item}` }).check()
  const lines = body(page).locator('li p')
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Hide checked' }).click()
  await expect(body(page).locator('li p:visible')).toHaveText(['Milk'])
  // Undo merges edits made within half a second of each other.
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Delete checked' }).click()
  await expect(body(page).locator('li p:visible')).toHaveText(['Milk', 'Eggs', 'Bread'])
  await expect(lines).toHaveText(['Milk'])
  await expect(page.getByRole('button', { name: 'Hide checked' })).toHaveAttribute('aria-pressed', 'true')
  await tool(page, 'Undo').click()
  await expect(lines).toHaveText(['Milk', 'Eggs', 'Bread'])

  // With every line checked the list goes too, and the note still takes typing.
  await page.getByRole('checkbox', { name: 'Task item checkbox for Milk' }).check()
  await page.getByRole('button', { name: 'Checked lines' }).click()
  await page.getByRole('button', { name: 'Hide checked' }).click()
  await page.getByRole('button', { name: 'Delete checked' }).click()
  await expect(body(page).locator('ul')).toHaveCount(0)
  await body(page).click()
  await page.keyboard.type('done')
  await expect(body(page)).toHaveText('done')
})

test('a tick while typing moves the cursor to the ticked line, and a tick with the keyboard down keeps it down', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs', 'Bread')
  await page.getByRole('checkbox', { name: 'Task item checkbox for Milk' }).check()
  await page.keyboard.type(' and butter')
  await expect(body(page).locator('li p')).toHaveText(['Milk and butter', 'Eggs', 'Bread'])

  await body(page).blur()
  await page.getByRole('checkbox', { name: 'Task item checkbox for Eggs' }).check()
  await expect(body(page)).not.toBeFocused()
})

test('deleting the blank line between two checklists makes them one list', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Eggs')
  // The first Enter leaves the list and the second leaves a blank line.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
  await page.keyboard.type('Bread')
  await tool(page, 'Checklist').click()
  await expect(body(page).locator('> ul')).toHaveCount(2)

  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  // Chromium hands ProseMirror the caret move on the next frame.
  await page.waitForTimeout(60)
  await page.keyboard.press('Backspace')
  await expect(body(page).locator('> ul')).toHaveCount(1)
  await expect(body(page).locator('li p')).toHaveText(['Milk', 'Eggs', 'Bread'])
})

test('a checkbox carries no hidden text, which Android keyboards would read into the line', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk')
  await expect(body(page).locator('li > label')).toHaveText('')
  await expect(page.getByRole('checkbox', { name: 'Task item checkbox for Milk' })).toBeVisible()
})
