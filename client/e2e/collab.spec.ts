import { expect, test } from '@playwright/test'
import { display, newNote, row, shareWith, signIn, typeAtEnd, uid } from './helpers'

test('two people typing in one note see each other, with a name that fades while its person is still', async ({ browser }) => {
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
  const name = alice.locator('.collaboration-carets__label')
  await expect(name).toHaveText(display(b))
  await expect(name).toHaveCSS('opacity', '1')
  // Bob's name fades once he has been still a few seconds, and his caret stays.
  await expect(name).toHaveCSS('opacity', '0')
  await expect(alice.locator('.collaboration-carets__caret')).toBeVisible()
  await typeAtEnd(bob, '!')
  await expect(name).toHaveCSS('opacity', '1')

  await typeAtEnd(alice, ' charlie')
  await expect(bob.locator('.editor-body')).toContainText('charlie')
  await expect(bob.locator('.editor-body')).toContainText('alpha bravo! charlie')
})
