import { expect } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { row, rowTitles, signIn, test, uid } from './helpers'

// Shaped like Amplenote's export: front matter, markdown, task details in comments, and ticked tasks under a
// heading of Amplenote's own at the end.
const packing = `---
title: Packing list
updated: '2025-01-02T00:00:00Z'
tags:
  - travel/packing
---

Toiletries

- [ ] Phone<!-- {"uuid":"a"} -->

\\

# Completed tasks<!-- {"omit":true} -->

- [x] Socks<!-- {"uuid":"b","completedAt":1724734146} -->
`

const todo = `---
title: 'Tim''s todo'
updated: '2025-01-01T00:00:00Z'
tags:
  - work
  - todo
---

- [ ] Call the bank<!-- {"duration":"PT1H","startAt":1771329600,"uuid":"c"} -->

| | | |
|-|-|-|
|Grind|Temp||
`

const recipes = `---
title: Recipes
updated: '2025-03-01T00:00:00Z'
---

1. Mix **flour**
2. Bake
`

// Past a hundred notes, so the second device has to sync more of them than a socket allows by default.
const fillers = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [
    `Filler ${i}.md`,
    strToU8(`---\ntitle: Filler ${i}\nupdated: '2020-01-01T00:00:00Z'\n---\n\nWords\n`),
  ]),
)

test('an Amplenote export comes in under one note, with a note for each tag, and reaches another device whole', async ({
  browser,
}) => {
  const name = `alice-${uid()}`
  const page = await (await browser.newContext({ timezoneId: 'Europe/Zurich' })).newPage()
  await page.goto(`/auth/login?as=${name}`)

  await page.getByRole('button', { name: 'Settings' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import from Amplenote' }).click()
  const zip = zipSync({
    'Packing list.md': strToU8(packing),
    "Tim's todo.md": strToU8(todo),
    'Recipes.md': strToU8(recipes),
    'images/x/photo.png': new Uint8Array([1, 2, 3]),
    ...fillers,
  })
  await (await chooser).setFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
  await expect(page.getByText('Imported 103 notes into Amplenote import.')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  // Tags first, alphabetically, then notes by their last edit. A note with two tags sits under its first.
  await expect
    .poll(async () => (await rowTitles(page)).slice(0, 7))
    .toEqual(['Amplenote import', 'travel', 'packing', 'Packing list', 'work', "Tim's todo", 'Recipes'])
  expect(await page.locator('aside').getByText('todo', { exact: true }).count()).toBe(0)

  // Amplenote kept ticked tasks out of sight, and so does the note.
  await row(page, 'Packing list').click()
  const body = page.locator('.editor-body')
  // The editor keeps an empty line after a list that ends the note.
  await expect(body.locator('p')).toHaveText(['Toiletries', 'Phone', '', 'Socks', ''])
  await expect(body.locator('li[data-checked="true"]')).toHaveText('Socks')
  await expect(body.locator('li[data-checked="true"]')).toBeHidden()
  await expect(body.locator('li[data-checked="false"]')).toBeVisible()

  // A task's start time is its date, a table stays a table, and markdown keeps its marks.
  await row(page, "Tim's todo").click()
  await expect(body.locator('li[data-due="2026-02-17T13:00"][data-duration="60"]')).toHaveText('Call the bank')
  await expect(body.locator('table tr')).toHaveCount(1)
  await expect(body.locator('table td')).toHaveText(['Grind', 'Temp', ''])
  await row(page, 'Recipes').click()
  await expect(body.locator('ol li')).toHaveText(['Mix flour', 'Bake'])
  await expect(body.locator('ol strong')).toHaveText('flour')

  const other = await signIn(browser, name)
  await expect.poll(async () => (await rowTitles(other)).length).toBe(107)
  await expect.poll(async () => (await rowTitles(other)).filter((title) => title === 'Untitled').length).toBe(0)
})
