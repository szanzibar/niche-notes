import { expect, type Page } from '@playwright/test'
import { lineEnd, newNote, row, rowTitles, signIn, test, uid } from './helpers'

test('a new note starts in the title, Enter moves to the body, and it survives a reload', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await expect(row(page, 'Groceries')).toBeVisible()

  await page.reload()
  await row(page, 'Groceries').click()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Groceries')
  await expect(page.locator('.editor-body')).toContainText('milk')
})

test('a note this device has not opened yet opens at the end of its text, ready to type', async ({ browser }) => {
  const name = `alice-${uid()}`
  await newNote(await signIn(browser, name), 'Journal', 'one')
  const page = await signIn(browser, name)
  await row(page, 'Journal').click()
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type(' two')
  await expect(page.locator('.editor-body')).toContainText('one two')
})

test('a note reopens where this device left the cursor, even after a reload and a line added above it', async ({
  browser,
}) => {
  // The editor takes a click or an arrow key a moment later. A new saved cursor shows it has.
  const saved = (p: Page) =>
    p.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cursor:'))?.[1])
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await newNote(page, 'Long', 'top')
  for (const line of ['first', 'second']) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  const typed = await saved(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press(lineEnd)
  await expect.poll(() => saved(page)).not.toBe(typed)
  await page.goto('/')

  const phone = await signIn(browser, name)
  await row(phone, 'Long').click()
  await expect(phone.locator('.editor-body p')).toHaveText(['top', 'first', 'second'])
  const opened = await saved(phone)
  await phone.locator('.editor-body p').first().click()
  await phone.keyboard.press(lineEnd)
  await expect.poll(() => saved(phone)).not.toBe(opened)
  await phone.keyboard.press('Enter')
  await phone.keyboard.type('zero')

  // Search finds the new line once it has reached this device.
  const search = page.getByPlaceholder('Search notes')
  await expect(async () => {
    await search.fill('')
    await search.fill('zero')
    await page.getByRole('option').filter({ hasText: 'Long' }).click({ timeout: 500 })
  }).toPass()
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('!')
  // The phone's caret and name sit on its own line.
  await expect(page.locator('.editor-body p')).toHaveText(['top', /zero/, 'first!', 'second'])
})

test('Tab from the title goes to the body, not to Share', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Tabbed')
  await page.keyboard.press('Tab')
  await expect(page.locator('.editor-body')).toBeFocused()
})

test('checked items are crossed out, but not their children or the line typed after them', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Shopping')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Task list' }).click()
  await page.keyboard.type('eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.type('brown')
  await page.getByRole('button', { name: 'Indent' }).click()
  await page.locator('.editor-body input[type="checkbox"]').first().click()

  const struck = (text: string) =>
    page.locator('.editor-body p', { hasText: text }).evaluate((p) => getComputedStyle(p).textDecorationLine)
  await expect(page.locator('.editor-body li[data-checked="true"] > div > p')).toHaveText('eggs')
  expect(await struck('eggs')).toBe('line-through')
  expect(await struck('brown')).toBe('none')

  await page.locator('.editor-body p', { hasText: 'eggs' }).click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type('milk')
  await expect(page.locator('.editor-body li[data-checked="true"]')).toHaveCount(1)
  expect(await struck('milk')).toBe('none')
})

test('a note opened while another is open takes its place, so back returns to the list', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'First')
  await newNote(page, 'Second')
  await row(page, 'First').click()
  await page.goBack()
  await expect(page.getByText('Pick a note, or make a new one.')).toBeVisible()
})

test('Recent leaves out the open note, so its top row goes back to the note before', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries')
  await newNote(page, 'Chores')
  await page.getByRole('button', { name: 'Recent', exact: true }).click()
  const recent = page.getByRole('list', { name: 'Recent' }).getByRole('button')
  await expect(recent).toHaveText(['Groceries'])
  await recent.first().click()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Groceries')
  await expect(recent).toHaveText(['Chores'])
})

test('deleting a note with notes under it asks whether they go too, and notes deleted together come back together', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Trip')
  await page.getByRole('button', { name: 'New note inside' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Socks')
  await row(page, 'Socks').locator('..').getByRole('button', { name: 'New note inside' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Wool')
  await expect.poll(() => rowTitles(page)).toEqual(['Trip', 'Socks', 'Wool'])

  // Alone, the notes under it move up, newer than it, so above it once it is back.
  await row(page, 'Trip').click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await expect(page.getByRole('button', { name: 'With its 2 notes' })).toBeVisible()
  await page.getByRole('button', { name: 'Just this note' }).click()
  await expect.poll(() => rowTitles(page)).toEqual(['Socks', 'Wool'])
  await page.getByRole('button', { name: 'Trash (1)' }).click()
  await page.locator('aside').getByRole('button', { name: 'Restore' }).click()
  await expect.poll(() => rowTitles(page)).toEqual(['Socks', 'Wool', 'Trip'])

  // With its notes, they are one entry in the trash and come back where they were.
  await row(page, 'Socks').click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await page.getByRole('button', { name: 'With its 1 note' }).click()
  await expect.poll(() => rowTitles(page)).toEqual(['Trip'])
  await expect(page.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
  await page.locator('aside').getByRole('button', { name: 'Restore' }).click()
  await expect.poll(() => rowTitles(page)).toEqual(['Socks', 'Wool', 'Trip'])
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Wool')).toBeHidden()

  await row(page, 'Socks').click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await page.getByRole('button', { name: 'With its 1 note' }).click()
  await page.locator('aside').getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByRole('button', { name: /^Trash/ })).toHaveCount(0)
  await page.reload()
  await expect.poll(() => rowTitles(page)).toEqual(['Trip'])
  await page.getByPlaceholder('Search notes').fill('Wool')
  await expect(page.getByText('No matches')).toBeVisible()
})

test('the trash sweep leaves a note alone while its trash date is unknown', async ({ browser }) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  await newNote(page, 'Keep', 'precious')
  const id = new URL(page.url()).pathname.split('/n/')[1]
  // At launch the sweep reads each note's cached meta before the note loads, and a reload between a delete's two
  // writes leaves a copy that says deleted without a date.
  await page.evaluate(
    async ([id, storeModule, treeModule]) => {
      const { store } = await import(storeModule)
      const { purgeExpired } = await import(treeModule)
      store.meta.set(id, { ...store.meta.get(id), deleted: true })
      await purgeExpired()
    },
    [id, '/src/sync/store.ts', '/src/sync/tree.ts'],
  )

  const other = await signIn(browser, name)
  await row(other, 'Keep').click()
  await expect(other.locator('.editor-body')).toContainText('precious')
})

test('+ on a row makes a nested note', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Parent')
  await page.getByRole('button', { name: 'New note inside' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await expect(page.getByPlaceholder('Title')).toHaveValue('')
  await page.keyboard.type('Child')
  await expect(row(page, 'Child')).toBeVisible()

  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Child')).toBeHidden()
})

test('undo history survives leaving and reopening a note', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'First', 'milk')
  await newNote(page, 'Second')
  await row(page, 'First').click()
  await expect(page.locator('.editor-body')).toContainText('milk')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.editor-body')).not.toContainText('milk')
})

test('delete goes to the trash without asking; a trashed note is read-only until restored or emptied', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Doomed', 'keep me')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await expect(row(page, 'Doomed')).toHaveCount(0)
  await expect(page.getByText('No notes yet')).toBeVisible()

  await page.getByRole('button', { name: 'Trash (1)' }).click()
  await page.getByRole('button', { name: 'Doomed' }).click()
  await expect(page.getByRole('button', { name: 'Doomed' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('main').getByRole('button', { name: 'Restore' })).toBeVisible()
  await expect(page.locator('.editor-body')).toContainText('keep me')
  await expect(page.getByRole('button', { name: 'Task list' })).toHaveCount(0)
  await page.locator('.editor-body').click()
  await page.keyboard.type('zzz')
  await expect(page.locator('.editor-body')).not.toContainText('zzz')

  await page.locator('main').getByRole('button', { name: 'Restore' }).click()
  await expect(row(page, 'Doomed')).toBeVisible()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Doomed')
  await expect(page.getByRole('button', { name: 'Task list' })).toBeVisible()

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await page.locator('aside').getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByRole('button', { name: /^Trash/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No notes yet')).toBeVisible()
})

test("beside the tree, the note's header and toolbar line up with the tree's header and footer, even when the toolbar scrolls", async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Shopping', 'milk')
  const edges = () =>
    page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const toolbar = document.querySelector('[aria-label="Task list"]')!.closest('.border-t-2')!.getBoundingClientRect()
      return [box('header:not(.note-header)').bottom - box('.note-header').bottom, box('footer').top - toolbar.top]
    })
  for (const density of ['compact', 'default', 'large']) {
    await page.evaluate((density) => document.documentElement.setAttribute('data-density', density), density)
    expect(await edges(), density).toEqual([0, 0])
  }
  const left = page.getByLabel('Scroll tools left')
  const right = page.getByLabel('Scroll tools right')
  await expect(left).toBeHidden()
  await expect(right).toBeHidden()

  await page.setViewportSize({ width: 800, height: 720 })
  const tools = page.locator('.overflow-x-auto').filter({ has: page.getByLabel('Task list') })
  // Headless Chromium hides scrollbars, so a desktop one taking room only shows as the style.
  expect(await tools.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none')
  expect(await edges()).toEqual([0, 0])
  await expect(right).toBeVisible()
  await expect(left).toBeHidden()

  await tools.hover()
  for (let notch = 0; notch < 3; notch++) await page.mouse.wheel(0, 50)
  await expect.poll(() => tools.evaluate((el) => el.scrollLeft)).toBe(150)
  await expect(left).toBeVisible()
  await right.click()
  await right.click()
  await expect(right).toBeHidden()
  await left.click()
  await expect(right).toBeVisible()
})

test('Ctrl or ⌘ and N start a new note on top from inside another, with the cursor in its title', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await expect(page.getByRole('button', { name: 'New note', exact: true })).toHaveAttribute('title', 'New note (Ctrl+N)')

  await page.keyboard.press('Control+n')
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await expect(page.getByPlaceholder('Title')).toHaveValue('')
  await page.keyboard.type('Hardware')
  await expect.poll(() => rowTitles(page)).toEqual(['Hardware', 'Groceries'])
})
