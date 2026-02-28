import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 5_000,
  globalTimeout: 60_000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev:ui-test',
    cwd: '..',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
})
