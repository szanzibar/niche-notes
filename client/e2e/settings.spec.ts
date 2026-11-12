import { expect, test, type Page } from '@playwright/test'
import { signIn, uid } from './helpers'

const accent = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test('the highlight color is a setting that follows the user to every device', async ({ browser }) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  expect(await accent(page)).toBe('#FF4F3B')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Blue' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect.poll(() => accent(page)).toBe('#2F6BFF')

  await page.reload()
  await expect.poll(() => accent(page)).toBe('#2F6BFF')
  const other = await signIn(browser, name)
  await expect.poll(() => accent(other)).toBe('#2F6BFF')
})

test('the highlight colors sit on one row, even on a phone', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Settings' }).click()
  const colors = ['Coral', 'Blue', 'Green', 'Purple', 'Orange', 'Pink', 'Teal']
  const tops = await Promise.all(colors.map(async (name) => (await page.getByRole('button', { name }).boundingBox())!.y))
  expect(new Set(tops).size).toBe(1)
})

test('appearance follows the device until told otherwise', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => background(page)).toBe('rgb(20, 20, 20)')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Light' }).click()
  await expect.poll(() => background(page)).toBe('rgb(250, 250, 248)')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => background(page)).toBe('rgb(20, 20, 20)')
  await page.reload()
  await expect.poll(() => background(page)).toBe('rgb(20, 20, 20)')
})

test('density scales the whole interface and stays on this device', async ({ browser }) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  const rootSize = (p = page) => p.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  expect(await rootSize()).toBe('16px')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Compact' }).click()
  await expect.poll(() => rootSize()).toBe('14px')
  await page.getByRole('button', { name: 'Large' }).click()
  await page.getByRole('button', { name: 'Blue' }).click()
  await expect.poll(() => rootSize()).toBe('18px')
  await page.reload()
  await expect.poll(() => rootSize()).toBe('18px')

  // The color arriving shows the other device has the settings.
  const other = await signIn(browser, name)
  await expect.poll(() => accent(other)).toBe('#2F6BFF')
  expect(await rootSize(other)).toBe('16px')
})
