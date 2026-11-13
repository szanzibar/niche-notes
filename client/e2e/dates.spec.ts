import { expect, test, type Page } from '@playwright/test'
import { nextDue, onRule } from '../src/components/dates'
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
  await expect(line(page, 'Rent')).toHaveAttribute('data-due', inDays(1))
  await expect(chip(page, 'Rent')).toHaveAttribute('data-label', 'Tomorrow')
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-US', { weekday: 'short' })
  await expect(page.locator('label:has([aria-label="Day"])')).toContainText(tomorrow)
  // The box stays open for a time or a repeat, until a tap elsewhere.
  await page.getByLabel('Time', { exact: true }).fill('18:00')
  await expect(line(page, 'Rent')).toHaveAttribute('data-due', `${inDays(1)}T18:00`)
  await page.keyboard.press('Escape')
  await expect(tool(page, 'Tomorrow')).toBeHidden()

  // A line split from a dated one starts without a date.
  await page.locator('.editor-body p').getByText('Rent', { exact: true }).click()
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

test('on a phone, a tap right of a dated line puts the cursor at its end', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  await tool(page, 'Checklist').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bins')
  await page.locator('.editor-body p').getByText('Rent', { exact: true }).tap()
  await tool(page, 'Date').tap()
  await tool(page, 'Tomorrow').tap()
  await page.keyboard.press('Escape')

  const box = (await line(page, 'Rent').boundingBox())!
  await page.touchscreen.tap(box.x + box.width - 10, box.y + box.height / 2)
  await page.waitForTimeout(60)
  await page.keyboard.type('!')
  await expect(line(page, 'Rent!')).toHaveAttribute('data-due')
})

test('ticking a repeating line moves it to its next date instead of checking it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Bins')
  await tool(page, 'Checklist').click()
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await tool(page, 'Every week').click()
  await expect(chip(page, 'Bins')).toHaveAttribute('data-label', '↻ Today')
  await expect(page.getByRole('button', { name: /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/ })).toHaveText([
    'M',
    'T',
    'W',
    'T',
    'F',
    'S',
    'S',
  ])
  await page.keyboard.press('Escape')

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
  await page.context().route('https://calendar.google.com/**', (route) => route.fulfill({ body: '' }))
  const google = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Add to Google Calendar' }).click()
  expect(decodeURIComponent((await google).url())).toMatch(/calendar\.google\.com\/calendar\/render\?cid=webcal:\/\/localhost/)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  await expect
    .poll(async () => (await request.get(url)).text())
    .toContain(`DTSTART;VALUE=DATE:${inDays(1).replaceAll('-', '')}\r\nSUMMARY:Pay rent\r\nDESCRIPTION:Chores`)
})

test("a calendar event's link opens its note with the cursor at the end of its line", async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  await tool(page, 'Checklist').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bins')
  const note = page.url()

  await page.goto(`${note}?line=Rent`)
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('!')
  await expect(line(page, 'Rent!')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test('on Android, Copy link gives the Google Calendar link to paste into a browser', async ({ browser, request }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36',
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await newNote(page, 'Chores', 'Pay rent')
  await tool(page, 'Checklist').click()
  await tool(page, 'Date').click()
  await tool(page, 'Tomorrow').click()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to Google Calendar' })).toHaveCount(0)
  const signIn = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  expect(signIn.origin).toBe('https://accounts.google.com')
  const add = new URL(signIn.searchParams.get('continue')!)
  expect(add.origin + add.pathname).toBe('https://calendar.google.com/calendar/render')
  const feed = add.searchParams.get('cid')!.replace(/^webcal:/, 'http:')
  await expect.poll(async () => (await request.get(feed)).text()).toContain('SUMMARY:Pay rent')
})

test('a monthly repeat can be the nth or last weekday, several at once', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Clean filters')
  await tool(page, 'Checklist').click()
  await tool(page, 'Date').click()
  await tool(page, 'Every month').click()
  const weekday = new Date().toLocaleDateString('en', { weekday: 'long' })
  const code = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date().getDay()]
  await expect(page.getByText(`Every month on the ${new Date().getDate()}`)).toBeVisible()
  await tool(page, '1st').click()
  await tool(page, '3rd').click()
  await expect(line(page, 'Clean filters')).toHaveAttribute('data-repeat', `FREQ=MONTHLY;BYDAY=1${code},3${code}`)
  await expect(page.getByText(`Every month on the 1st and 3rd ${weekday}`)).toBeVisible()
  await tool(page, 'Repeat less often').click()
  await expect(page.getByText(`Every 2 months on the 1st and 3rd ${weekday}`)).toBeVisible()
})

test('repeat rules land on the right next day', () => {
  // Monday 16 November 2026.
  const today = new Date(2026, 10, 16)
  expect(nextDue('2026-11-16', 'FREQ=WEEKLY;BYDAY=MO,TH', today)).toBe('2026-11-19')
  expect(nextDue('2026-11-15T08:00', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU', today)).toBe('2026-11-29T08:00')
  expect(nextDue('2026-11-01', 'FREQ=MONTHLY;BYDAY=1SU,3SU', new Date(2026, 10, 1))).toBe('2026-11-15')
  expect(nextDue('2026-11-15', 'FREQ=MONTHLY;BYDAY=1SU,3SU', today)).toBe('2026-12-06')
  expect(nextDue('2026-11-29', 'FREQ=MONTHLY;BYDAY=-1SU', new Date(2026, 10, 29))).toBe('2026-12-27')
  expect(nextDue('2026-10-31', 'FREQ=MONTHLY;BYMONTHDAY=31', today)).toBe('2026-12-31')
  expect(nextDue('2026-11-14', 'FREQ=YEARLY', today)).toBe('2027-11-14')
  // Ticked days late, a daily line comes back tomorrow, not on a day already gone.
  expect(nextDue('2026-11-10', 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA', today)).toBe('2026-11-17')
  // A line given a repeat moves to the rule's first day.
  expect(onRule('2026-11-16T09:30', 'FREQ=MONTHLY;BYDAY=-1SU', today)).toBe('2026-11-29T09:30')
})
