import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { display, uid } from '../e2e/helpers'

const driver = async (method: string, path: string, body?: object) => {
  const res = await fetch(`http://localhost:4444${path}`, { method, body: body && JSON.stringify(body) })
  const { value } = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(value)}`)
  return value
}

test('Export all notes saves the zip in Downloads, under a new name when one is there', async () => {
  const { sessionId } = await driver('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: '/target/debug/niche-notes' } } },
  })
  const session = `/session/${sessionId}`
  const click = async (using: string, value: string) => {
    const element = Object.values(await driver('POST', `${session}/element`, { using, value }))[0]
    await driver('POST', `${session}/element/${element}/click`, {})
  }
  try {
    await driver('POST', `${session}/timeouts`, { implicit: 10_000 })
    // The app opens its window a moment after the session starts.
    const name = `alice-${uid()}`
    await expect(() => driver('POST', `${session}/url`, { url: `http://localhost:5199/auth/login?as=${name}` })).toPass()
    // The app still holds the person from the test before, and reloads once it hears who this is.
    const me = { using: 'xpath', value: `//footer/span[text()="${display(name)}"]` }
    await expect(() => driver('POST', `${session}/element`, me)).toPass()
    await click('css selector', '[aria-label="Settings"]')
    const downloads = () => execSync('docker exec nichenotes-app-e2e ls /root/Downloads').toString()
    await click('xpath', '//button[text()="Export all notes"]')
    await expect.poll(downloads).toBe('Niche Notes.zip\n')
    await click('xpath', '//button[text()="Export all notes"]')
    await expect.poll(downloads).toBe('Niche Notes (1).zip\nNiche Notes.zip\n')
  } finally {
    await driver('DELETE', session)
  }
})
