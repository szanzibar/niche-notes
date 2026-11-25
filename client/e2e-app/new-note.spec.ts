import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { display, uid } from '../e2e/helpers'

const driver = async (method: string, path: string, body?: object) => {
  const res = await fetch(`http://localhost:4444${path}`, { method, body: body && JSON.stringify(body) })
  const { value } = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(value)}`)
  return value
}

test("the launcher's New note hands --new to the running app, which opens a blank note in its title once", async () => {
  const { sessionId } = await driver('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: '/target/debug/niche-notes' } } },
  })
  const session = `/session/${sessionId}`
  const run = (script: string) => driver('POST', `${session}/execute/sync`, { script, args: [] })
  // As the launcher runs it, on the session bus the running app listens on.
  const bus = 'tr "\\0" "\\n" < /proc/$(pgrep -xo niche-notes)/environ | grep ^DBUS_SESSION_BUS_ADDRESS='
  const launch = () =>
    execSync(`docker exec nichenotes-app-e2e sh -c 'export DISPLAY=:99 $(${bus}) && timeout 20 /target/debug/niche-notes --new'`)
  try {
    await driver('POST', `${session}/timeouts`, { implicit: 10_000 })
    // The app opens its window a moment after the session starts.
    const name = `alice-${uid()}`
    await expect(() => driver('POST', `${session}/url`, { url: `http://localhost:5199/auth/login?as=${name}` })).toPass()
    // The app still holds the person from the test before, and reloads once it hears who this is.
    const me = { using: 'xpath', value: `//footer/span[text()="${display(name)}"]` }
    await expect(() => driver('POST', `${session}/element`, me)).toPass()

    const opened = async () => {
      await expect.poll(() => run('return !window.before && location.pathname')).toMatch(/^\/n\/[\w-]+$/)
      await expect.poll(() => run('return document.activeElement.placeholder')).toBe('Title')
      await run('window.before = true')
      return run('return location.pathname')
    }
    await run('window.before = true')
    launch()
    const blank = await opened()
    launch()
    expect(await opened()).toBe(blank)
    expect(await run('return document.querySelectorAll(\'aside [aria-roledescription="draggable"]\').length')).toBe(1)
  } finally {
    await driver('DELETE', session)
  }
})
