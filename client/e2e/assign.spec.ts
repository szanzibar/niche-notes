import { expect, type Page } from '@playwright/test'
import { display, newNote, shareWith, signIn, test, uid } from './helpers'

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const line = (page: Page, text: string) =>
  page.locator('.editor-body li').filter({ has: page.locator('p').getByText(text, { exact: true }) })
const person = (page: Page, text: string) => line(page, text).locator('> .person-chip')
const due = (page: Page) => page.getByRole('button', { name: /^Due \(/ })
// Who the server tells about each line's person, from the editor's own copy of the note.
const assignedBy = (page: Page) =>
  page.evaluate(() => {
    const found: Record<string, string | null> = {}
    const editor = (document.querySelector('.editor-body') as HTMLElement & { editor: import('@tiptap/react').Editor }).editor
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskItem') found[node.firstChild!.textContent] = node.attrs.assignedBy
    })
    return found
  })

test('Assign gives a task to one person on the note, whose Due alone lists it, and Nobody gives it back', async ({
  browser,
}) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(alice, 'Groceries', 'milk')
  await tool(alice, 'Task list').click()
  // A note shared with nobody has nobody else to assign.
  await expect(tool(alice, 'Assign')).toHaveCount(0)
  await tool(alice, 'Date').click()
  await tool(alice, 'Today').click()
  await alice.keyboard.press('Escape')
  await shareWith(alice, b)
  await expect(due(alice)).toHaveAccessibleName('Due (1)')

  await alice.locator('.editor-body p').getByText('milk', { exact: true }).click()
  await tool(alice, 'Assign').click()
  await expect(tool(alice, 'Nobody')).toHaveAttribute('aria-pressed', 'true')
  await tool(alice, display(b)).click()
  await expect(person(alice, 'milk')).toHaveAttribute('data-label', display(b))
  await expect(due(alice)).toHaveCount(0)
  await expect(due(bob)).toHaveAccessibleName('Due (1)')

  // A tap on the name opens the same box.
  await person(alice, 'milk').click()
  await expect(tool(alice, display(b))).toHaveAttribute('aria-pressed', 'true')
  await tool(alice, 'Nobody').click()
  await expect(line(alice, 'milk')).not.toHaveAttribute('data-assignee')
  await expect(due(alice)).toHaveAccessibleName('Due (1)')
  await expect(due(bob)).toHaveAccessibleName('Due (1)')
})

test('@ and a name assign the line and leave the text, and Escape keeps the words', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(alice, 'Party')
  await shareWith(alice, b)
  await alice.locator('.editor-body').click()
  await tool(alice, 'Task list').click()

  await alice.keyboard.type('Chips @')
  await expect(tool(alice, display(a))).toBeVisible()
  await expect(tool(alice, display(b))).toBeVisible()
  await alice.keyboard.type('bo')
  await expect(tool(alice, display(a))).toHaveCount(0)
  await alice.keyboard.press('Enter')
  await expect(person(alice, 'Chips')).toHaveAttribute('data-label', display(b))
  await expect(tool(alice, display(b))).toHaveCount(0)

  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Dip @bo')
  await alice.keyboard.press('Escape')
  await expect(tool(alice, display(b))).toHaveCount(0)
  await alice.keyboard.press('Enter')
  await expect(line(alice, 'Dip @bo')).not.toHaveAttribute('data-assignee')

  await alice.keyboard.type('Ice @')
  await tool(alice, display(a)).click()
  await expect(person(alice, 'Ice')).toHaveAttribute('data-label', display(a))
  // Bob hears who assigned him Chips. Assigning herself tells nobody.
  const { user } = await (await alice.request.get('/api/me')).json()
  expect(await assignedBy(alice)).toEqual({ Chips: user.id, 'Dip @bo': null, Ice: null })
})

test("a guest sees a task's person only when it is the owner, and can't assign", async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  await signIn(browser, b)
  const alice = await signIn(browser, a)
  await newNote(alice, 'Chores')
  await shareWith(alice, b)
  await alice.locator('.editor-body').click()
  await tool(alice, 'Task list').click()
  await alice.keyboard.type('Rent @al')
  await alice.keyboard.press('Enter')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Bins @bo')
  await alice.keyboard.press('Enter')
  await expect(person(alice, 'Bins')).toHaveAttribute('data-label', display(b))

  await alice.getByRole('button', { name: /^Shared with/ }).click()
  await alice.getByRole('button', { name: 'New edit link' }).click()
  const { links } = await (await alice.request.get(`/api/docs/${alice.url().split('/n/')[1]}/links`)).json()
  await alice.getByRole('button', { name: 'Close' }).click()

  const guest = await (await browser.newContext()).newPage()
  await guest.goto(`/s/${links[0].token}`)
  await expect(line(guest, 'Bins')).toBeVisible()
  await expect(person(guest, 'Rent')).toHaveAttribute('data-label', display(a))
  await expect(person(guest, 'Bins')).not.toHaveAttribute('data-label')
  await expect(tool(guest, 'Task list')).toBeVisible()
  await expect(tool(guest, 'Assign')).toHaveCount(0)
})
