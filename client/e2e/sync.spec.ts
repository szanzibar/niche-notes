import { DatabaseSync } from 'node:sqlite'
import { expect, type Page } from '@playwright/test'
import { newNote, row, signIn, test, typeAtEnd, uid } from './helpers'

// Rows in the local update log, and how many the server has not acknowledged yet.
const localRows = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ total: number; unsent: number }>((resolve) => {
        const open = indexedDB.open('niche-notes')
        open.onsuccess = () => {
          const all = open.result.transaction('updates').objectStore('updates').getAll()
          all.onsuccess = () => {
            const rows = all.result as { seq: number | null }[]
            resolve({ total: rows.length, unsent: rows.filter((r) => r.seq == null).length })
          }
        }
      }),
  )

// One row per keystroke, so a few hundred characters cross the limit on the device and on the server.
test('a long edit history is folded into one row and the note survives it everywhere', async ({ browser }) => {
  const name = `alice-${uid()}`
  const text = 'x'.repeat(600)
  const page = await signIn(browser, name)
  await newNote(page, 'Long', text)
  await expect.poll(() => localRows(page)).toMatchObject({ unsent: 0 })
  expect((await localRows(page)).total).toBeGreaterThan(600)

  await page.reload()
  await expect(page.locator('.editor-body')).toContainText(text)
  await expect.poll(async () => (await localRows(page)).total).toBeLessThan(50)
  await page.reload()
  await expect(page.locator('.editor-body')).toContainText(text)

  const other = await signIn(browser, name)
  await row(other, 'Long').click()
  await expect(other.locator('.editor-body')).toContainText(text)
})

// Topics the page joins from now on, read off the socket.
const joins = (page: Page) => {
  const topics: string[] = []
  page.on('websocket', (ws) =>
    ws.on('framesent', ({ payload }) => {
      const [, , topic, event] = JSON.parse(String(payload)) as string[]
      if (event === 'phx_join') topics.push(topic)
    }),
  )
  return topics
}

test('a launch loads only the tree, and notes it never opened still show, search and keep up', async ({ browser }) => {
  const name = `alice-${uid()}`
  const phone = await signIn(browser, name)
  await newNote(phone, 'Groceries', 'oat milk')
  await newNote(phone, 'Packing', 'wool socks')
  await expect.poll(() => localRows(phone)).toMatchObject({ unsent: 0 })

  const laptop = await signIn(browser, name)
  await expect(row(laptop, 'Packing')).toBeVisible()
  const topics = joins(laptop)
  await laptop.reload()
  await laptop.getByPlaceholder('Search notes').fill('wool')
  await expect(laptop.getByRole('option')).toHaveText(/Packing/)
  await laptop.getByRole('button', { name: 'Clear search' }).click()

  await row(phone, 'Groceries').click()
  await expect(phone.getByPlaceholder('Title')).toHaveValue('Groceries')
  await phone.getByPlaceholder('Title').fill('Groceries for Sunday')
  await expect(row(laptop, 'Groceries for Sunday')).toBeVisible()
  const tree = topics.find((topic) => topic.startsWith('user:'))!.replace('user:', 'doc:')
  expect(topics.filter((topic) => topic.startsWith('doc:') && topic !== tree)).toEqual([])

  await row(laptop, 'Packing').click()
  await expect(laptop.locator('.editor-body')).toContainText('wool socks')
})

// What a restored backup leaves once the app has started on it: the server's log as it was at the backup,
// numbering new rows from there, under a new generation.
const restoreWithout = (note: string) =>
  new DatabaseSync('../server/data/e2e.db').exec(
    `pragma busy_timeout = 5000;
     delete from doc_updates where doc_id = '${note}';
     update sqlite_sequence set seq = (select coalesce(max(id), 0) from doc_updates) where name = 'doc_updates';
     update generation set id = lower(hex(randomblob(16)));`,
  )

test('after the server is restored from a backup, a device sends back what the backup lacks and still gets new edits', { tag: '@alone' }, async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const phone = await signIn(browser, name)
  await newNote(phone, 'Groceries', 'oat milk')
  await expect.poll(() => localRows(phone)).toMatchObject({ unsent: 0 })
  const note = new URL(phone.url()).pathname.split('/n/')[1]

  restoreWithout(note)
  const laptop = await signIn(browser, name)
  await expect(row(laptop, 'Untitled')).toBeVisible()

  await phone.reload()
  await expect(row(laptop, 'Groceries')).toBeVisible()
  await row(laptop, 'Groceries').click()
  await expect(laptop.locator('.editor-body')).toContainText('oat milk')

  // The laptop's rows take numbers the phone held before the restore.
  await typeAtEnd(laptop, ' and bread')
  await expect(phone.locator('.editor-body')).toContainText('oat milk and bread')

  // The phone sent its tree again too, which the backup still had, so the log holds none of it twice.
  const copies = new DatabaseSync('../server/data/e2e.db')
    .prepare(`select count(*) - count(distinct "update") as n from doc_updates where doc_id = (select id from users where sub = ?)`)
    .get(`dev-${name}`)
  expect(copies).toEqual({ n: 0 })
})
