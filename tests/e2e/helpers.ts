import { expect, type ConsoleMessage, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

export interface DebugState {
  state: string
  level: string
  s: number
  d: number
  timeMs: number
  tokens: number
  deaths: number
  speed: number
}

declare global {
  interface Window {
    __pocketRally: { debugState(): DebugState }
  }
}

export const getState = (page: Page): Promise<DebugState> =>
  page.evaluate(() => window.__pocketRally.debugState())

/** Collects console errors and page errors; resource errors from the API are ignored when `ignoreApi` is set. */
export function trackErrors(page: Page, ignoreApi = false): string[] {
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (ignoreApi && /Failed to load resource|\/api\//.test(text)) return
    errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

/** Replace the API with a stub (used for turbo runs, whose times are rejected by the real anti-cheat). */
export async function stubApi(page: Page): Promise<void> {
  await page.route('**/api/run/start', (r) => r.fulfill({ json: { runToken: 'stub' } }))
  await page.route('**/api/score', (r) =>
    r.fulfill({
      json: { ok: true, rank: 1, weekRank: 1, bestTimeMs: 1, improved: true, total: 1 },
    }),
  )
  await page.route('**/api/leaderboard**', (r) =>
    r.fulfill({
      json: { levelId: 'garden', scope: 'all', total: 0, top: [], you: null, around: [] },
    }),
  )
}

/** True if the canvas shows a non-trivial image (not blank or a single flat colour). */
export async function canvasHasContent(page: Page): Promise<boolean> {
  const buf = await page.locator('#canvas').screenshot()
  const b64 = buf.toString('base64')
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    if (!g) return false
    g.drawImage(bmp, 0, 0, 64, 64)
    const px = g.getImageData(0, 0, 64, 64).data
    let min = 255
    let max = 0
    const colors = new Set<number>()
    for (let i = 0; i < px.length; i += 4) {
      const l = (px[i] + px[i + 1] + px[i + 2]) / 3
      min = Math.min(min, l)
      max = Math.max(max, l)
      colors.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4))
    }
    return max - min > 25 && colors.size > 12
  }, b64)
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('screenshots', { recursive: true })
  await page.screenshot({ path: `screenshots/${name}.png` })
}

export async function waitForResults(page: Page, timeout = 240_000): Promise<void> {
  await page.waitForSelector('[data-screen=results]', { timeout })
  await expect(page.getByTestId('result-time')).toBeVisible()
}
