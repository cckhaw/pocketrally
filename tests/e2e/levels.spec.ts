import { test, expect } from '@playwright/test'
import { VIEWPORTS } from '../../playwright.config'
import { LEVELS } from '../../src/levels'
import { buildTrack } from '../../src/core/run'
import { canvasHasContent, getState, shot, stubApi, trackErrors, waitForResults } from './helpers'

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const level of LEVELS) {
      test(`${level.id}: autopilot completes the level`, async ({ page }) => {
        const errors = trackErrors(page)
        await stubApi(page)

        // 1. mid-level screenshot at normal speed (canvas must show a scene, HUD must not overlap)
        const mid = Math.round(buildTrack(level).length * 0.3)
        await page.goto(`/?level=${level.id}&autostart=1&autopilot=1&quality=low&startS=${mid}`)
        await page.waitForFunction(() => document.body.dataset.screen === 'playing', undefined, {
          timeout: 60_000,
        })
        await page.waitForTimeout(1500)
        expect(await canvasHasContent(page)).toBe(true)
        await shot(page, `${level.id}-${vp.name}-play`)

        // 2. full run at turbo speed
        await page.goto(`/?level=${level.id}&autostart=1&autopilot=1&quality=low&turbo=30`)
        await waitForResults(page)
        const st = await getState(page)
        expect(st.state).toBe('results')
        expect(st.tokens).toBeGreaterThan(0)
        await expect(page.getByTestId('result-time')).toHaveText(/\d:\d\d\.\d\d/)
        await shot(page, `${level.id}-${vp.name}-results`)
        expect(errors).toEqual([])
      })
    }
  })
}
