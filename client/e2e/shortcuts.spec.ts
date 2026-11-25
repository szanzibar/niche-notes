import { expect } from '@playwright/test'
import { newNote, signIn, test, uid } from './helpers'

const mac = process.platform === 'darwin'
const hold = mac ? 'Meta' : 'Control'
const mod = mac ? '⌘' : 'Ctrl+'

test('holding Ctrl or ⌘ shows each shortcut beside its button, and letting go hides them', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  const keys = page.locator('kbd.key-chip')
  const box = page.locator('.key-box')
  await expect(keys.first()).toBeHidden()
  await expect(box).toBeHidden()

  await page.keyboard.down(hold)
  await page.waitForTimeout(700)
  await expect(page.getByRole('button', { name: 'New note', exact: true }).locator('kbd')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Bold' }).locator('kbd')).toHaveCount(0)
  await expect(box).toBeVisible()
  await expect(box).toContainText(`${mod}Z`)
  await expect(box).toContainText('Undo, Redo')
  await expect(box).toContainText('Find in note')
  await expect(box).toContainText('Tick the task')
  await expect(box).toContainText('Move a line')
  await expect(box).toContainText('Indent, Outdent')
  await page.keyboard.up(hold)
  await expect(box).toBeHidden()
})

test('New note shows its shortcut in an app, where it works', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.assign(window, { nicheNotesApp: { version: 0 } }))
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  await page.keyboard.down(hold)
  await expect(page.getByRole('button', { name: 'New note', exact: true }).locator('kbd')).toHaveText(`${mod}N`)
  await expect(page.getByPlaceholder('Search notes').locator('..').locator('kbd')).toHaveText(`${mod}K`)
  await page.keyboard.up(hold)
})

test('a quick shortcut or a second key never shows them', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  const box = page.locator('.key-box')

  await page.keyboard.press('ControlOrMeta+c')
  await page.waitForTimeout(700)
  await expect(box).toBeHidden()

  await page.keyboard.down(hold)
  await page.waitForTimeout(700)
  await expect(box).toBeVisible()
  await page.keyboard.press('c')
  await expect(box).toBeHidden()
  await page.keyboard.up(hold)

  await page.keyboard.down(hold)
  await page.keyboard.down('Shift')
  await page.waitForTimeout(700)
  await expect(box).toBeHidden()
  await page.keyboard.up('Shift')
  await page.keyboard.up(hold)
})

test('a touch screen never shows them', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await expect(page.getByPlaceholder('Search notes')).toBeVisible()
  await page.keyboard.down(hold)
  await page.waitForTimeout(700)
  await expect(page.locator('html')).not.toHaveAttribute('data-keys')
  await expect(page.getByRole('button', { name: 'New note', exact: true }).locator('kbd')).toBeHidden()
  await page.keyboard.up(hold)
})
