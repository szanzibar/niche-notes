import { expect, test, type Page } from '@playwright/test'
import { newNote, signIn, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const line = (page: Page, text: string) =>
  page.locator('.editor-body li').filter({ has: page.locator('p').getByText(text, { exact: true }) })
const chip = (page: Page, text: string) => line(page, text).locator('> .due-chip')

// The day the app writes, from the same clock.
function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('a checkbox line takes a date from the Date box and shows it at its end', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  await expect(tool(page, 'Date')).toBeDisabled()
  await tool(page, 'Checklist').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bins')

  await page.locator('.editor-body p').getByText('Rent', { exact: true }).click()
  await tool(page, 'Date').click()
  await tool(page, 'Tomorrow').click()
  await expect(tool(page, 'Tomorrow')).toBeHidden()
  await expect(line(page, 'Rent')).toHaveAttribute('data-due', inDays(1))
  await expect(chip(page, 'Rent')).toHaveAttribute('data-label', 'Tomorrow')

  // A line split from a dated one starts without a date.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Water')
  await expect(line(page, 'Water')).not.toHaveAttribute('data-due')

  await page.locator('.editor-body p').getByText('Bins', { exact: true }).click()
  await tool(page, 'Date').click()
  await page.getByLabel('Day', { exact: true }).fill(inDays(-1))
  await page.getByLabel('Time', { exact: true }).fill('09:30')
  await expect(line(page, 'Bins')).toHaveAttribute('data-due', `${inDays(-1)}T09:30`)
  await expect(chip(page, 'Bins')).toHaveAttribute('data-label', 'Yesterday 9:30 AM')
  await expect(chip(page, 'Bins')).toHaveAttribute('data-overdue')

  // A tap on a date opens its box.
  await page.keyboard.press('Escape')
  await chip(page, 'Rent').click()
  await tool(page, 'Remove date').click()
  await expect(line(page, 'Rent')).not.toHaveAttribute('data-due')
})

test('ticking a repeating line moves it to its next date instead of checking it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Bins')
  await tool(page, 'Checklist').click()
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await tool(page, 'Date').click()
  await page.getByLabel('Repeat').selectOption('weekly')
  await expect(chip(page, 'Bins')).toHaveAttribute('data-label', '↻ Today')

  const box = page.getByRole('checkbox', { name: 'Task item checkbox for Bins' })
  await box.check()
  await expect(line(page, 'Bins')).toHaveAttribute('data-due', inDays(7))
  await expect(box).not.toBeChecked()
  await expect(line(page, 'Bins')).toHaveAttribute('data-checked', 'false')
})

test('the calendar link in Settings serves dated lines to a calendar app, without a session', async ({ browser, request }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await newNote(page, 'Chores', 'Pay rent')
  await tool(page, 'Checklist').click()
  await tool(page, 'Date').click()
  await tool(page, 'Tomorrow').click()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Copy calendar link' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  await expect
    .poll(async () => (await request.get(url)).text())
    .toContain(`DTSTART;VALUE=DATE:${inDays(1).replaceAll('-', '')}\r\nSUMMARY:Pay rent\r\nDESCRIPTION:Chores`)
})
