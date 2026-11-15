import { expect } from '@playwright/test'
import { newNote, row, shareWith, signIn, test, typeAtEnd, uid } from './helpers'

test('two people typing in one note see each other\'s caret and first name, until that person is still', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const id = uid()
  const b = `bob-${id} jones`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)

  await newNote(alice, 'Shared list', 'alpha')
  await shareWith(alice, b)
  await row(bob, 'Shared list').click()
  await expect(bob.locator('.editor-body')).toContainText('alpha')

  await typeAtEnd(bob, ' bravo')
  await expect(alice.locator('.editor-body')).toContainText('bravo')
  const caret = alice.locator('.collaboration-carets__caret')
  await expect(caret).toHaveText(`Bob-${id}`)
  // Bob's caret goes once he has been still a few seconds.
  await expect(caret).toHaveCount(0)
  await typeAtEnd(bob, '!')
  await expect(caret).toHaveText(`Bob-${id}`)

  await typeAtEnd(alice, ' charlie')
  await expect(bob.locator('.editor-body')).toContainText('charlie')
  await expect(bob.locator('.editor-body')).toContainText('alpha bravo! charlie')
})
