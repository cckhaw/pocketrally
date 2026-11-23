import { PathBuilder, scatter, tokenLine, tokenWave } from '../builder'
import type { HazardDef, LevelConfig, PropDef, SegmentDef, TokenDef } from '../types'

const b = new PathBuilder(16, 0, 0, 0, 1.5)
const seg: SegmentDef[] = []
const hz: HazardDef[] = []
const tk: TokenDef[] = []
const boosts: { s: number; d: number }[] = []
const checkpoints: number[] = []
const props: PropDef[] = []

// 1. Entrance: patrons' legs and boots stomping
for (let i = 0; i < 4; i++) props.push({ kind: 'legs', s: 20 + i * 14, d: i % 2 ? 14 : -14, v: i })
b.straight(90)
boosts.push({ s: 50, d: 0 })
tk.push(...tokenLine(15, 45, 0, 6))
hz.push({ kind: 'stomp', model: 'boot', s: 85, d: 3, period: 4.4, phase: 0, r: 2.6 })
b.straight(40)
tk.push(...tokenLine(100, 125, -3, 5))
b.turn(35, 90)
checkpoints.push(Math.round(b.s))

// 2. Corks and bottle caps
b.straight(20)
hz.push({ kind: 'block', model: 'cork', s: b.s + 10, d: -4, len: 1.2, r: 1.1 })
hz.push({ kind: 'block', model: 'cork', s: b.s + 18, d: 3, len: 1.2, r: 1.1 })
hz.push({ kind: 'block', model: 'cork', s: b.s + 26, d: -1, len: 1.2, r: 1.1 })
hz.push({ kind: 'block', model: 'cork', s: b.s + 42, d: 4, len: 1.2, r: 1.1 })
tk.push(...tokenWave(b.s + 5, b.s + 70, 3.5, 10))
b.straight(80)

// 3. Rolling barrels
hz.push({
  kind: 'roller',
  model: 'barrel',
  s: b.s + 10,
  d: 0,
  amp: 8,
  speed: 13,
  period: 4.4,
  phase: 0,
  r: 1.4,
  side: 1,
})
hz.push({
  kind: 'roller',
  model: 'barrel',
  s: b.s + 30,
  d: 0,
  amp: 8,
  speed: 13,
  period: 4.4,
  phase: 2.2,
  r: 1.4,
  side: -1,
})
hz.push({
  kind: 'roller',
  model: 'barrel',
  s: b.s + 50,
  d: 0,
  amp: 8,
  speed: 14,
  period: 3.8,
  phase: 1,
  r: 1.4,
  side: 1,
})
b.straight(70)
checkpoints.push(Math.round(b.s))
b.turn(-45, 85)

// 4. Barrel-to-barrel plank ramp
b.straight(20)
boosts.push({ s: Math.round(b.s) + 5, d: 0 })
const rampS = Math.round(b.s) + 30
b.straight(45)
seg.push({ type: 'ramp', s0: rampS, s1: rampS + 7, height: 2.1 })
seg.push({ type: 'gap', s0: rampS + 7, s1: rampS + 20 })
tk.push({ s: rampS + 11, d: 0, y: 3.2 }, { s: rampS + 16, d: 0, y: 3 })
props.push(
  { kind: 'barrel', s: rampS + 7, d: -11, scale: 1.5 },
  { kind: 'barrel', s: rampS + 7, d: 11, scale: 1.5 },
  { kind: 'barrel', s: rampS + 20, d: -11, scale: 1.5 },
  { kind: 'barrel', s: rampS + 20, d: 11, scale: 1.5 },
)
b.straight(35)

// 5. Steel tank trench with a spinning fan
const trenchA = b.s
b.width(12).straight(100)
const trenchB = b.s
b.width(16)
seg.push({ type: 'trench', s0: trenchA, s1: trenchB, wallHeight: 1.8 })
hz.push({ kind: 'fan', model: 'fan', s: trenchA + 40, d: 0, amp: 3.6, speed: 3.2 })
hz.push({ kind: 'fan', model: 'fan', s: trenchA + 80, d: 0, amp: 3.6, speed: -3.6 })
hz.push({ kind: 'fan', model: 'fan', s: trenchA + 118, d: 0, amp: 3.6, speed: 3.4 })
tk.push(
  ...tokenLine(trenchA + 10, trenchA + 30, 0, 5),
  ...tokenLine(trenchA + 50, trenchA + 70, 4, 4),
)
b.straight(20)
checkpoints.push(Math.round(b.s))
b.turn(40, 85)

// 6. Plank over a drop, then the cat in the hatch window
b.straight(30)
const plankA = b.s
b.straight(70)
seg.push({ type: 'plank', s0: plankA, s1: plankA + 70, width: 4.8 })
tk.push(...tokenLine(plankA + 6, plankA + 64, 0, 10))
b.straight(20)
props.push({ kind: 'hatch', s: plankA + 35, d: -26, rot: Math.PI / 2 })
b.turn(-40, 85)

// 7. Swinging iron-hinged door and finale
b.straight(30)
hz.push({ kind: 'door', model: 'door', s: b.s + 15, d: 8, amp: 14, period: 4.6, phase: 0, side: 1 })
hz.push({
  kind: 'door',
  model: 'door',
  s: b.s + 60,
  d: -8,
  amp: 14,
  period: 4.6,
  phase: 2.3,
  side: -1,
})
tk.push(...tokenLine(b.s + 25, b.s + 50, 0, 6))
b.straight(100)
boosts.push({ s: Math.round(b.s) - 30, d: 0 })
b.straight(40)

const length = b.s
props.push(
  ...scatter('tank', 0, length, 12, 18, 30, 31),
  ...scatter('pipe', 0, length, 16, 14, 24, 32),
  ...scatter('barrel', 0, length, 24, 14, 30, 33, [0.8, 1.2]),
  ...scatter('crate', 0, length, 14, 14, 30, 34),
  ...scatter('corkS', 0, length, 24, 11, 30, 35),
  ...scatter('cap', 0, length, 40, 10, 24, 36),
  ...scatter('bottle', 0, length, 20, 12, 30, 37),
  ...scatter('puddle', 0, length, 10, 10, 24, 38),
  ...scatter('lantern', 0, length, 18, 10, 20, 39),
)

export const cellarLevel: LevelConfig = {
  id: 'cellar',
  name: 'The Pub Cellar',
  tagline: 'Barrels, corks and a cat at the hatch. Mind the door.',
  order: 3,
  waypoints: b.waypoints,
  segments: seg,
  boosts,
  checkpoints,
  tokens: tk,
  hazards: hz,
  props,
  minPossibleTimeMs: 48000,
  parTimeMs: 78000,
  theme: {
    skyTop: 0x2a1a10,
    skyHorizon: 0x5a3a22,
    skyBottom: 0x1a0f08,
    fog: 0x3a2414,
    fogNear: 30,
    fogFar: 150,
    sun: 0xffb060,
    sunIntensity: 2.4,
    sunDir: [-0.3, 0.8, 0.3],
    hemiSky: 0xffc890,
    hemiGround: 0x4a2a14,
    hemiIntensity: 1.3,
    exposure: 1.1,
    floor: 'stone',
    trackColor: 0x8a7860,
    curbColor: 0x4a3a2a,
    saturation: 1.1,
    contrast: 1.08,
    bloom: 0.45,
  },
}
