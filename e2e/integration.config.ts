import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './integration',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : [['html', { outputFolder: 'integration-report' }]],
  timeout: 30_000,
  globalTimeout: 120_000,

  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    storageState: './integration/.auth-state.json',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  globalSetup: './integration/global-setup.ts',

  webServer: [
    {
      command: 'npm run dev -w server',
      cwd: '..',
      url: 'http://localhost:4444',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'npm run dev -w client -- --port 5175',
      cwd: '..',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
})
