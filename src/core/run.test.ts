import { describe, expect, it } from 'vitest'
import { Autopilot } from './autopilot'
import { Run, buildTrack, starsFor } from './run'
import { testLevel } from '../levels/test/config'

describe('run + autopilot', () => {
  it('autopilot completes the test level and collects tokens', () => {
    const run = new Run(testLevel, buildTrack(testLevel))
    const ap = new Autopilot()
    let guard = 0
    while (!run.finished && guard++ < 60 * 120) run.step(ap.update(run))
    expect(run.finished).toBe(true)
    expect(run.tokenCount).toBeGreaterThan(2)
    expect(run.deaths).toBe(0)
    expect(run.finishTimeMs).toBeGreaterThanOrEqual(testLevel.minPossibleTimeMs)
  })

  it('stars: finish, tokens and par', () => {
    expect(starsFor(testLevel, 99999, 0)).toBe(1)
    expect(starsFor(testLevel, 99999, testLevel.tokens.length)).toBe(2)
    expect(starsFor(testLevel, 1000, testLevel.tokens.length)).toBe(3)
  })
})
