import { expect, test } from '@playwright/test'
import { drag, newNote, row, rowTitles, shareWith, signIn, uid } from './helpers'

test('dragging a note onto another nests it, and onto the header puts it back at the top', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Parent')
  await newNote(page, 'Child')

  await drag(page, row(page, 'Child'), row(page, 'Parent'))
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'Child')).toBeHidden()
  await page.getByRole('button', { name: 'Expand' }).click()

  await drag(page, row(page, 'Child'), page.locator('aside header'))
  await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0)
  await expect(row(page, 'Child')).toBeVisible()
})

test('dropping on the edge of a row makes a sibling, in the order you dropped it', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  expect(await rowTitles(page)).toEqual(['Cherry', 'Banana', 'Apple'])

  await drag(page, row(page, 'Apple'), row(page, 'Cherry'), 'top')
  expect(await rowTitles(page)).toEqual(['Apple', 'Cherry', 'Banana'])

  await drag(page, row(page, 'Cherry'), row(page, 'Banana'), 'bottom')
  expect(await rowTitles(page)).toEqual(['Apple', 'Banana', 'Cherry'])
  await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0)
})

test('a pinned note sits above its siblings until unpinned', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  await row(page, 'Apple').click()
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  expect(await rowTitles(page)).toEqual(['Apple', 'Cherry', 'Banana'])
  await page.getByRole('button', { name: 'Unpin' }).click()
  expect(await rowTitles(page)).toEqual(['Cherry', 'Banana', 'Apple'])
})

test('on a touch screen every row shows a drag handle', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/auth/login?as=alice-${uid()}`)
  await page.getByRole('button', { name: '+ New' }).click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Phone')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(row(page, 'Phone')).toBeVisible()
  await expect(page.locator('[data-handle]')).toBeVisible()
})

test('a note dropped inside another becomes its first child, and the header puts it on top', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Old')
  await newNote(page, 'Parent')
  await page.getByRole('button', { name: 'New note inside' }).first().click()
  await expect(page.getByPlaceholder('Title')).toBeFocused()
  await page.keyboard.type('Kid')
  expect(await rowTitles(page)).toEqual(['Parent', 'Kid', 'Old'])

  // Old is the oldest note. Where it lands follows the drop, not its age.
  await drag(page, row(page, 'Old'), row(page, 'Parent'))
  expect(await rowTitles(page)).toEqual(['Parent', 'Old', 'Kid'])
  await drag(page, row(page, 'Old'), page.locator('aside header'))
  expect(await rowTitles(page)).toEqual(['Old', 'Parent', 'Kid'])
})

test('dropping just under the pinned notes puts a note at the top of the rest, unpinned', async ({ browser }) => {
  const page = await signIn(browser, `alice-${uid()}`)
  await newNote(page, 'Top')
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await newNote(page, 'Apple')
  await newNote(page, 'Banana')
  await newNote(page, 'Cherry')
  expect(await rowTitles(page)).toEqual(['Top', 'Cherry', 'Banana', 'Apple'])

  await drag(page, row(page, 'Apple'), row(page, 'Cherry'), 'top')
  expect(await rowTitles(page)).toEqual(['Top', 'Apple', 'Cherry', 'Banana'])
  await row(page, 'Apple').click()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
})

test('notes someone shared reorder like any other', async ({ browser }) => {
  const a = `alice-${uid()}`
  const b = `bob-${uid()}`
  const bob = await signIn(browser, b)
  const alice = await signIn(browser, a)
  for (const title of ['One', 'Two', 'Three']) {
    await newNote(alice, title)
    await shareWith(alice, b)
  }
  for (const title of ['One', 'Two', 'Three']) await expect(row(bob, title)).toBeVisible()

  await drag(bob, row(bob, 'One'), row(bob, 'Two'), 'top')
  let titles = await rowTitles(bob)
  expect(titles.indexOf('One')).toBe(titles.indexOf('Two') - 1)
  await drag(bob, row(bob, 'Three'), row(bob, 'Two'), 'bottom')
  titles = await rowTitles(bob)
  expect(titles).toEqual(['One', 'Two', 'Three'])
})
