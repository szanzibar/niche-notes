import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { uid } from '../e2e/helpers'

const driver = async (method: string, path: string, body?: object) => {
  const res = await fetch(`http://localhost:4444${path}`, { method, body: body && JSON.stringify(body) })
  const { value } = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(value)}`)
  return value
}

test('a link in a note opens in the default browser from the box under it, and a click on the link edits it', async () => {
  const { sessionId } = await driver('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: '/target/debug/niche-notes' } } },
  })
  const session = `/session/${sessionId}`
  const find = async (css: string) =>
    Object.values(await driver('POST', `${session}/element`, { using: 'css selector', value: css }))[0]
  const click = async (css: string) => driver('POST', `${session}/element/${await find(css)}/click`, {})
  const type = async (css: string, text: string) =>
    driver('POST', `${session}/element/${await find(css)}/value`, { text })
  try {
    await driver('POST', `${session}/timeouts`, { implicit: 10_000 })
    // The app opens its window a moment after the session starts.
    const signIn = `http://localhost:5199/auth/login?as=alice-${uid()}`
    await expect(() => driver('POST', `${session}/url`, { url: signIn })).toPass()
    await click('[aria-label="New note"]')
    await type('[placeholder="Title"]', 'Recipes\uE007')
    await click('[aria-label="Link"]')
    await type('[aria-label="Link address"]', 'https://example.com/turkey\uE007')

    await click('.editor-body a')
    await click('[title="Open link"]')
    await expect
      .poll(() => execSync('docker exec nichenotes-app-e2e cat /tmp/opened').toString())
      .toBe('https://example.com/turkey\n')
  } finally {
    await driver('DELETE', session)
  }
})
