import { expect, type Locator } from '@playwright/test'
import { display, newNote, row, rowTitles, shareWith, signIn, test, typeAtEnd, uid } from './helpers'

test('a shared note lands under the other person\'s pins, can be left via their trash, and goes when unshared', async ({
  browser,
}) => {
  // Bob sees only Alice's first name.
  const id = uid()
  const a = `alice-${id} smith`
  const first = `Alice-${id}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(bob, 'Mine')
  await bob.getByRole('button', { name: 'Pin', exact: true }).click()

  await newNote(alice, 'Groceries', 'milk')
  await alice.getByRole('button', { name: 'Checklist', exact: true }).click()
  await shareWith(alice, b)
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()
  // Who it is shared with or by leads the header's buttons.
  const x = async (l: Locator) => (await l.boundingBox())!.x
  const checked = (page: typeof alice) => x(page.getByRole('button', { name: 'Checked lines' }))
  expect(await x(alice.getByRole('button', { name: 'Shared with 1' }))).toBeLessThan(await checked(alice))
  await expect(row(alice, 'Groceries').getByRole('img', { name: 'Shared' })).toBeVisible()

  await expect(row(bob, 'Groceries')).toContainText(first)
  await expect(row(bob, 'Groceries').getByRole('img', { name: 'Shared' })).toBeVisible()
  expect(await rowTitles(bob)).toEqual(['Mine', 'Groceries'])
  await row(bob, 'Groceries').click()
  expect(await x(bob.getByRole('button', { name: `Shared by ${first}` }))).toBeLessThan(await checked(bob))
  await bob.getByRole('button', { name: `Shared by ${first}` }).click()
  await expect(bob.getByText(`Shared by ${first}`, { exact: true })).toBeVisible()
  await expect(bob.getByRole('button', { name: /^Share$|^Shared with/ })).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(bob.locator('.editor-body')).toContainText('milk')

  // Leaving is Bob's own trash. Alice's note and her share are untouched until he leaves for good.
  await bob.getByRole('button', { name: 'Leave' }).click()
  await expect(row(bob, 'Groceries')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Trash (1)' }).click()
  await expect(bob.locator('aside').getByRole('button', { name: 'Groceries' })).toContainText(first)
  await bob.locator('aside').getByRole('button', { name: 'Groceries' }).click()
  await expect(bob.locator('main').getByRole('button', { name: `Shared by ${first}` })).toBeVisible()
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

test('an edit link lets someone without an account edit the note under a made-up name, until the owner turns it off', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const alice = await signIn(browser, a)
  await newNote(alice, 'Party', 'Chips')
  await alice.getByRole('button', { name: 'Share', exact: true }).click()
  await alice.getByRole('button', { name: 'New edit link' }).click()
  await expect(alice.getByText('Nobody yet')).toBeVisible()
  const { links } = await (await alice.request.get(`/api/docs/${alice.url().split('/n/')[1]}/links`)).json()
  await alice.getByRole('button', { name: 'Close' }).click()

  // A phone that has never seen the app gets the note and nothing around it.
  const phone = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const guest = await phone.newPage()
  await guest.goto(`/s/${links[0].token}`)
  await expect(guest.locator('[data-title]')).toHaveText('Party')
  await expect(guest.getByPlaceholder('Title')).toHaveCount(0)
  await expect(guest.getByRole('button', { name: /^New note|^Back$|^Share$|^Leave$|^Pin$/ })).toHaveCount(0)
  const users = await (await guest.request.get('/api/users')).json()
  expect(users.users.map((u: { name: string }) => u.name)).toEqual([display(a)])
  await typeAtEnd(guest, ' and dip')
  await expect(alice.locator('.editor-body')).toContainText('Chips and dip')
  const name = alice.locator('.collaboration-carets__label')
  await expect(name).toHaveText(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  const guestName = (await name.textContent())!

  await alice.getByRole('button', { name: 'Shared with 1' }).click()
  await expect(alice.getByRole('dialog').getByText(guestName)).toBeVisible()
  await alice.getByRole('button', { name: 'Turn off this link' }).click()
  await expect(guest.getByText('no longer shared')).toBeVisible()
  await alice.getByRole('button', { name: 'Close' }).click()
  await expect(alice.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
})

test('a read link shows the note and its edits without letting its guest change it, and turns off on its own', async ({
  browser,
}) => {
  const alice = await signIn(browser, `alice-${uid()}`)
  await newNote(alice, 'Groceries', 'Milk')
  const note = alice.url().split('/n/')[1]
  await alice.getByRole('button', { name: 'Share', exact: true }).click()
  await alice.getByRole('button', { name: 'New read link' }).click()
  await alice.getByRole('button', { name: 'New edit link' }).click()
  await expect(alice.getByText('Can edit')).toBeVisible()
  const { links } = await (await alice.request.get(`/api/docs/${note}/links`)).json()
  const token = (readOnly: boolean) => links.find((link: { read_only: boolean }) => link.read_only === readOnly).token
  await alice.getByRole('button', { name: 'Close' }).click()

  const viewer = await (await browser.newContext()).newPage()
  await viewer.goto(`/s/${token(true)}`)
  await expect(viewer.locator('.editor-body')).toContainText('Milk')
  await expect(viewer.locator('.editor-body')).toHaveAttribute('contenteditable', 'false')
  await expect(viewer.getByRole('button', { name: 'Checklist' })).toHaveCount(0)
  await typeAtEnd(alice, ' and eggs')
  await expect(viewer.locator('.editor-body')).toContainText('Milk and eggs')

  const editor = await (await browser.newContext()).newPage()
  await editor.goto(`/s/${token(false)}`)
  await expect(editor.locator('.editor-body')).toHaveAttribute('contenteditable', 'true')

  await alice.getByRole('button', { name: 'Shared with 2' }).click()
  const viewLink = alice.getByRole('listitem').filter({ hasText: 'Can read' })
  await viewLink.getByRole('button', { name: 'Turn off this link' }).click()
  await expect(viewer.getByText('no longer shared')).toBeVisible()
  await typeAtEnd(editor, ' and bread')
  await expect(alice.locator('.editor-body')).toContainText('Milk and eggs and bread')
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
  await page.getByRole('button', { name: 'New edit link' }).click()
  await page.getByRole('button', { name: 'Turn off this link' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})
