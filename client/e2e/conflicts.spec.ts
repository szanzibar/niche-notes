import { expect, test, type Browser, type Page } from '@playwright/test'
import { newNote, row, shareWith, signIn, uid } from './helpers'

const item = (page: Page, text: string) => page.locator('.editor-body li', { hasText: text })
const check = (page: Page, text: string) => item(page, text).locator('input[type="checkbox"]').click()
// A row's text without the other person's caret label.
const textOf = (page: Page, text: string) =>
  item(page, text)
    .locator('p')
    .evaluate((p) => [...p.childNodes].map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : '')).join(''))

// Chromium reports a moved caret to ProseMirror once per frame, so a key sent in the same instant
// acts where the caret was. A person cannot type that fast; a test can.
const settle = (page: Page) => page.waitForTimeout(60)
async function caretIn(page: Page, text: string, where: 'Home' | 'End') {
  await item(page, text).locator('p').click({ position: { x: 8, y: 10 } })
  await settle(page)
  await page.keyboard.press(where)
  await settle(page)
}

async function sharedChecklist(browser: Browser, lines: string[]) {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(alice, 'Shopping', lines[0])
  await alice.getByRole('button', { name: 'Checklist' }).click()
  for (const line of lines.slice(1)) {
    await alice.keyboard.press('Enter')
    await alice.keyboard.type(line)
  }
  await shareWith(alice, b)
  await row(bob, 'Shopping').click()
  await expect(bob.locator('.editor-body')).toContainText(lines[lines.length - 1])
  for (const page of [alice, bob]) {
    await page.context().setOffline(true)
    await expect(page.locator('main').getByText('Offline', { exact: true })).toBeVisible()
  }
  return { alice, bob }
}

async function reconnect(...pages: Page[]) {
  for (const page of pages) {
    await page.context().setOffline(false)
    await expect(page.getByText('Offline', { exact: true })).toHaveCount(0)
  }
}

test('two people shopping offline: ticks, new rows and edits to one row all merge', async ({ browser }) => {
  const { alice, bob } = await sharedChecklist(browser, ['milk', 'eggs', 'bread', 'butter'])

  // Both tick eggs; each ticks one more.
  await check(alice, 'milk')
  await check(alice, 'eggs')
  await check(bob, 'eggs')
  await check(bob, 'bread')

  // Each adds a row after butter.
  await caretIn(alice, 'butter', 'End')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('apples')
  await caretIn(bob, 'butter', 'End')
  await bob.keyboard.press('Enter')
  await bob.keyboard.type('pears')

  // Both change the butter row, at opposite ends.
  await caretIn(alice, 'butter', 'End')
  await alice.keyboard.type(' (salted)')
  await caretIn(bob, 'butter', 'Home')
  await bob.keyboard.type('organic ')

  await reconnect(alice, bob)
  for (const page of [alice, bob]) {
    await expect(page.locator('.editor-body li')).toHaveCount(6)
    for (const done of ['milk', 'eggs', 'bread']) await expect(item(page, done)).toHaveAttribute('data-checked', 'true')
    await expect(item(page, 'butter')).toHaveAttribute('data-checked', 'false')
    expect(await textOf(page, 'butter')).toBe('organic butter (salted)')
    await expect(item(page, 'apples')).toBeVisible()
    await expect(item(page, 'pears')).toBeVisible()
  }
  await Promise.all([alice.context().close(), bob.context().close()])
})

test('one person clears a row while the other adds to it: the clearing lands, the addition survives', async ({
  browser,
}) => {
  const { alice, bob } = await sharedChecklist(browser, ['milk', 'bread'])

  await caretIn(alice, 'bread', 'End')
  await alice.keyboard.press('Shift+Home')
  await settle(alice)
  await alice.keyboard.press('Backspace')
  await expect(alice.locator('.editor-body')).not.toContainText('bread')
  await caretIn(bob, 'bread', 'End')
  await bob.keyboard.type(' x2')

  await reconnect(alice, bob)
  for (const page of [alice, bob]) {
    await expect(page.locator('.editor-body li')).toHaveCount(2)
    await expect(page.locator('.editor-body')).not.toContainText('bread')
    await expect(page.locator('.editor-body')).toContainText('x2')
    await expect(item(page, 'milk')).toBeVisible()
  }
  await Promise.all([alice.context().close(), bob.context().close()])
})
