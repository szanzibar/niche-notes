import { expect, type Download, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { display, newNote, row, shareWith, signIn, test, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
// A stream, since a browser in Docker keeps the file on its side.
const read = async (download: Download) => Buffer.concat(await (await download.createReadStream()).toArray())

test('Export downloads a picked note as Markdown, and every note as a zip of folders like the tree', async ({
  browser,
}) => {
  const b = `bob-${uid()}`
  await signIn(browser, b)
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Old')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await newNote(page, 'Ideas?')
  await newNote(page, 'Ideas?')
  await newNote(page, 'Groceries', 'Errands')
  await page.keyboard.press('Enter')
  await tool(page, 'Task list').click()
  await page.keyboard.type('Call mom every week at 17:00')
  await page.keyboard.press('Enter')
  await page.keyboard.type('milk')
  await tool(page, 'Indent').click()
  await shareWith(page, b)
  await page.locator('.editor-body p').getByText('Call mom', { exact: true }).click()
  await tool(page, 'Assign').click()
  await tool(page, display(b)).click()
  const due = (await page.locator('.editor-body li[data-due]').getAttribute('data-due'))!
  const weekday = new Date(due).toLocaleDateString('en', { weekday: 'long' })
  await page.getByRole('button', { name: 'New note inside' }).first().click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Recipes')
  await page.keyboard.press('Enter')
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('Pancakes')
  const groceries = [
    'Errands',
    '',
    `- [ ] Call mom 📅 ${due.replace('T', ' ')} 🔁 every week on ${weekday} @${display(b)}`,
    '  - [ ] milk',
  ].join('\n')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Export note' }).click()
  await expect(page.getByText('Tap a note to export it')).toBeVisible()
  const picked = page.waitForEvent('download')
  await row(page, 'Groceries').click()
  const note = await picked
  expect(note.suggestedFilename()).toBe('Groceries.md')
  expect((await read(note)).toString()).toBe(groceries)
  await expect(page.getByText('Tap a note to export it')).toHaveCount(0)

  await page.getByRole('button', { name: 'Settings' }).click()
  const all = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all notes' }).click()
  const zip = await all
  // Playwright's WebKit names it Niche_Notes.zip.
  expect(zip.suggestedFilename()).toMatch(/^Niche[ _]Notes\.zip$/)
  const files = Object.fromEntries(Object.entries(unzipSync(await read(zip))).map(([path, data]) => [path, strFromU8(data)]))
  expect(files).toEqual({
    'Groceries.md': groceries,
    'Groceries/': '',
    'Groceries/Recipes.md': 'Pancakes',
    'Ideas-.md': '',
    'Ideas- (2).md': '',
  })
})
