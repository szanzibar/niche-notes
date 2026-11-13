import { defineConfig } from '@playwright/test'

// Runs a fresh Phoenix on :4199 with its own SQLite file, build dir and Vite on :5199, so the dev
// loop on :4000 and :5173 keeps running untouched (a shared _build trips its code reloader).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        'cd ../server && rm -f data/e2e.db* && MIX_BUILD_ROOT=_build/e2e DATABASE_PATH=data/e2e.db PORT=4199 GOOGLE_CLIENT_ID=e2e mix do ecto.create --quiet + ecto.migrate --quiet + phx.server',
      url: 'http://localhost:4199/api/me',
      timeout: 180_000,
    },
    {
      command: 'PHOENIX_PORT=4199 npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      timeout: 60_000,
    },
  ],
})
