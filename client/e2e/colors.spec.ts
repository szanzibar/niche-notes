import { expect, type Browser, type Page } from '@playwright/test'
import { newNote, row, shareWith, signIn, test, uid } from './helpers'

const accent = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
const stripe = (page: Page, title: string) => row(page, title).locator('..').locator('span[style*="background"]')

async function scheme(page: Page, name: 'Default' | 'Confetti') {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name, exact: true }).first().click()
  await page.getByRole('button', { name: 'Close' }).click()
}

async function pick(page: Page, color: string) {
  await page.getByRole('button', { name: 'Note color' }).click()
  await page.getByRole('button', { name: color, exact: true }).click()
  await page.keyboard.press('Escape')
}

const phone = async (browser: Browser, name: string) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=${name}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  return page
}

test('Confetti gives every note a color the app wears while it is open, and a picked color wins', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Garden')
  await newNote(page, 'Groceries')
  await expect(stripe(page, 'Garden')).toHaveCount(0)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Confetti' }).click()
  await expect(page.getByRole('button', { name: 'Coral' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(stripe(page, 'Garden')).toHaveCount(1)
  await expect(stripe(page, 'Groceries')).toHaveCount(1)
  const own = await stripe(page, 'Groceries').evaluate((el) => getComputedStyle(el).backgroundColor)
  await expect(page.locator('main > header')).toHaveCSS('background-color', own)

  await pick(page, 'Lime')
  await expect.poll(() => accent(page)).toBe('#B5E853')
  await expect(stripe(page, 'Groceries')).toHaveCSS('background-color', 'rgb(181, 232, 83)')

  // Back on Default, only the picked note keeps a color.
  await scheme(page, 'Default')
  await expect(stripe(page, 'Garden')).toHaveCount(0)
  await expect(stripe(page, 'Groceries')).toHaveCount(1)
  await expect.poll(() => accent(page)).toBe('#B5E853')
  await row(page, 'Garden').click()
  await expect.poll(() => accent(page)).toBe('#FF4F3B')
})

test("a note's color is its viewer's own, so a shared note shows each person their colors", async ({ browser }) => {
  const alice = await signIn(browser, `alice-${uid()}`)
  const name = `bob-${uid()}`
  await signIn(browser, name)
  await newNote(alice, 'Party')
  await shareWith(alice, name)
  await pick(alice, 'Lime')
  await expect.poll(() => accent(alice)).toBe('#B5E853')

  const bob = await signIn(browser, name)
  await row(bob, 'Party').click()
  await expect(bob.getByPlaceholder('Title')).toHaveValue('Party')
  expect(await accent(bob)).toBe('#FF4F3B')
  await expect(stripe(bob, 'Party')).toHaveCount(0)
})

test('under Confetti with no note open, the app wears the last note opened on the device, or the top note', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await phone(browser, name)
  await newNote(page, 'Older')
  await pick(page, 'Yellow')
  await page.getByRole('button', { name: 'Back' }).click()
  await newNote(page, 'Newer')
  await pick(page, 'Sky')
  await page.getByRole('button', { name: 'Back' }).click()
  await scheme(page, 'Confetti')

  await row(page, 'Older').click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect.poll(() => accent(page)).toBe('#FFD23F')

  const fresh = await phone(browser, name)
  await expect.poll(() => accent(fresh)).toBe('#6CC6FF')
})
