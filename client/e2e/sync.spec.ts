import { expect, type Page } from '@playwright/test'
import { newNote, row, signIn, test, uid } from './helpers'

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

// One row per keystroke, so a few hundred characters cross the compaction limit.
test('a long edit history is compacted into a snapshot and the note survives it everywhere', async ({ browser }) => {
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
