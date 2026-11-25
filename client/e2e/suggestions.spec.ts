import { expect, type Page } from '@playwright/test'
import { lineEnd, newNote, row, shareWith, signIn, test, uid } from './helpers'

const body = (page: Page) => page.locator('.editor-body')
const box = (page: Page) => page.getByRole('group', { name: 'Suggestions' })
// Ticks every task with that text, since a task is only offered once it has been checked twice.
async function check(page: Page, text: string) {
  for (const box of await page.getByRole('checkbox', { name: `Task item checkbox for ${text}` }).all()) await box.check()
}

async function checklist(page: Page, first: string, ...rest: string[]) {
  await newNote(page, 'Shopping', first)
  await page.getByRole('button', { name: 'Task list', exact: true }).click()
  for (const line of rest) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
}

// Chromium tells ProseMirror of a click on the next frame, so a key sent at once would act where the caret was.
async function newLine(page: Page, text: string) {
  await body(page).locator('li p').last().click()
  await page.waitForTimeout(60)
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
}

test('typing on a task offers the ones checked twice, and a pick makes the line that task', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Oat milk', 'Oat milk', 'Eggs', 'Oats')
  await check(page, 'Oat milk')
  await check(page, 'Oats')

  await newLine(page, 'm')
  await expect(box(page)).toBeHidden()
  await page.keyboard.type('i')
  await expect(box(page).getByRole('button')).toHaveText(['Oat milk'])
  await box(page).getByRole('button', { name: 'Oat milk' }).click()
  await page.keyboard.type(', 1l')
  await expect(body(page).locator('li p')).toHaveText(['Oat milk', 'Oat milk', 'Eggs', 'Oats', 'Oat milk, 1l'])
  await expect(box(page)).toBeHidden()

  // Enter alone starts a new line, as it always does.
  await newLine(page, 'oa')
  // Oats was checked once, so it isn't offered.
  await expect(box(page).getByRole('button')).toHaveText(['Oat milk'])
  await page.keyboard.press('Enter')
  await expect(box(page)).toBeHidden()
  await page.keyboard.type('oa')
  await page.keyboard.press('ArrowDown')
  await expect(box(page).getByRole('button', { name: 'Oat milk' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(body(page).locator('li p')).toHaveText(['Oat milk', 'Oat milk', 'Eggs', 'Oats', 'Oat milk, 1l', 'oa', 'Oat milk'])

  // Picking a task whose words contain a date keeps them as words.
  await newLine(page, 'Sunday roast')
  await page.keyboard.press('Escape')
  await newLine(page, 'Sunday roast')
  await page.keyboard.press('Escape')
  await check(page, 'Sunday roast')
  await newLine(page, 'ro')
  await box(page).getByRole('button', { name: 'Sunday roast' }).click()
  await page.keyboard.press('Enter')
  await expect(body(page).locator('li[data-due]')).toHaveCount(0)
  await expect(body(page).locator('li p').getByText('Sunday roast', { exact: true })).toHaveCount(3)
})

test('Tab takes the first suggestion or the one the arrows chose, and indents again after Escape', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Oat milk', 'Oat milk', 'Oats', 'Oats', 'Oat bran', 'Oat bran')
  await check(page, 'Oat milk')
  await check(page, 'Oats')
  await check(page, 'Oat bran')
  const lines = body(page).locator('li p')
  const nested = body(page).locator('li li p')

  await newLine(page, 'oa')
  await page.keyboard.press('Escape')
  await expect(box(page)).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(nested).toHaveText(['oa'])
  await page.keyboard.type('t')
  await expect(box(page).getByRole('button')).toHaveText(['Oat milk', 'Oats', 'Oat bran'])
  await page.keyboard.press('Shift+Tab')
  await expect(nested).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(lines.last()).toHaveText('Oat milk')
  await expect(nested).toHaveCount(0)
  await expect(box(page)).toBeHidden()

  await newLine(page, 'oa')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Tab')
  await expect(lines).toHaveText(['Oat milk', 'Oat milk', 'Oats', 'Oats', 'Oat bran', 'Oat bran', 'Oat milk', 'Oat bran'])
  await expect(nested).toHaveCount(0)
})

test('a task Delete checked removed twice is offered, most recently deleted first, and one deleted once or still to do is not', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Brown bread', 'Brown bread', 'Brown rice', 'Brown sugar', 'Brown sugar', 'Jam')
  await check(page, 'Brown bread')
  await check(page, 'Brown rice')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete checked' }).click()
  await check(page, 'Brown sugar')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete checked' }).click()
  await expect(body(page).locator('li p')).toHaveText(['Jam'])

  await newLine(page, 'br')
  await expect(box(page).getByRole('button')).toHaveText(['Brown sugar', 'Brown bread'])
  await box(page).getByRole('button', { name: 'Brown sugar' }).click()
  await newLine(page, 'br')
  await expect(box(page).getByRole('button')).toHaveText(['Brown bread'])
})

test('everyone on the note gets the same suggestions', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await checklist(alice, 'Coffee beans', 'Coffee beans', 'Tea')
  await check(alice, 'Coffee beans')
  await shareWith(alice, b)

  await row(bob, 'Shopping').click()
  await expect(body(bob).locator('li p')).toHaveText(['Coffee beans', 'Coffee beans', 'Tea'])
  await newLine(bob, 'be')
  await expect(box(bob).getByRole('button')).toHaveText(['Coffee beans'])
})

test('the box sits right under its line after Enter in the middle of a list, and follows it when a line above folds away', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await checklist(page, 'Milk', 'Milk', 'Eggs', 'Bread', 'Jam')
  await check(page, 'Milk')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('group', { name: 'Checked tasks' }).getByRole('button', { name: 'Hide' }).click()
  await expect(body(page).locator('li p:visible')).toHaveText(['Eggs', 'Bread', 'Jam'])
  const gap = async () => {
    const line = (await body(page).locator('li p').getByText('mi', { exact: true }).boundingBox())!
    return (await box(page).boundingBox())!.y - (line.y + line.height)
  }

  await check(page, 'Eggs')
  await body(page).locator('li p').getByText('Bread', { exact: true }).click()
  await page.waitForTimeout(60)
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type('mi')
  await expect(box(page)).toBeVisible()
  await expect.poll(gap).toBeGreaterThanOrEqual(0)
  expect(await gap()).toBeLessThan(16)
  // Eggs folds away once the note is still, and the line moves up under the box.
  await expect(body(page).locator('li p:visible')).toHaveText(['Bread', 'mi', 'Jam'])
  await page.waitForTimeout(400)
  expect(await gap()).toBeGreaterThanOrEqual(0)
  expect(await gap()).toBeLessThan(16)
})
