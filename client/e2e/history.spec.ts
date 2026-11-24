import { expect, type Page } from '@playwright/test'
import { newNote, row, shareWith, signIn, test, typeAtEnd, uid } from './helpers'

test('History shows an older version read-only, and Restore brings it back for everyone on the note', async ({
  browser,
}) => {
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, `alice-${uid()}`)
  await newNote(alice, 'Groceries', 'milk')
  await shareWith(alice, b)
  await row(bob, 'Groceries').click()
  await expect(bob.locator('.editor-body')).toHaveText('milk')

  const history = `/api/docs/${alice.url().split('/n/')[1]}/history`
  const { rows } = await (await alice.request.get(history)).json()
  const [before, at] = rows.at(-1)
  await typeAtEnd(alice, ' eggs')
  await expect(bob.locator('.editor-body')).toHaveText('milk eggs')

  // Versions a minute apart would take a minute to write, so the rows up to `before` read as one minute five minutes ago.
  await alice.route(`**${history}`, async (route) => {
    const response = await route.fetch()
    const earlier = new Date(Date.parse(at) - 5 * 60_000).toISOString()
    const { rows } = await response.json()
    const json = { rows: rows.map(([seq, at, update]: [number, string, string]) => [seq, seq <= before ? earlier : at, update]) }
    await route.fulfill({ response, json })
  })

  await alice.getByRole('button', { name: 'More' }).click()
  await alice.getByRole('button', { name: 'History' }).click()
  const versions = alice.getByRole('group', { name: 'Versions' }).getByRole('button')
  await expect(versions.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(alice.locator('.editor-body')).toHaveText('milk eggs')
  await versions.last().click()
  await expect(alice.locator('.editor-body')).toHaveText('milk')
  await expect(alice.locator('.editor-body')).toHaveAttribute('contenteditable', 'false')

  await alice.getByRole('button', { name: 'Restore' }).click()
  await expect(alice.getByRole('group', { name: 'Versions' })).toHaveCount(0)
  await expect(alice.locator('.editor-body')).toHaveText('milk')
  await expect(alice.locator('.editor-body')).toHaveAttribute('contenteditable', 'true')
  await expect(bob.locator('.editor-body')).toHaveText('milk')

  await alice.context().setOffline(true)
  await expect(alice.locator('main').getByRole('img', { name: 'Offline' })).toBeVisible()
  await alice.getByRole('button', { name: 'More' }).click()
  await alice.getByRole('button', { name: 'History' }).click()
  await expect(alice.getByText('History needs a connection.')).toBeVisible()
  await alice.getByRole('button', { name: 'Cancel' }).click()
  await expect(alice.locator('.editor-body')).toHaveText('milk')
})

test('History opens a version at this device’s cursor, or at its end, and back at a version where it was scrolled', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await signIn(browser, name)
  const lines = (from: number) => Array.from({ length: 40 }, (_, i) => `line ${from + i}`).join('\n')
  await newNote(page, 'Long', lines(1))
  // Another device of hers shows what has reached the server.
  const other = await signIn(browser, name)
  await row(other, 'Long').click()
  const line = (p: Page, n: number) => p.locator('.editor-body p').getByText(`line ${n}`, { exact: true })
  await expect(line(other, 40)).toBeAttached()
  const history = `/api/docs/${page.url().split('/n/')[1]}/history`
  const { rows } = await (await page.request.get(history)).json()
  const [before, at] = rows.at(-1)
  await page.keyboard.press('Enter')
  await page.keyboard.type(lines(41))
  await expect(line(other, 80)).toBeAttached()
  await line(page, 60).click()

  await page.route(`**${history}`, async (route) => {
    const response = await route.fetch()
    const earlier = new Date(Date.parse(at) - 5 * 60_000).toISOString()
    const { rows } = await response.json()
    const json = { rows: rows.map(([seq, at, update]: [number, string, string]) => [seq, seq <= before ? earlier : at, update]) }
    await route.fulfill({ response, json })
  })
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'History' }).click()
  const versions = page.getByRole('group', { name: 'Versions' }).getByRole('button')
  await expect(line(page, 60)).toBeInViewport()
  await expect(line(page, 80)).not.toBeInViewport()

  await versions.last().click()
  await expect(line(page, 60)).toHaveCount(0)
  await expect(line(page, 40)).toBeInViewport()
  await expect(line(page, 1)).not.toBeInViewport()
  await page.locator('.editor-body').evaluate((body) => (body.parentElement!.scrollTop = 0))
  await versions.first().click()
  await expect(line(page, 60)).toBeInViewport()
  await versions.last().click()
  await expect(line(page, 1)).toBeInViewport()
})
