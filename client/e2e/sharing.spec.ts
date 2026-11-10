import { expect, test } from '@playwright/test'
import { display, newNote, row, rowTitles, shareWith, signIn, uid } from './helpers'

test('a shared note lands under the other person\'s pins, can be left via their trash, and goes when unshared', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(bob, 'Mine')
  await bob.getByRole('button', { name: 'Pin', exact: true }).click()

  await newNote(alice, 'Groceries', 'milk')
  await shareWith(alice, b)
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()
  await expect(row(alice, 'Groceries')).toContainText('shared')

  await expect(row(bob, 'Groceries')).toContainText(display(a))
  expect(await rowTitles(bob)).toEqual(['Mine', 'Groceries'])
  await row(bob, 'Groceries').click()
  await expect(bob.getByText(`Shared by ${display(a)}`)).toBeVisible()
  await expect(bob.getByRole('button', { name: /^Share/ })).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(bob.locator('.editor-body')).toContainText('milk')

  // Leaving is Bob's own trash. Alice's note and her share are untouched until he leaves for good.
  await bob.getByRole('button', { name: 'Leave' }).click()
  await expect(row(bob, 'Groceries')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Trash (1)' }).click()
  await expect(bob.locator('aside').getByRole('button', { name: 'Groceries' })).toContainText(display(a))
  await bob.locator('aside').getByRole('button', { name: 'Groceries' }).click()
  await expect(bob.locator('main')).toContainText(`Shared by ${display(a)}`)
  await bob.locator('main').getByRole('button', { name: 'Restore' }).click()
  await expect(row(bob, 'Groceries')).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()

  await row(bob, 'Groceries').click()
  await bob.getByRole('button', { name: 'Leave' }).click()
  await bob.locator('aside').getByRole('button', { name: 'Leave for good' }).click()
  await expect(bob.getByRole('button', { name: /^Trash/ })).toHaveCount(0)
  await expect(alice.getByRole('button', { name: 'Share', exact: true })).toBeVisible()

  await shareWith(alice, b)
  await row(bob, 'Groceries').click()
  await expect(bob.locator('.editor-body')).toContainText('milk')
  await shareWith(alice, b)
  await expect(row(bob, 'Groceries')).toHaveCount(0)
  await expect(bob.getByText('no longer shared')).toBeVisible()
})
