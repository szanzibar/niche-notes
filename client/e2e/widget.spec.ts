import { expect, type Page } from '@playwright/test'
import { newNote, phoneOnly, row, signIn, test, uid } from './helpers'

// Desktop Chromium can't open the Android app, so the hand-off shows up as a failed request.
const handOff = async (page: Page) => {
  const request = await page.waitForEvent('requestfailed', (r) => r.url().startsWith('intent://'))
  return new URL(request.url().replace('intent://', 'https://')).searchParams
}

test('the widget picker is the tree: choosing a note hands it to the app instead of opening it', async ({ browser }) => {
  phoneOnly()
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  const groceries = page.url().split('/n/')[1]
  await newNote(page, 'Chores')
  const chores = page.url().split('/n/')[1]

  await page.goto('/widget/7')
  await expect(page.getByText('Tap a note to show it in the widget')).toBeVisible()
  const fromRow = handOff(page)
  await row(page, 'Groceries').click()
  expect(Object.fromEntries(await fromRow)).toEqual({ id: '7', note: groceries, title: 'Groceries', token: expect.any(String) })
  await expect(page.locator('.editor-body')).toHaveCount(0)

  const fromSearch = handOff(page)
  await page.getByPlaceholder('Search notes').fill('chor')
  await page.keyboard.press('Enter')
  expect((await fromSearch).get('note')).toBe(chores)

  await page.context().setOffline(true)
  await expect(page.getByText('Connect to the internet to add the widget')).toBeVisible()
})

test('a widget reads its note as lines with the token from the hand-off, without a session', async ({
  browser,
  request,
}) => {
  phoneOnly()
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await page.getByRole('button', { name: 'Checklist', exact: true }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('eggs')
  await page.getByRole('button', { name: 'Indent', exact: true }).click()
  await page.getByRole('button', { name: 'Bullet list', exact: true }).click()
  await page.locator('.editor-body input[type="checkbox"]').click()

  await page.goto('/widget/7')
  const picked = handOff(page)
  await row(page, 'Groceries').click()
  const headers = { authorization: `Bearer ${(await picked).get('token')}` }
  await expect
    .poll(async () => (await request.get('/api/widget', { headers })).json())
    .toEqual({
      title: 'Groceries',
      color: '#FF4F3B',
      ink: '#FFFFFF',
      rows: [
        { line: 'milk', text: 'milk', depth: 0, checked: true },
        { line: '• eggs', text: 'eggs', depth: 1 },
      ],
    })
})

test('the notes widget gets all the notes as the tree shows them, with nothing to pick', async ({ browser, request }) => {
  phoneOnly()
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Chores')
  const chores = page.url().split('/n/')[1]
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await newNote(page, 'Groceries')
  const groceries = page.url().split('/n/')[1]

  const picked = handOff(page)
  await page.goto('/widget/7?tree')
  const query = await picked
  await expect(page.getByText('Tap a note to show it in the widget')).toHaveCount(0)
  expect(Object.fromEntries(query)).toEqual({ id: '7', note: 'tree', title: 'Notes', token: expect.any(String) })
  const headers = { authorization: `Bearer ${query.get('token')}` }
  await expect
    .poll(async () => (await (await request.get('/api/widget', { headers })).json()).rows)
    .toEqual([
      { line: 'Chores', depth: 0, note: chores },
      { line: 'Groceries', depth: 0, note: groceries },
    ])
})

test('a tap on a line in a widget opens the note at that line, over the list, and asks for the keyboard', async ({
  browser,
}) => {
  const page = await signIn(browser, `alice-${uid()}`)
  // What the focused line looked like when the page asked for the keyboard, and Chrome's way to hand a link to the
  // running app.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'virtualKeyboard', {
      value: { show: () => ((window as unknown as { asked: string }).asked = document.activeElement!.outerHTML.slice(0, 200)) },
    })
    Object.defineProperty(window, 'launchQueue', {
      value: { setConsumer: (consumer: unknown) => Object.assign(window, { launch: consumer }) },
    })
  })
  await newNote(page, 'Trip', 'Passport')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Bullet list', exact: true }).click()
  await page.keyboard.type('Charger')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Socks')
  const note = page.url()
  // The widget opens a note this device saved long ago.
  const saved = (id: string) =>
    new Promise<boolean>((resolve) => {
      indexedDB.open('niche-notes').onsuccess = (e) => {
        const rows = (e.target as IDBOpenDBRequest).result.transaction('updates').objectStore('updates').getAll()
        rows.onsuccess = () => resolve(rows.result.filter((row) => row.doc === id).every((row) => row.seq != null))
      }
    })
  await expect.poll(() => page.evaluate(saved, note.split('/n/')[1])).toBe(true)

  for (const [line, typed] of [
    ['Charger', 'Charger!'],
    ['Passport', 'Passport!'],
  ]) {
    // A widget names the note as /?n=<id>, so Chrome hands the link to the open page.
    await page.goto(`/?${new URLSearchParams({ n: note.split('/n/')[1], line })}`)
    await expect(page.locator('.editor-body')).toBeFocused()
    expect(await page.evaluate(() => (window as unknown as { asked: string }).asked)).toContain('virtualkeyboardpolicy="manual"')
    await expect(page.locator('.editor-body')).not.toHaveAttribute('virtualkeyboardpolicy')
    await page.keyboard.type('!')
    await expect(page.locator('.editor-body p').getByText(typed, { exact: true })).toBeVisible()
  }

  // A tap on another line, with the note still open in the running app, goes to that line and asks again.
  await page.evaluate(
    (targetURL) => {
      const app = window as unknown as { asked: string; launch(params: { targetURL: string }): void }
      app.asked = ''
      app.launch({ targetURL })
    },
    `${new URL('/', note)}?${new URLSearchParams({ n: note.split('/n/')[1], line: 'Socks' })}`,
  )
  await expect.poll(() => page.evaluate(() => (window as unknown as { asked: string }).asked)).toContain('manual')
  await page.keyboard.type('!')
  await expect(page.locator('.editor-body p').getByText('Socks!', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})
