import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:42076', headless: true, channel: 'chrome', viewport: { width: 1440, height: 1000 } },
  // Explicit opt-in: never silently start or stop the owner's native benchmark service.
  webServer: undefined,
})
