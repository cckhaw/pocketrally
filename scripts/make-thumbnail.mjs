#!/usr/bin/env node
// Generates public/thumbnail.png (1200x630) from a real screenshot of the game.
// Starts a Vite dev server unless BASE_URL is given. Set PW_CHROMIUM_PATH to use a system Chromium.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL ?? 'http://localhost:4175'
let server = null

async function ready(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

if (!process.env.BASE_URL) {
  server = spawn('npx', ['vite', '--port', '4175', '--strictPort'], { stdio: 'ignore' })
  if (!(await ready(base))) {
    server.kill()
    throw new Error('dev server did not start')
  }
}

const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  await page.route('**/api/**', (r) => r.fulfill({ json: { runToken: 'x' } }))
  await page.goto(`${base}/?level=garden&autostart=1&autopilot=1&embed=1&quality=high&startS=228`)
  await page.waitForFunction(() => document.body.dataset.screen === 'playing', undefined, {
    timeout: 120000,
  })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'public/thumbnail.png' })
  console.log('wrote public/thumbnail.png')
} finally {
  await browser.close()
  server?.kill()
}
