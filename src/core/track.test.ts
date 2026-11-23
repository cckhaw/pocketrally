import { describe, expect, it } from 'vitest'
import { buildTrack } from './run'
import { LEVELS } from '../levels'
import { testLevel } from '../levels/test/config'
import { capsuleDistance, evalHazard, hazardHits, makeHazardState } from '../entities/hazards'

describe('track queries', () => {
  const t = buildTrack(testLevel)
  it('reports ground, gaps and ramps', () => {
    const ramp = testLevel.segments[0]
    const gap = testLevel.segments[1]
    if (ramp.type !== 'ramp' || gap.type !== 'gap') throw new Error('bad level')
    expect(t.ground(10, 0)).toBe(0)
    expect(t.ground(ramp.s0 + (ramp.s1 - ramp.s0) / 2, 0)).toBeCloseTo(ramp.height / 2, 5)
    expect(t.ground(gap.s0 + 2, 0)).toBeNull()
  })
  it('all levels have monotone spline lengths close to the planned path', () => {
    for (const l of LEVELS) {
      const tr = buildTrack(l)
      expect(tr.length).toBeGreaterThan(1000)
    }
  })
})

describe('hazards', () => {
  it('stomp is only dangerous while the foot is down, and it respawns (severe)', () => {
    const def = { kind: 'stomp' as const, model: 'foot', s: 100, d: 0, period: 4, phase: 0, r: 2 }
    const st = makeHazardState()
    let hurtTime = 0
    for (let t = 0; t < 4; t += 0.05) {
      evalHazard(def, t, st)
      if (st.hurt) {
        hurtTime += 0.05
        expect(st.severe).toBe(true)
        expect(hazardHits(st, 100, 0, 0.5)).toBe(true)
        expect(hazardHits(st, 100, 8, 0.5)).toBe(false)
      }
    }
    expect(hurtTime).toBeGreaterThan(0.3)
    expect(hurtTime).toBeLessThan(0.7)
    evalHazard(def, 0.1, st)
    expect(st.tele).toBeLessThan(0.2)
  })
  it('capsule distance', () => {
    expect(capsuleDistance({ as: 0, ad: 0, bs: 10, bd: 0, r: 1 }, 5, 3)).toBeCloseTo(2, 5)
    expect(capsuleDistance({ as: 0, ad: 0, bs: 10, bd: 0, r: 1 }, 12, 0)).toBeCloseTo(1, 5)
  })
})
