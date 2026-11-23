import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

/** Test viewports required by the brief. */
export const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'desktop-720p', width: 1280, height: 720 },
  { name: 'desktop-1080p', width: 1920, height: 1080 },
]

// A pre-installed Chromium may not match this Playwright version; PW_CHROMIUM_PATH overrides.
const systemChromium =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    launchOptions: {
      executablePath: systemChromium,
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: [
    {
      command: 'npx tsx scripts/dev-api.ts',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      ignoreHTTPSErrors: true,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
