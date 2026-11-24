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
  await bob.getByRole('button', { name: 'More' }).click()
  await bob.getByRole('button', { name: 'Pin', exact: true }).click()

  await newNote(alice, 'Groceries', 'milk')
  await alice.getByRole('button', { name: 'Task list', exact: true }).click()
  await shareWith(alice, b)
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()
  // Who it is shared with or by sits before the dots.
  const x = async (l: Locator) => (await l.boundingBox())!.x
  const more = (page: typeof alice) => x(page.getByRole('button', { name: 'More' }))
  expect(await x(alice.getByRole('button', { name: 'Shared with 1' }))).toBeLessThan(await more(alice))
  await expect(row(alice, 'Groceries').getByRole('img', { name: 'Shared' })).toBeVisible()

  await expect(row(bob, 'Groceries')).toContainText(first)
  await expect(row(bob, 'Groceries').getByRole('img', { name: 'Shared' })).toBeVisible()
  expect(await rowTitles(bob)).toEqual(['Mine', 'Groceries'])
  await row(bob, 'Groceries').click()
  const owner = bob.locator('main').getByRole('img', { name: `Shared by ${first}` })
  await expect(owner).toHaveText(first)
  expect(await x(owner)).toBeLessThan(await more(bob))
  await expect(bob.getByRole('button', { name: /^Share$|^Shared with/ })).toHaveCount(0)
  await expect(bob.locator('.editor-body')).toContainText('milk')

  // Leaving is Bob's own trash. Alice's note and her share are untouched until he leaves for good.
  await bob.getByRole('button', { name: 'More' }).click()
  await expect(bob.getByRole('button', { name: 'Delete note' })).toHaveCount(0)
  await bob.getByRole('button', { name: 'Leave note' }).click()
  await expect(row(bob, 'Groceries')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Trash (1)' }).click()
  await expect(bob.locator('aside').getByRole('button', { name: 'Groceries' })).toContainText(first)
  await bob.locator('aside').getByRole('button', { name: 'Groceries' }).click()
  await expect(owner).toBeVisible()
  await bob.locator('main').getByRole('button', { name: 'Restore' }).click()
  await expect(row(bob, 'Groceries')).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Shared with 1' })).toBeVisible()

  await row(bob, 'Groceries').click()
  await bob.getByRole('button', { name: 'More' }).click()
  await bob.getByRole('button', { name: 'Leave note' }).click()
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
  await alice.getByRole('button', { name: 'Turn off' }).click()
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
  await expect(viewer.getByRole('button', { name: 'Task list' })).toHaveCount(0)
  await typeAtEnd(alice, ' and eggs')
  await expect(viewer.locator('.editor-body')).toContainText('Milk and eggs')

  const editor = await (await browser.newContext()).newPage()
  await editor.goto(`/s/${token(false)}`)
  await expect(editor.locator('.editor-body')).toHaveAttribute('contenteditable', 'true')

  await alice.getByRole('button', { name: 'Shared with 2' }).click()
  const viewLink = alice.getByRole('listitem').filter({ hasText: 'Can read' })
  await viewLink.getByRole('button', { name: 'Turn off' }).click()
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
  await page.getByRole('button', { name: 'Turn off' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the share dialog puts the person we share with most on top and finds anyone else by name', async ({
  browser,
  request,
}) => {
  for (let n = 0; n < 4; n++) await request.get(`/auth/login?as=aaron${n}-${uid()}`)
  const b = `bob-${uid()}`
  const c = `carol-${uid()}`
  await request.get(`/auth/login?as=${b}`)
  await request.get(`/auth/login?as=${c}`)
  const alice = await signIn(browser, `alice-${uid()}`)
  const dialog = alice.getByRole('dialog')
  const field = dialog.getByRole('searchbox', { name: 'Search people' })

  await newNote(alice, 'One')
  await alice.getByRole('button', { name: 'Share', exact: true }).click()
  await field.fill(display(c))
  await expect(dialog.getByRole('listitem')).toHaveText([display(c)])
  await field.press('Enter')
  await expect(field).toHaveValue('')
  await expect(dialog.getByRole('button', { name: display(c), pressed: true })).toBeVisible()
  await field.fill('nobody-here')
  await expect(dialog.getByText('Nobody by that name.')).toBeVisible()
  await alice.getByRole('button', { name: 'Close' }).click()

  await newNote(alice, 'Two')
  await alice.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(dialog.getByRole('listitem').first()).toHaveText(display(c))
  await expect(dialog.getByRole('listitem').filter({ hasText: display(b) })).toHaveCount(0)
})
