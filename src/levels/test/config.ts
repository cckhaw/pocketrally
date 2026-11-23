import { PathBuilder, tokenLine } from '../builder'
import type { LevelConfig } from '../types'

/** Flat test track with a boost pad, a ramp and a gap. Used by unit tests and early development. */
const b = new PathBuilder(14)
b.straight(60)
const boostS = b.s
b.straight(40)
const rampS = b.s
b.straight(6)
const gapS = b.s
b.straight(12)
b.turn(60, 50)
b.straight(60)

export const testLevel: LevelConfig = {
  id: 'test',
  name: 'Test Track',
  tagline: 'Flat test track',
  order: 99,
  waypoints: b.waypoints,
  segments: [
    { type: 'ramp', s0: rampS, s1: rampS + 6, height: 1.8 },
    { type: 'gap', s0: gapS, s1: gapS + 12 },
  ],
  boosts: [{ s: boostS, d: 0 }],
  checkpoints: [70],
  tokens: tokenLine(20, 50, 0, 6),
  hazards: [],
  props: [],
  minPossibleTimeMs: 5000,
  parTimeMs: 20000,
  theme: {
    skyTop: 0x4a90d9,
    skyHorizon: 0xcfe8ff,
    skyBottom: 0xb9d6a0,
    fog: 0xcfe8ff,
    fogNear: 60,
    fogFar: 260,
    sun: 0xfff1d0,
    sunIntensity: 2.6,
    sunDir: [-0.5, 0.8, 0.35],
    hemiSky: 0xbfdcff,
    hemiGround: 0x6a5a3a,
    hemiIntensity: 1.0,
    exposure: 1,
    floor: 'dirt',
    trackColor: 0x9a7a52,
    curbColor: 0x6e5436,
    saturation: 1,
    contrast: 1,
    bloom: 0.2,
  },
}
