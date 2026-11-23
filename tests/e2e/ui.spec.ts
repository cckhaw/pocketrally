import { test, expect } from '@playwright/test'
import { getState, shot, stubApi, trackErrors } from './helpers'

test.use({ viewport: { width: 1280, height: 720 } })

test('title -> select -> play with keyboard, pause/resume, settings', async ({ page }) => {
  const errors = trackErrors(page, true)
  await stubApi(page)
  await page.goto('/?quality=low')
  await expect(page.getByTestId('title')).toBeVisible()
  await shot(page, 'title')

  await page.getByTestId('open-settings').click()
  await page.getByTestId('nickname').fill('x')
  await page.getByTestId('nickname').press('Enter')
  await page.getByTestId('nickname').blur()
  await expect(page.locator('.setting-msg')).toContainText('at least 3')
  await page.getByTestId('nickname').fill('Valid Name')
  await page.getByTestId('nickname').blur()
  await expect(page.locator('.setting-msg')).toContainText('Saved')
  await shot(page, 'settings')
  await page.getByTestId('close-settings').click()

  await page.getByTestId('play').click()
  await expect(page.getByTestId('select')).toBeVisible()
  await shot(page, 'select')
  await page.getByTestId('level-garden').click()
  await page.waitForFunction(() => document.body.dataset.screen === 'playing', undefined, {
    timeout: 60_000,
  })

  // keyboard steering: hold ArrowRight and the car moves right
  const before = await getState(page)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(800)
  await page.keyboard.up('ArrowRight')
  const after = await getState(page)
  expect(after.s).toBeGreaterThan(before.s)
  expect(after.d).toBeGreaterThan(before.d + 0.3)

  // Escape pauses, the timer stops, then resume
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-screen')).toBeVisible()
  const t1 = (await getState(page)).timeMs
  await page.waitForTimeout(600)
  expect((await getState(page)).timeMs).toBe(t1)
  await shot(page, 'pause')
  await page.getByTestId('resume').click()
  await page.waitForTimeout(500)
  expect((await getState(page)).timeMs).toBeGreaterThan(t1)
  expect(errors).toEqual([])
})

test('mouse drag steers', async ({ page }) => {
  await stubApi(page)
  await page.goto('/?level=garden&autostart=1&quality=low')
  await page.waitForFunction(() => document.body.dataset.screen === 'playing', undefined, {
    timeout: 60_000,
  })
  const before = await getState(page)
  await page.mouse.move(640, 400)
  await page.mouse.down()
  await page.mouse.move(900, 400, { steps: 5 })
  await page.waitForTimeout(700)
  await page.mouse.up()
  expect((await getState(page)).d).toBeGreaterThan(before.d + 0.3)
})
