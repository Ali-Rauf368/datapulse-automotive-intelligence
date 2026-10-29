import { defineConfig, devices } from '@playwright/test'
import { randomBytes } from 'node:crypto'

// End-to-end tests drive the real dashboard in Chromium against the real API.
// They write to the database, so like the unit tests they only run against a
// database whose name ends in "_test" (npm run test:e2e:isolated provides a
// disposable one).
const database = process.env.DB_NAME ?? ''
if (!process.env.DATABASE_URL && !database.endsWith('_test')) {
  throw new Error(`Refusing to run end-to-end tests against database "${database}": use a *_test database.`)
}

const API_PORT = 3999
const WEB_PORT = 5199

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npm run server:start',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        FRONTEND_URL: `http://127.0.0.1:${WEB_PORT}`,
        JWT_SECRET: randomBytes(32).toString('hex'),
      } as Record<string, string>,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${API_PORT}/api` } as Record<string, string>,
      reuseExistingServer: false,
    },
  ],
})
