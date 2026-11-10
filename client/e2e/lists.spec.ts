import { expect, test, type Page } from '@playwright/test'
import { newNote, signIn, uid } from './helpers'

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
