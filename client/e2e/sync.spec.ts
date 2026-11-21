import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { openSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
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
  test.slow()
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

// A restore stops the server, so this test runs its own Phoenix and Vite. Vite stays up throughout, since a browser
// keeps a device's notes per address.
const restoreApp = 'http://localhost:5197'
const servers = new Set<() => Promise<unknown>>()
test.afterEach(() => Promise.all([...servers].map((stop) => stop())))

// Its output lands beside the test's trace.
async function serve(name: string, command: string, args: string[], env: Record<string, string>, port: number, path = '/') {
  // A server left from an earlier run would answer in place of this one.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer().once('error', reject).listen(port, '127.0.0.1', () => probe.close(() => resolve()))
  })
  const log = openSync(test.info().outputPath(`${name}.log`), 'a')
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', log, log] })
  const exited = once(child, 'exit')
  const stop = async () => {
    servers.delete(stop)
    child.kill()
    await exited
  }
  servers.add(stop)
  const url = `http://localhost:${port}${path}`
  await expect.poll(() => fetch(url).then(() => true, () => false), { timeout: 60_000 }).toBe(true)
  return stop
}

const phoenix = (database: string) =>
  serve(
    'phoenix',
    'sh',
    ['-c', 'cd ../server && exec mix do ecto.create --quiet + ecto.migrate --quiet + phx.server'],
    { MIX_BUILD_ROOT: '_build/e2e', DATABASE_PATH: database, PORT: '4197', GOOGLE_CLIENT_ID: 'e2e' },
    4197,
    '/api/me',
  )

test('a server restored from a backup gets back what the backup lacks from a phone, which keeps up with it after', async ({
  browser,
}) => {
  test.slow()
  for (const file of readdirSync('../server/data')) if (file.startsWith('e2e-restore')) rmSync(`../server/data/${file}`)
  const live = await phoenix('data/e2e-restore.db')
  await serve('vite', 'node_modules/.bin/vite', ['--port', '5197', '--strictPort'], { PHOENIX_PORT: '4197' }, 5197)

  const name = `alice-${uid()}`
  const device = async () => {
    const page = await (await browser.newContext({ baseURL: restoreApp })).newPage()
    await page.goto(`/auth/login?as=${name}`)
    await expect(page.getByPlaceholder('Search notes')).toBeVisible()
    return page
  }
  const phone = await device()
  await newNote(phone, 'Groceries', 'oat milk')
  await expect.poll(() => localRows(phone)).toMatchObject({ unsent: 0 })

  // The README's backup and restore. What is written after the backup reached the old server, so only the phone
  // still has it.
  execFileSync('sqlite3', ['../server/data/e2e-restore.db', '.backup ../server/data/e2e-restore-backup.db'])
  await typeAtEnd(phone, ' and eggs')
  await newNote(phone, 'Packing', 'wool socks')
  // A tablet, gone by the restore, writes a note the phone holds only as one row, so the old server numbered
  // rows far past what the phone sends back.
  const tablet = await device()
  await newNote(tablet, 'Recipes', 'enough for the whole week, so nobody goes back to the shop on Thursday')
  await expect.poll(() => localRows(tablet)).toMatchObject({ unsent: 0 })
  await tablet.context().close()
  await phone.getByPlaceholder('Search notes').fill('Thursday')
  await expect(phone.getByRole('option')).toHaveText(/Recipes/)
  await phone.getByRole('button', { name: 'Clear search' }).click()
  await expect.poll(() => localRows(phone)).toMatchObject({ unsent: 0 })
  await live()
  await phoenix('data/e2e-restore-backup.db')

  // The phone reconnects by itself and sends it all again.
  const laptop = await device()
  await expect(row(laptop, 'Packing')).toBeVisible({ timeout: 20_000 })
  await row(laptop, 'Groceries').click()
  await expect(laptop.locator('.editor-body')).toContainText('oat milk and eggs')
  await row(laptop, 'Recipes').click()
  await expect(laptop.locator('.editor-body')).toContainText('on Thursday')
  await row(laptop, 'Packing').click()
  await expect(laptop.locator('.editor-body')).toContainText('wool socks')

  // The restored server numbers new rows from where the backup ended, below what the phone saw from the old one.
  await typeAtEnd(laptop, ' and boots')
  await expect(phone.locator('.editor-body')).toContainText('wool socks and boots')
  await phone.context().setOffline(true)
  await row(laptop, 'Recipes').click()
  await laptop.getByPlaceholder('Title').fill('Recipes for the week')
  await typeAtEnd(laptop, ' or Friday')
  await expect.poll(() => localRows(laptop)).toMatchObject({ unsent: 0 })
  await phone.context().setOffline(false)
  await row(phone, 'Recipes for the week').click()
  await expect(phone.locator('.editor-body')).toContainText('on Thursday or Friday')

  // The phone sent what the backup has too, and the log holds each of those once.
  const doubled = execFileSync('sqlite3', [
    '-cmd',
    '.timeout 5000',
    '../server/data/e2e-restore-backup.db',
    'select count(*) from (select 1 from doc_updates group by doc_id, "update" having count(*) > 1)',
  ])
  expect(doubled.toString().trim()).toBe('0')
})
