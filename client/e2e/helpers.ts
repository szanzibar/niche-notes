import { expect, type Browser, type Locator, type Page } from '@playwright/test'

export const uid = () => Math.random().toString(36).slice(2, 8)

// The dev login capitalizes the name the same way.
export const display = (name: string) => name[0].toUpperCase() + name.slice(1).toLowerCase()

// Each call is its own browser profile, so several people can be signed in at once.
export async function signIn(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/auth/login?as=${name}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  return page
}

export async function newNote(page: Page, title: string, body?: string) {
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type(title)
  if (body) {
    await page.keyboard.press('Enter')
    await expect(page.locator('.editor-body')).toBeFocused()
    await page.keyboard.type(body)
  }
}

export const row = (page: Page, title: string) =>
  page.locator('aside').getByRole('button', { name: new RegExp(`^${title}(\\s|$)`) })

export async function shareWith(page: Page, name: string) {
  await page.getByRole('button', { name: /^Share$|^Shared with/ }).click()
  await page.getByRole('listitem').filter({ hasText: display(name) }).getByRole('button').click()
  await page.getByRole('button', { name: 'Done' }).click()
}

export async function typeAtEnd(page: Page, text: string) {
  await page.locator('.editor-body').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

// `edge` picks the drop zone: the top or bottom 30% of a row means "next to it", the middle "inside".
export async function drag(page: Page, source: Locator, target: Locator, edge: 'top' | 'middle' | 'bottom' = 'middle') {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  const y = edge === 'top' ? to.y + to.height * 0.12 : edge === 'bottom' ? to.y + to.height * 0.88 : to.y + to.height / 2
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, y, { steps: 12 })
  await page.mouse.move(to.x + to.width / 2 + 1, y, { steps: 2 })
  await page.mouse.up()
  // dnd-kit swallows a click that lands within a few ms of the drop.
  await page.waitForTimeout(150)
}

export const rowTitles = (page: Page) =>
  page.locator('aside [aria-roledescription="draggable"] > span:first-child').allTextContents()
