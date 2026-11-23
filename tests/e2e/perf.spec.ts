import { test, expect } from '@playwright/test'
import { LEVELS } from '../../src/levels'
import { buildTrack } from '../../src/core/run'
import { getState, stubApi, trackErrors } from './helpers'

test.use({ viewport: { width: 1280, height: 720 } })

// Budget from the brief: at most 150 draw calls and 300k triangles per frame (all passes, high quality).
for (const level of LEVELS) {
  test(`${level.id}: stays within the draw call / triangle budget`, async ({ page }) => {
    const errors = trackErrors(page)
    await stubApi(page)
    const len = buildTrack(level).length
    let maxCalls = 0
    let maxTris = 0
    for (const f of [0.05, 0.35, 0.65, 0.9]) {
      await page.goto(
        `/?level=${level.id}&autostart=1&autopilot=1&quality=high&startS=${Math.round(len * f)}`,
      )
      await page.waitForFunction(() => document.body.dataset.screen === 'playing', undefined, {
        timeout: 90_000,
      })
      await page.waitForTimeout(2500)
      const st = await getState(page)
      maxCalls = Math.max(maxCalls, st.calls)
      maxTris = Math.max(maxTris, st.triangles)
    }
    console.log(`${level.id}: max draw calls ${maxCalls}, max triangles ${maxTris}`)
    expect(maxCalls).toBeLessThanOrEqual(150)
    expect(maxTris).toBeLessThanOrEqual(300_000)
    expect(errors).toEqual([])
  })
}
