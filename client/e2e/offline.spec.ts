import { expect, test } from '@playwright/test'
import { newNote, row, shareWith, signIn, typeAtEnd, uid } from './helpers'

test('edits made offline arrive when back online, and the other side catches up', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)

  await newNote(alice, 'Plan', 'start')
  await shareWith(alice, b)
  await row(bob, 'Plan').click()
  await expect(bob.locator('.editor-body')).toContainText('start')

  // The icon sits in both headers, since a phone shows only one of them.
  const icons = alice.getByRole('img', { name: 'Offline' })
  await expect(icons).toHaveCount(0)
  await alice.context().setOffline(true)
  await expect(alice.locator('aside').getByRole('img', { name: 'Offline' })).toBeVisible()
  await expect(alice.locator('main').getByRole('img', { name: 'Offline' })).toBeVisible()
  await typeAtEnd(alice, ' offline-edit')
  await newNote(alice, 'Written offline')
  await typeAtEnd(bob, ' online-edit')
  await expect(bob.locator('.editor-body')).not.toContainText('offline-edit')

  await alice.context().setOffline(false)
  await expect(icons).toHaveCount(0)
  await expect(bob.locator('.editor-body')).toContainText('offline-edit')
  await row(alice, 'Plan').click()
  await expect(alice.locator('.editor-body')).toContainText('online-edit')

  // A fresh device for alice sees the note she wrote offline, so it reached the server.
  const aliceAgain = await signIn(browser, a)
  await expect(row(aliceAgain, 'Written offline')).toBeVisible()
})

test('a launch draws the note from the device while the server has not answered', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Groceries', 'milk')
  await page.route('**/api/me', () => {})
  await page.reload()
  await expect(page.locator('.editor-body')).toContainText('milk')
})

test('signing in as someone else on the same browser shows their tree', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Alice only')
  await page.goto(`/auth/login?as=bob-${uid()}`)
  await expect(row(page, 'Alice only')).toHaveCount(0)
})

test('a launch with an expired token still syncs once the server answers', async ({ browser }) => {
  const a = `alice-${uid()}`
  const page = await signIn(browser, a)
  await newNote(page, 'Groceries', 'milk')
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('session')!)
    localStorage.setItem('session', JSON.stringify({ ...session, token: 'expired' }))
  })
  await page.reload()
  await typeAtEnd(page, ' eggs')
  const again = await signIn(browser, a)
  await row(again, 'Groceries').click()
  await expect(again.locator('.editor-body')).toContainText('eggs')
})

test('coming back to the app catches up at once, even over a connection that died while away', async ({ browser }) => {
  const a = `alice-${uid()}`
  const page = await signIn(browser, a)
  await newNote(page, 'Away', 'one')
  // Connections from here on pass through a proxy that can go silent without closing, as Android leaves them.
  const links: { silent: boolean; joins: number }[] = []
  await page.routeWebSocket(/\/socket\//, (ws) => {
    const link = { silent: false, joins: 0 }
    links.push(link)
    const server = ws.connectToServer()
    ws.onMessage((message) => !link.silent && server.send(message))
    server.onMessage((message) => {
      if (link.silent) return
      if (String(message).includes('"doc:') && String(message).includes('"phx_reply"')) link.joins++
      ws.send(message)
    })
  })
  await page.reload()
  // The tree and the note have joined.
  await expect.poll(() => links[0]?.joins ?? 0).toBeGreaterThanOrEqual(2)
  links[0].silent = true

  const other = await signIn(browser, a)
  await row(other, 'Away').click()
  await typeAtEnd(other, ' two')

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.editor-body')).toContainText('one two', { timeout: 10_000 })
})
