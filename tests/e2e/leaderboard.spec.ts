import { test, expect } from '@playwright/test'
import { canvasHasContent, shot, trackErrors, waitForResults } from './helpers'

test.use({ viewport: { width: 844, height: 390 } })

test('autopilot run submits a score to the local API and shows the rank', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      'pocket-rally:v1',
      JSON.stringify({
        playerId: `e2e-${Math.random().toString(36).slice(2)}-player`,
        settings: { nickname: 'E2E Racer', quality: 'low' },
        bests: {},
        queue: [],
      }),
    )
  })
  await page.goto('/?level=garden&autostart=1&autopilot=1&quality=low')
  await page.waitForSelector('[data-screen=playing]', { timeout: 60_000 })
  expect(await canvasHasContent(page)).toBe(true)
  // Real time: the server verifies elapsed time, so this cannot be sped up.
  await waitForResults(page, 280_000)
  await expect(page.getByTestId('rank')).toContainText(/Global rank #\d+/, { timeout: 20_000 })
  await shot(page, 'leaderboard-results-rank')

  // The leaderboard screen lists the run and highlights "you".
  await page.getByRole('button', { name: 'Leaderboard' }).click()
  await expect(page.getByTestId('lb-you')).toBeVisible()
  await expect(page.getByTestId('lb-you')).toContainText('E2E Racer')
  await shot(page, 'leaderboard-screen')
  await page.getByTestId('scope-week').click()
  await expect(page.getByTestId('lb-you')).toBeVisible()
  expect(errors).toEqual([])
})
