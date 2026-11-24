import { expect, type Page } from '@playwright/test'
import { nextDue, onRule, typedDates, withTyped } from '../src/components/dates'
import { lineEnd, newNote, phoneOnly, row, signIn, test, uid } from './helpers'

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
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bins')

  await page.locator('.editor-body p').getByText('Rent', { exact: true }).click()
  await tool(page, 'Date').click()
  await tool(page, 'Tomorrow').click()
  await expect(line(page, 'Rent')).toHaveAttribute('data-due', inDays(1))
  await expect(chip(page, 'Rent')).toHaveAttribute('data-label', 'Tomorrow')
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-US', { weekday: 'short' })
  await expect(page.locator('label:has([aria-label="Day"])')).toContainText(tomorrow)
  // The box stays open for a time or a repeat, until a tap elsewhere. A time can have a length.
  await expect(tool(page, '1 hour')).toBeHidden()
  await page.getByLabel('Time', { exact: true }).fill('18:00')
  await expect(line(page, 'Rent')).toHaveAttribute('data-due', `${inDays(1)}T18:00`)
  await expect(tool(page, '30 minutes')).toHaveAttribute('aria-pressed', 'true')
  await tool(page, '1 hour').click()
  await expect(line(page, 'Rent')).toHaveAttribute('data-duration', '60')
  await page.keyboard.press('Escape')
  await expect(tool(page, 'Tomorrow')).toBeHidden()

  // A line split from a dated one starts without a date.
  await page.locator('.editor-body p').getByText('Rent', { exact: true }).click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Water')
  await expect(line(page, 'Water')).not.toHaveAttribute('data-due')

  await page.locator('.editor-body p').getByText('Bins', { exact: true }).click()
  await tool(page, 'Date').click()
  await page.getByLabel('Day', { exact: true }).fill(inDays(-1))
  await page.getByLabel('Time', { exact: true }).fill('09:30')
  await expect(line(page, 'Bins')).toHaveAttribute('data-due', `${inDays(-1)}T09:30`)
  // A line that gets a time lasts as long as the last length picked.
  await expect(line(page, 'Bins')).toHaveAttribute('data-duration', '60')
  await expect(chip(page, 'Bins')).toHaveAttribute('data-label', 'Yesterday 9:30 AM')
  await expect(chip(page, 'Bins')).toHaveAttribute('data-overdue')

  // A tap on a date opens its box.
  await page.keyboard.press('Escape')
  await chip(page, 'Rent').click()
  await tool(page, 'Remove date').click()
  await expect(line(page, 'Rent')).not.toHaveAttribute('data-due')
  await expect(line(page, 'Rent')).not.toHaveAttribute('data-duration')
})

test('on a phone, a tap right of a dated line puts the cursor at its end', async ({ browser }) => {
  phoneOnly()
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  await tool(page, 'Task list').click()
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
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await tool(page, 'Today').click()
  await tool(page, 'Weekly').click()
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

test("a calendar event's link opens its note with the cursor at the end of its line", async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bins')
  const note = page.url()
  // A link opens a note this device saved long ago. A change reaches the server only once it is saved here.
  const saved = (id: string) =>
    new Promise<boolean>((resolve) => {
      indexedDB.open('niche-notes').onsuccess = (e) => {
        const rows = (e.target as IDBOpenDBRequest).result.transaction('updates').objectStore('updates').getAll()
        rows.onsuccess = () => resolve(rows.result.filter((row) => row.doc === id).every((row) => row.seq != null))
      }
    })
  await expect.poll(() => page.evaluate(saved, note.split('/n/')[1])).toBe(true)

  await page.goto(`${note}?line=Rent`)
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('!')
  await expect(line(page, 'Rent!')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test("a browser that signed in this computer's desktop app passes a note's link on to it, but not a share link", async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Rent')
  const id = page.url().split('/n/')[1]
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'New edit link' }).click()
  await expect(page.getByText('Nobody yet')).toBeVisible()
  const { links } = await (await page.request.get(`/api/docs/${id}/links`)).json()
  const handedOn: string[] = []
  page.on('request', (request) => void (request.url().startsWith('nichenotes:') && handedOn.push(request.url())))

  await page.goto(`/n/${id}?line=Rent`)
  await page.context().addCookies([{ name: 'app', value: '1', domain: 'localhost', path: '/' }])
  await page.goto(`/s/${links[0].token}`)
  await expect(page.getByPlaceholder('Title')).toHaveValue('Chores')
  const handOff = page.waitForRequest(/^nichenotes:/)
  await page.goto(`/?n=${id}&line=Rent`)
  await handOff
  await expect(page.getByPlaceholder('Title')).toHaveValue('Chores')
  expect(handedOn).toEqual([`nichenotes://open/n/${id}?line=Rent`])
})

test('a monthly repeat can be the nth or last weekday, several at once', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Clean filters')
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await tool(page, 'Monthly').click()
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

test('a monthly repeat on a day of the month moves to the day picked', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Pay rent')
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await tool(page, 'Monthly').click()
  await page.getByLabel('Day', { exact: true }).fill(inDays(1))
  const date = Number(inDays(1).slice(8))
  await expect(line(page, 'Pay rent')).toHaveAttribute('data-repeat', `FREQ=MONTHLY;BYMONTHDAY=${date}`)
  await expect(page.getByText(new RegExp(`^Every month on the ${date}(st|nd|rd|th)$`))).toBeVisible()
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
  // Yesterday's 18:00 ticked this afternoon comes back tonight, and tomorrow once tonight's has passed.
  const daily = 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA'
  expect(nextDue('2026-11-15T18:00', daily, new Date(2026, 10, 16, 14))).toBe('2026-11-16T18:00')
  expect(nextDue('2026-11-15T18:00', daily, new Date(2026, 10, 16, 19))).toBe('2026-11-17T18:00')
  // Tonight's ticked this afternoon skips to tomorrow.
  expect(nextDue('2026-11-16T18:00', daily, new Date(2026, 10, 16, 14))).toBe('2026-11-17T18:00')
  // A line given a repeat moves to the rule's first day.
  expect(onRule('2026-11-16T09:30', 'FREQ=MONTHLY;BYDAY=-1SU', today)).toBe('2026-11-29T09:30')
  // Today is the first day of a yearly rule given today.
  expect(onRule('2026-11-16', 'FREQ=YEARLY', today)).toBe('2026-11-16')
})

test('words typed as a date turn into the date of their line once it is left', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Milk')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  const typed = page.locator('.typed-words')

  // Marked while the cursor stays on the line, with the date they make on the chip.
  await page.keyboard.type('buy coffee tomorrow')
  await expect(typed).toHaveText('tomorrow')
  await expect(chip(page, 'buy coffee tomorrow')).toHaveAttribute('data-label', 'Tomorrow ✕')
  await expect(line(page, 'buy coffee tomorrow')).not.toHaveAttribute('data-due')
  await page.keyboard.press('Enter')
  await expect(line(page, 'buy coffee')).toHaveAttribute('data-due', inDays(1))
  await expect(chip(page, 'buy coffee')).toHaveAttribute('data-label', 'Tomorrow')
  await expect(typed).toHaveCount(0)

  // A repeat and a time, read when the cursor goes to another line.
  await page.keyboard.type('brush teeth every day at 9:00')
  await expect(typed).toHaveText('every day at 9:00')
  await expect(chip(page, 'brush teeth every day at 9:00')).toHaveAttribute('data-label', /^↻ (Today|Tomorrow) 9:00 AM ✕$/)
  await page.locator('.editor-body p').getByText('Milk', { exact: true }).click()
  await expect(line(page, 'brush teeth')).toHaveAttribute('data-repeat', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU')
  await expect(line(page, 'brush teeth')).toHaveAttribute('data-due', /T09:00$/)

  // Words typed onto a dated line change only what they say.
  await page.locator('.editor-body p').getByText('buy coffee', { exact: true }).click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.type(' at 5pm')
  await page.keyboard.press('Enter')
  await expect(line(page, 'buy coffee')).toHaveAttribute('data-due', `${inDays(1)}T17:00`)

  // Typed first, the words stay marked while the line is nothing but a date, as the rest of it may follow. Left
  // that way, it is a line about that day, not a task for it.
  await page.keyboard.type('Friday at 7')
  await expect(typed).toHaveText('Friday at 7')
  await page.keyboard.press('Enter')
  await expect(line(page, 'Friday at 7')).not.toHaveAttribute('data-due')
})

test('the chip or Escape keeps typed words as words, and Undo brings them back', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Dinner', 'Sunday roast')
  await tool(page, 'Task list').click()
  const typed = page.locator('.typed-words')
  // A line made into a checkbox line wasn't typed as one.
  await expect(typed).toHaveCount(0)
  await page.keyboard.press('Enter')

  await page.keyboard.type('Monday pasta')
  await expect(typed).toHaveText('Monday')
  await chip(page, 'Monday pasta').click()
  await expect(typed).toHaveCount(0)
  await expect(chip(page, 'Monday pasta')).not.toHaveAttribute('data-label')
  // More words on a line that names a day leave the day alone.
  await page.keyboard.type(' bake')
  await expect(typed).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(line(page, 'Monday pasta bake')).not.toHaveAttribute('data-due')

  await page.keyboard.type('Tuesday tacos')
  await expect(typed).toHaveText('Tuesday')
  await page.keyboard.press('Escape')
  await expect(typed).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(line(page, 'Tuesday tacos')).not.toHaveAttribute('data-due')

  // Undo takes back the date and nothing more of the line.
  await page.keyboard.type('thaw fish today')
  await page.keyboard.press('Enter')
  await expect(line(page, 'thaw fish')).toHaveAttribute('data-due', inDays(0))
  await page.keyboard.press('ControlOrMeta+z')
  await expect(line(page, 'thaw fish today')).not.toHaveAttribute('data-due')
  await expect(typed).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(line(page, 'thaw fish today')).not.toHaveAttribute('data-due')
})

test('typed words turn into the date when the note closes or the app goes to the background', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Garden', 'Rake')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('water plants tomorrow')
  await expect(page.locator('.typed-words')).toHaveText('tomorrow')
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await row(page, 'Garden').click()
  await expect(line(page, 'water plants')).toHaveAttribute('data-due', inDays(1))

  await page.locator('.editor-body p').getByText('water plants', { exact: true }).click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type('feed cat today')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(line(page, 'feed cat')).toHaveAttribute('data-due', inDays(0))
})

test('typed words turn into the date when the app goes to the background while the keyboard still writes them', async ({
  browser,
}) => {
  phoneOnly()
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Garden', 'Rake')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('feed cat today at ')
  // A phone's keyboard holds the last word open, and may write it again once it lets go, so it has to let go while
  // the words are still in the line.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: '22:00', selectionStart: 5, selectionEnd: 5 })
  await expect(chip(page, 'feed cat today at 22:00')).toHaveAttribute('data-label', 'Today 10:00 PM ✕')
  const letGo = await page.evaluate(() => {
    const text = new Promise((resolve) =>
      document.addEventListener('compositionend', () => resolve(document.querySelector('.editor-body li:last-child p')?.textContent)),
    )
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    return Promise.race([text, new Promise((resolve) => setTimeout(() => resolve('still writing'), 1000))])
  })
  expect(letGo).toBe('feed cat today at 22:00')
  await expect(line(page, 'feed cat')).toHaveAttribute('data-due', `${inDays(0)}T22:00`)
})

test('the tree lists dated lines by when they are due, under their notes, and a tap opens the note or its line', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  const due = page.getByRole('button', { name: /^Due \(/ })
  await expect(due).toHaveCount(0)

  // The count is what needs doing by today, so a line due tomorrow shows the button without one.
  await newNote(page, 'Chores', 'Milk')
  await tool(page, 'Task list').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('book dentist tomorrow')
  await page.keyboard.press('Enter')
  await expect(due).toHaveText('')
  await page.keyboard.type('pay rent today')
  await page.keyboard.press('Enter')
  await expect(due).toHaveText('1')

  await newNote(page, 'Garden', 'rake leaves')
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await page.getByLabel('Day', { exact: true }).fill(inDays(-2))
  await page.keyboard.press('Escape')
  await page.locator('.editor-body p').getByText('rake leaves', { exact: true }).click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.type('plant bulbs')
  await tool(page, 'Date').click()
  await page.getByLabel('Day', { exact: true }).fill(inDays(9))
  await page.keyboard.press('Escape')
  await expect(due).toHaveText('2')

  await due.click()
  const section = (name: string) => page.getByRole('list', { name, exact: true }).getByRole('listitem')
  await expect(page.getByRole('button', { expanded: true })).toHaveText(['Past due1', 'Today1', 'Tomorrow1', 'Later1'])
  await expect(section('Past due')).toContainText('Garden')
  await expect(section('Past due')).toContainText('rake leaves')
  await expect(section('Today').getByRole('button')).toHaveText(['Chores', 'pay rentToday'])
  await expect(section('Tomorrow')).toContainText('book dentist')
  await expect(section('Later')).toContainText('Garden')
  await expect(section('Later')).toContainText('plant bulbs')

  // A folded section stays folded for this person, on every device.
  await page.getByRole('button', { name: 'Later' }).click()
  await expect(section('Later')).toHaveCount(0)
  const other = await signIn(browser, name)
  const otherDue = other.getByRole('button', { name: /^Due \(/ })
  await otherDue.click()
  await expect(other.getByRole('button', { name: 'Later' })).toHaveAttribute('aria-expanded', 'false')
  await expect(other.getByRole('list', { name: 'Later', exact: true })).toHaveCount(0)
  await expect(other.getByRole('list', { name: 'Today', exact: true })).toContainText('pay rent')

  await section('Today').getByRole('button', { name: /^pay rent/ }).click()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Chores')
  await expect(page.locator('.editor-body')).toBeFocused()
  await page.keyboard.type('!')
  await expect(line(page, 'pay rent!')).toBeVisible()

  // A ticked line leaves the list on both devices, the one without the note open too.
  await page.getByRole('checkbox', { name: 'Task item checkbox for pay rent!' }).check()
  await expect(due).toHaveText('1')
  await expect(otherDue).toHaveText('1')
  await expect(other.getByRole('list', { name: 'Today', exact: true })).toHaveCount(0)
  await section('Past due').getByRole('button', { name: 'Garden' }).click()
  await expect(page.getByPlaceholder('Title')).toHaveValue('Garden')

  // A note in the trash has nothing due.
  await due.click()
  await row(page, 'Garden').click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await expect(due).toHaveAccessibleName('Due (0)')
  await expect(otherDue).toHaveAccessibleName('Due (0)')
})

test('a launch without the server lists the dates another device gave a note open here', async ({ browser }) => {
  const name = `alice-${uid()}`
  const phone = await signIn(browser, name)
  const due = phone.getByRole('button', { name: /^Due \(/ })
  await newNote(phone, 'Chores', 'Milk')
  await tool(phone, 'Task list').click()
  await phone.keyboard.press('Enter')
  await phone.keyboard.type('pay rent today')
  await phone.keyboard.press('Enter')
  await expect(due).toHaveText('1')

  const desk = await signIn(browser, name)
  await row(desk, 'Chores').click()
  await desk.locator('.editor-body p').getByText('Milk', { exact: true }).click()
  await desk.keyboard.press(lineEnd)
  await desk.keyboard.type(' today')
  await desk.keyboard.press('ArrowDown')
  await expect(due).toHaveText('2')

  // Android can end the app without telling the page, so the device has to hold this already. A second window
  // shows what it holds, and the first stays open, as the app was until it ended.
  const launch = await phone.context().newPage()
  await launch.route('**/api/me', () => {})
  await launch.routeWebSocket(/\/socket\//, () => {})
  await launch.goto('/')
  await expect(launch.getByRole('button', { name: /^Due \(/ })).toHaveText('2')
})

test('a note opened at a line far down shows that line in the middle, and again once a keyboard shortens the page', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Long', 'line 1')
  await tool(page, 'Task list').click()
  for (let i = 2; i <= 40; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(i === 30 ? 'pay rent today' : `line ${i}`)
  }
  await page.locator('.editor-body p').getByText('line 1', { exact: true }).click()
  await page.evaluate(() => document.querySelector('.editor-body')!.closest('.overflow-y-auto')!.scrollTo(0, 0))
  await page.getByRole('button', { name: /^Due \(/ }).click()
  await page.getByRole('list', { name: 'Today', exact: true }).getByRole('button', { name: /^pay rent/ }).click()
  await expect(page.locator('.editor-body')).toBeFocused()
  const middle = () =>
    page.evaluate(() => {
      const line = [...document.querySelectorAll('.editor-body li')].find((li) => li.textContent?.startsWith('pay rent'))!
      const lineBox = line.getBoundingClientRect()
      const view = line.closest('.overflow-y-auto')!.getBoundingClientRect()
      return Math.round(((lineBox.top + lineBox.height / 2 - view.top) / view.height) * 10) / 10
    })
  await expect.poll(middle).toBeLessThanOrEqual(0.6)
  expect(await middle()).toBeGreaterThanOrEqual(0.4)

  // The keyboard a widget raises comes up just after the note opens.
  await page.setViewportSize({ width: 1280, height: 360 })
  await expect.poll(middle).toBeLessThanOrEqual(0.6)
  expect(await middle()).toBeGreaterThanOrEqual(0.4)
})

test('typed words read as the dates they say', () => {
  // Monday 16 November 2026, two in the afternoon.
  const now = new Date(2026, 10, 16, 14)
  const read = (text: string, line = {}) => {
    const [typed] = typedDates(text, now)
    return typed && { words: text.slice(typed.from, typed.to), ...withTyped(line, typed, now) }
  }
  expect(read('buy coffee today')).toEqual({ words: 'today', due: '2026-11-16', repeat: null })
  expect(read('Call mom Tomorrow at 5pm')).toEqual({ words: 'Tomorrow at 5pm', due: '2026-11-17T17:00', repeat: null })
  expect(read('dentist friday 9:30')).toEqual({ words: 'friday 9:30', due: '2026-11-20T09:30', repeat: null })
  expect(read('lunch thursday at 12')).toEqual({ words: 'thursday at 12', due: '2026-11-19T12:00', repeat: null })
  expect(read('plan trip next week')).toEqual({ words: 'next week', due: '2026-11-23', repeat: null })
  // A weekday is the coming one, a week on when it is today.
  expect(read('standup next monday')).toEqual({ words: 'next monday', due: '2026-11-23', repeat: null })
  // A day of the year that has gone by is next year's.
  expect(read('pay taxes mar 31')).toEqual({ words: 'mar 31', due: '2027-03-31', repeat: null })
  expect(read('party 5th december')).toEqual({ words: '5th december', due: '2026-12-05', repeat: null })

  const daily = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU'
  expect(read('brush teeth every day at 21:00')).toEqual({ words: 'every day at 21:00', due: '2026-11-16T21:00', repeat: daily })
  // With no day said, a time that has gone by today means the next one.
  expect(read('brush teeth every day at 9:00')).toEqual({ words: 'every day at 9:00', due: '2026-11-17T09:00', repeat: daily })
  expect(read('call bank at 9:15')).toEqual({ words: 'at 9:15', due: '2026-11-17T09:15', repeat: null })
  expect(read('call bank 4pm')).toEqual({ words: '4pm', due: '2026-11-16T16:00', repeat: null })
  expect(read('standup every weekday')).toEqual({ words: 'every weekday', due: '2026-11-16', repeat: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' })
  expect(read('gym every monday, wednesday and friday')).toEqual({
    words: 'every monday, wednesday and friday',
    due: '2026-11-16',
    repeat: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  })
  // Every other week starts on the coming Thursday, not the one after.
  expect(read('bins every other thursday')).toEqual({
    words: 'every other thursday',
    due: '2026-11-19',
    repeat: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH',
  })
  // A week, a month or a year takes its day from the line's date, as the date box does.
  expect(read('review every 2 weeks')).toEqual({ words: 'every 2 weeks', due: '2026-11-16', repeat: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' })
  expect(read('rent monthly')).toEqual({ words: 'monthly', due: '2026-11-16', repeat: 'FREQ=MONTHLY;BYMONTHDAY=16' })
  expect(read('card for mom every year')).toEqual({ words: 'every year', due: '2026-11-16', repeat: 'FREQ=YEARLY' })
  // A month's day or weekday can be said, and the line moves to its next one.
  expect(read('pay rent every month on the first')).toEqual({
    words: 'every month on the first',
    due: '2026-12-01',
    repeat: 'FREQ=MONTHLY;BYMONTHDAY=1',
  })
  expect(read('water plants monthly on the 15th')).toEqual({
    words: 'monthly on the 15th',
    due: '2026-12-15',
    repeat: 'FREQ=MONTHLY;BYMONTHDAY=15',
  })
  expect(read('book club every month on the last friday')).toEqual({
    words: 'every month on the last friday',
    due: '2026-11-27',
    repeat: 'FREQ=MONTHLY;BYDAY=-1FR',
  })

  // What the words leave unsaid stays as the line had it.
  expect(read('call bank at 9:15', { due: '2026-12-01', repeat: 'FREQ=YEARLY' })).toEqual({
    words: 'at 9:15',
    due: '2026-12-01T09:15',
    repeat: 'FREQ=YEARLY',
  })
  expect(read('call bank tomorrow', { due: '2026-12-01T08:00' })).toEqual({ words: 'tomorrow', due: '2026-11-17T08:00', repeat: null })

  for (const text of ['sun cream', "today's special", 'Monday: pasta', 'look at 5 houses', 'feb 30', 'every other day', 'ratio 16:9', 'every week on the 1st', 'every month on the 5th monday']) {
    expect(typedDates(text, now), text).toEqual([])
  }
})

test('a dated line keeps its date beside its own text when a longer line is nested under it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores', 'Clean office')
  await tool(page, 'Task list').click()
  await tool(page, 'Date').click()
  await tool(page, 'Tomorrow').click()
  const office = page.locator('.editor-body p').getByText('Clean office', { exact: true })
  await office.click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.press('Enter')
  await tool(page, 'Indent').click()
  await page.keyboard.type('and vacuum the whole bathroom too')
  await expect(line(page, 'and vacuum the whole bathroom too').last()).toBeVisible()

  // Where the words end, since the paragraph's box spans whatever holds it.
  const end = await office.evaluate((p) => {
    const words = document.createRange()
    words.selectNodeContents(p)
    return words.getBoundingClientRect()
  })
  const date = (await chip(page, 'Clean office').boundingBox())!
  expect(date.x - end.right).toBeLessThan(20)
  expect(Math.abs(date.y - end.y)).toBeLessThan(10)
})
