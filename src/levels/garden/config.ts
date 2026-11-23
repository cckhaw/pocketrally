import { PathBuilder, scatter, tokenLine, tokenWave } from '../builder'
import type { HazardDef, LevelConfig, PropDef, SegmentDef, TokenDef } from '../types'

const b = new PathBuilder(16)
const seg: SegmentDef[] = []
const hz: HazardDef[] = []
const tk: TokenDef[] = []
const boosts: { s: number; d: number }[] = []
const checkpoints: number[] = []
const props: PropDef[] = []

// 1. Start straight with a boost pad
b.straight(70)
boosts.push({ s: 45, d: 0 })
tk.push(...tokenLine(18, 40, 0, 5), ...tokenLine(62, 98, 3, 5))
b.straight(40)
b.turn(40, 90)
checkpoints.push(Math.round(b.s))
b.straight(30)

// 2. Onion trench with rolling onions
const trenchA = b.s
b.width(11).straight(120)
const trenchB = b.s
b.width(16)
seg.push({ type: 'trench', s0: trenchA, s1: trenchB, wallHeight: 1.7 })
hz.push(
  {
    kind: 'roller',
    model: 'onionRoll',
    s: trenchA + 30,
    d: 0,
    amp: 5,
    speed: 11,
    period: 4.2,
    phase: 0,
    r: 1.3,
    side: 1,
  },
  {
    kind: 'roller',
    model: 'onionRoll',
    s: trenchA + 62,
    d: 0,
    amp: 5,
    speed: 11,
    period: 4.2,
    phase: 1.5,
    r: 1.3,
    side: -1,
  },
  {
    kind: 'roller',
    model: 'onionRoll',
    s: trenchA + 95,
    d: 0,
    amp: 5,
    speed: 12,
    period: 3.6,
    phase: 0.6,
    r: 1.3,
    side: 1,
  },
)
hz.push({
  kind: 'roller',
  model: 'onionRoll',
  s: trenchA + 125,
  d: 0,
  amp: 5,
  speed: 12,
  period: 3.9,
  phase: 2.2,
  r: 1.3,
  side: -1,
})
tk.push(...tokenWave(trenchA + 8, trenchA + 140, 3, 11))
b.straight(20)
checkpoints.push(Math.round(b.s))
b.turn(-55, 85)
b.straight(30)

// 3. Boost + ramp over a gap
boosts.push({ s: Math.round(b.s) - 8, d: 0 })
const rampS = Math.round(b.s) + 22
b.straight(40)
seg.push({ type: 'ramp', s0: rampS, s1: rampS + 6, height: 1.8 })
seg.push({ type: 'gap', s0: rampS + 6, s1: rampS + 18 })
tk.push(
  { s: rampS + 10, d: 0, y: 3 },
  { s: rampS + 14, d: 0, y: 3 },
  ...tokenLine(rampS - 14, rampS - 2, 0, 4),
)
b.straight(30)
b.turn(30, 90)
checkpoints.push(Math.round(b.s))

// 4. Plank bridge with a worm crossing
b.straight(20)
hz.push({
  kind: 'toddler',
  model: 'worm',
  s: b.s + 5,
  d: 0,
  amp: 5.5,
  period: 5.4,
  phase: 0,
  r: 1.8,
})
b.straight(30)
const plankA = b.s
b.straight(75)
const plankB = b.s
seg.push({ type: 'plank', s0: plankA, s1: plankB, width: 4.6 })
tk.push(...tokenLine(plankA + 6, plankB - 6, 0, 10))
b.straight(14)
b.turn(-40, 85)

// 5. Brick drainage tunnel with water
b.straight(16)
const tunA = b.s
b.straight(55)
const tunB = b.s
seg.push(
  { type: 'tunnel', s0: tunA, s1: tunB, height: 6.2 },
  { type: 'surface', s0: tunA, s1: tunB, surface: 'water' },
)
tk.push(...tokenWave(tunA + 6, tunB - 6, 3, 8))
b.straight(20)
checkpoints.push(Math.round(b.s))

// 6. Gardener's boot stomping + fallen logs
b.straight(20)
hz.push({ kind: 'stomp', model: 'boot', s: b.s + 12, d: -2.5, period: 4.4, phase: 0, r: 2.6 })
hz.push({ kind: 'block', model: 'log', s: b.s + 45, d: 3, len: 2.8, r: 1.2 })
hz.push({ kind: 'block', model: 'log', s: b.s + 60, d: -3.5, len: 2.8, r: 1.2 })
tk.push(...tokenLine(b.s + 22, b.s + 40, 0, 5), ...tokenLine(b.s + 70, b.s + 90, 0, 5))
b.straight(100)
b.turn(45, 90)
boosts.push({ s: Math.round(b.s) + 10, d: 0 })
b.straight(80)
hz.push({
  kind: 'roller',
  model: 'onionRoll',
  s: b.s - 40,
  d: 0,
  amp: 7,
  speed: 13,
  period: 4,
  phase: 1,
  r: 1.3,
  side: -1,
})
tk.push(...tokenWave(b.s - 60, b.s - 5, 4, 10))
b.turn(-45, 90)
b.straight(70)

const length = b.s
// props
props.push(
  ...scatter('onion', 0, length, 70, 12, 30, 11, [0.7, 1.4]),
  ...scatter('stalk', 0, length, 14, 14, 24, 12),
  ...scatter('pebble', 0, length, 60, 10, 40, 13, [0.5, 1.8]),
  ...scatter('flower', 0, length, 24, 12, 34, 14, [0.8, 1.5]),
  ...scatter('leaf', 0, length, 20, 10, 30, 15, [0.8, 1.6]),
  ...scatter('worm', 40, length, 3, 16, 24, 16),
  { kind: 'post', s: 160, d: 20 },
  { kind: 'post', s: 540, d: -20 },
  { kind: 'post', s: 900, d: 20 },
  { kind: 'twigArch', s: 130, d: 0 },
  { kind: 'twigArch', s: plankA - 12, d: 0 },
)
for (let s = 0; s < length; s += 22)
  props.push({ kind: 'picket', s, d: 52 }, { kind: 'picket', s: s + 11, d: -54 })

export const gardenLevel: LevelConfig = {
  id: 'garden',
  name: 'The Garden',
  tagline: 'Dirt trenches, giant onions and one very big boot.',
  order: 1,
  waypoints: b.waypoints,
  segments: seg,
  boosts,
  checkpoints,
  tokens: tk,
  hazards: hz,
  props,
  minPossibleTimeMs: 52000,
  parTimeMs: 82000,
  theme: {
    skyTop: 0x5ea0e0,
    skyHorizon: 0xffe3a8,
    skyBottom: 0x8a9a5a,
    fog: 0xf3d9a0,
    fogNear: 50,
    fogFar: 190,
    sun: 0xffd9a0,
    sunIntensity: 3.2,
    sunDir: [-0.55, 0.62, 0.45],
    hemiSky: 0xbfd8ff,
    hemiGround: 0x6a5a2a,
    hemiIntensity: 1.1,
    exposure: 1,
    floor: 'dirt',
    trackColor: 0x9a7448,
    curbColor: 0x6b4a2a,
    saturation: 1.12,
    contrast: 1.05,
    bloom: 0.3,
  },
}
