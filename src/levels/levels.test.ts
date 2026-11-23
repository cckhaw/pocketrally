import { describe, expect, it } from 'vitest'
import { Autopilot } from '../core/autopilot'
import { Run, buildTrack, starsFor } from '../core/run'
import { LEVELS } from './index'

describe.each(LEVELS)('level $id', (level) => {
  const track = buildTrack(level)

  it('has consistent data', () => {
    expect(level.tokens.length).toBeGreaterThan(20)
    expect(level.minPossibleTimeMs).toBeLessThan(level.parTimeMs)
    for (const c of level.checkpoints) expect(c).toBeLessThan(track.length)
    for (const t of level.tokens) {
      if (!t.y) expect(track.ground(t.s, t.d), `token at s=${t.s} d=${t.d}`).not.toBeNull()
      expect(Math.abs(t.d)).toBeLessThan(track.halfWidth(t.s))
    }
    for (const s of level.segments) expect(s.s1).toBeLessThan(track.length)
  })

  it('is completable by the autopilot with a plausible time', () => {
    const run = new Run(level, track)
    const ap = new Autopilot()
    let guard = 0
    while (!run.finished && guard++ < 60 * 200) run.step(ap.update(run))
    console.log(
      level.id,
      'length',
      Math.round(track.length),
      'time',
      run.finishTimeMs,
      'tokens',
      run.tokenCount,
      '/',
      level.tokens.length,
      'deaths',
      run.deaths,
      'hits',
      run.hits,
      'stars',
      starsFor(level, run.finishTimeMs, run.tokenCount),
    )
    expect(run.finished).toBe(true)
    expect(run.finishTimeMs).toBeGreaterThan(level.minPossibleTimeMs)
    expect(run.finishTimeMs).toBeLessThan(110000)
  })
})
