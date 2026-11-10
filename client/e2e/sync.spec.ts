import { expect, test, type Page } from '@playwright/test'
import { newNote, row, signIn, uid } from './helpers'

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
