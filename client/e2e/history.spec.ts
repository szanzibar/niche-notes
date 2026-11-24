import { expect } from '@playwright/test'
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
