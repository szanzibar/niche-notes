import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The desktop app itself, built and driven in Docker by tauri/app-e2e.sh, for what its shell does to the page.
// The first build takes several minutes.
export default defineConfig({
  ...base,
  testDir: './e2e-app',
  webServer: [
    ...[base.webServer!].flat(),
    {
      command: '../tauri/app-e2e.sh',
      url: 'http://localhost:4444/status',
      timeout: 900_000,
      // Docker passes a TERM on to the container, and a KILL would leave it running.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
})
