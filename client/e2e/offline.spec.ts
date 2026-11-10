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

  await alice.context().setOffline(true)
  await expect(alice.getByTitle('Offline')).toBeVisible()
  await typeAtEnd(alice, ' offline-edit')
  await newNote(alice, 'Written offline')
  await typeAtEnd(bob, ' online-edit')
  await expect(bob.locator('.editor-body')).not.toContainText('offline-edit')

  await alice.context().setOffline(false)
  await expect(alice.getByTitle('Online')).toBeVisible()
  await expect(bob.locator('.editor-body')).toContainText('offline-edit')
  await row(alice, 'Plan').click()
  await expect(alice.locator('.editor-body')).toContainText('online-edit')

  // A fresh device for alice sees the note she wrote offline, so it reached the server.
  const aliceAgain = await signIn(browser, a)
  await expect(row(aliceAgain, 'Written offline')).toBeVisible()
})
