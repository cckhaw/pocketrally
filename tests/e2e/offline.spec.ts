import { test, expect } from '@playwright/test'
import { getState, waitForResults } from './helpers'

test.use({ viewport: { width: 844, height: 390 } })

test('game stays playable with the API offline and queues the score', async ({ page }) => {
  await page.route('**/api/**', (r) => r.abort())
  await page.goto('/?level=garden&autostart=1&autopilot=1&quality=low&turbo=30')
  await waitForResults(page)
  expect((await getState(page)).state).toBe('results')
  // no run token was obtained, so the score is kept locally only
  await expect(page.getByTestId('rank')).toContainText(/offline/i, { timeout: 20_000 })
  const best = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pocket-rally:v1') ?? '{}').bests?.garden,
  )
  expect(best.timeMs).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Leaderboard' }).click()
  await expect(page.getByTestId('lb-offline')).toBeVisible({ timeout: 30_000 })
})
