import { expect, test } from '@playwright/test'
import { display, newNote, row, rowTitles, shareWith, signIn, typeAtEnd, uid } from './helpers'

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

test('a link lets someone without an account edit the note under a made-up name, until the owner turns it off', async ({
  browser,
}) => {
  const alice = await signIn(browser, `alice-${uid()}`)
  await newNote(alice, 'Party', 'Chips')
  await alice.getByRole('button', { name: 'Share', exact: true }).click()
  await alice.getByRole('button', { name: 'Create link' }).click()
  const link = await alice.getByRole('textbox', { name: 'Link' }).inputValue()
  await alice.getByRole('button', { name: 'Done' }).click()

  // A phone that has never seen the app.
  const phone = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const guest = await phone.newPage()
  await guest.goto(link)
  await expect(guest.getByPlaceholder('Title')).toHaveValue('Party')
  await typeAtEnd(guest, ' and dip')
  await expect(alice.locator('.editor-body')).toContainText('Chips and dip')
  const name = alice.locator('.collaboration-carets__label')
  await expect(name).toHaveText(/^[A-Z][a-z]+ [A-Z][a-z]+$/)

  await alice.getByRole('button', { name: 'Shared with 1' }).click()
  await expect(alice.getByText(`Opened by ${await name.textContent()}`)).toBeVisible()
  await alice.getByRole('button', { name: 'Turn off' }).click()
  await expect(guest.getByText('no longer shared')).toBeVisible()
  await alice.getByRole('button', { name: 'Done' }).click()
  await expect(alice.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
})

test('with many people at a large size, the share dialog scrolls to every button', async ({ browser, request }) => {
  for (let n = 0; n < 12; n++) await request.get(`/auth/login?as=friend${n}-${uid()}`)
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } })
  await context.addInitScript(() => localStorage.setItem('density', 'large'))
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.keyboard.type('Party')

  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Create link' }).click()
  await page.getByRole('button', { name: 'Turn off' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})
