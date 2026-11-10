import { expect, test } from '@playwright/test'
import { display, newNote, row, shareWith, signIn, typeAtEnd, uid } from './helpers'

test('two people typing in one note see each other', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)

  await newNote(alice, 'Shared list', 'alpha')
  await shareWith(alice, b)
  await row(bob, 'Shared list').click()
  await expect(bob.locator('.editor-body')).toContainText('alpha')

  await typeAtEnd(bob, ' bravo')
  await expect(alice.locator('.editor-body')).toContainText('bravo')
  await expect(alice.locator('.collaboration-carets__label')).toHaveText(display(b))

  await typeAtEnd(alice, ' charlie')
  await expect(bob.locator('.editor-body')).toContainText('charlie')
  await expect(bob.locator('.editor-body')).toContainText('alpha bravo charlie')
})
