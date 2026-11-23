import { PathBuilder, scatter, tokenLine, tokenWave } from '../builder'
import type { HazardDef, LevelConfig, PropDef, SegmentDef, TokenDef } from '../types'

const b = new PathBuilder(18, 0, 0, 0, 1.5)
const seg: SegmentDef[] = []
const hz: HazardDef[] = []
const tk: TokenDef[] = []
const boosts: { s: number; d: number }[] = []
const checkpoints: number[] = []
const props: PropDef[] = []

// 1. Living room floor: sneakers and a guitar
b.straight(80)
boosts.push({ s: 50, d: 0 })
tk.push(...tokenLine(20, 45, 0, 5))
b.straight(30)
hz.push({ kind: 'block', model: 'sneaker', s: b.s + 10, d: -4.5, len: 2.6, r: 1.3 })
hz.push({ kind: 'block', model: 'sneaker', s: b.s + 14, d: 4.5, len: 2.6, r: 1.3 })
tk.push(...tokenLine(b.s - 8, b.s + 6, 0, 4))
b.straight(40)
hz.push({ kind: 'block', model: 'guitarA', s: b.s + 5, d: -3, len: 3.6, r: 1.0 })
hz.push({ kind: 'block', model: 'guitarE', s: b.s + 25, d: 3.5, len: 3.6, r: 1.0 })
b.straight(40)
b.turn(40, 90)
checkpoints.push(Math.round(b.s))

// 2. Foot stomp + basketball rolling
b.straight(20)
hz.push({ kind: 'stomp', model: 'foot', s: b.s + 15, d: -3, period: 4.6, phase: 0, r: 2.4 })
hz.push({ kind: 'stomp', model: 'foot', s: b.s + 40, d: 3.5, period: 4.6, phase: 2.3, r: 2.4 })
tk.push(...tokenLine(b.s + 24, b.s + 34, 0, 4), ...tokenLine(b.s + 48, b.s + 60, 0, 4))
b.straight(70)
hz.push({ kind: 'roller', model: 'ball', s: b.s - 15, d: 0, amp: 9, speed: 14, period: 4.4, phase: 0.5, r: 1.3, side: 1 })
hz.push({ kind: 'roller', model: 'ball', s: b.s + 15, d: 0, amp: 9, speed: 14, period: 4.4, phase: 2.7, r: 1.3, side: -1 })
b.straight(30)
checkpoints.push(Math.round(b.s))

// 3. Mouse-hole arch then a cat runs through
const holeS = b.s + 10
b.straight(30)
props.push({ kind: 'mouseHole', s: holeS, d: 0 })
b.straight(40)
hz.push({ kind: 'paw', model: 'paw', s: b.s - 10, d: 0, amp: 7, period: 4.2, phase: 1, r: 1.7, side: 1 })
hz.push({ kind: 'roller', model: 'cat', s: b.s + 25, d: 0, amp: 10, speed: 22, period: 6, phase: 1, r: 1.6, side: -1 })
tk.push(...tokenWave(b.s, b.s + 50, 4, 9))
b.straight(55)
b.turn(-50, 80)
checkpoints.push(Math.round(b.s))

// 4. Stairs jump
b.straight(30)
boosts.push({ s: Math.round(b.s) - 5, d: 0 })
const rampS = Math.round(b.s) + 18
b.straight(40)
seg.push({ type: 'ramp', s0: rampS, s1: rampS + 6, height: 1.9 })
seg.push({ type: 'gap', s0: rampS + 6, s1: rampS + 19 })
tk.push({ s: rampS + 10, d: 0, y: 3 }, { s: rampS + 15, d: 0, y: 3 })
b.straight(30)

// 5. Hallway with picture frames and a toddler
b.width(12)
const hallA = b.s
b.straight(110)
const hallB = b.s
b.width(18)
for (let s = hallA + 5; s < hallB; s += 28) props.push({ kind: 'frame', s, d: -9.5, rot: Math.PI / 2 }, { kind: 'frame', s: s + 14, d: 9.5, rot: -Math.PI / 2 })
hz.push({ kind: 'toddler', model: 'toddler', s: hallA + 40, d: 0, amp: 4, period: 5.2, phase: 0, r: 1.8 })
hz.push({ kind: 'toddler', model: 'toddler', s: hallA + 85, d: 0, amp: 4, period: 4.8, phase: 2, r: 1.8 })
hz.push({ kind: 'toddler', model: 'toddler', s: hallA + 125, d: 0, amp: 4, period: 5.0, phase: 1, r: 1.8 })
tk.push(...tokenLine(hallA + 10, hallA + 30, 0, 5), ...tokenLine(hallA + 55, hallA + 75, 0, 5), ...tokenLine(hallA + 95, hallA + 115, 0, 5))
b.turn(35, 80)
checkpoints.push(Math.round(b.s))

// 6. Kitchen: cereal spill and a robot vacuum
const spillA = b.s + 10
b.straight(45)
seg.push({ type: 'surface', s0: spillA, s1: spillA + 40, surface: 'spill' })
props.push({ kind: 'cereal', s: spillA + 8, d: -3 }, { kind: 'cereal', s: spillA + 26, d: 3 })
hz.push({ kind: 'vacuum', model: 'vacuum', s: b.s + 40, d: 0, amp: 5, len: 8, period: 7, phase: 0, r: 1.8 })
tk.push(...tokenWave(b.s + 10, b.s + 90, 4, 12))
b.straight(100)
b.turn(-35, 90)
b.straight(60)
hz.push({ kind: 'stomp', model: 'foot', s: b.s - 25, d: 0, period: 4.2, phase: 1, r: 2.4 })
const length = b.s
boosts.push({ s: Math.round(b.s) - 60, d: 0 })

props.push(
  ...scatter('sofa', 0, length, 6, 26, 38, 21),
  ...scatter('shelf', 0, length, 6, 30, 42, 22),
  ...scatter('lamp', 0, length, 6, 24, 36, 23),
  ...scatter('sneakerS', 0, length, 8, 20, 36, 24),
  ...scatter('guitarAS', 0, length, 4, 22, 34, 25),
  ...scatter('guitarES', 0, length, 4, 22, 34, 26),
  ...scatter('ballS', 0, length, 5, 22, 36, 27),
  ...scatter('cable', 0, length, 8, 14, 30, 28),
  { kind: 'stairs', s: rampS - 30, d: 24, rot: Math.PI / 2 },
  { kind: 'rug', s: 40, d: 0 },
  { kind: 'rug', s: 250, d: 0 },
)

export const houseLevel: LevelConfig = {
  id: 'house',
  name: 'The Living Room',
  tagline: 'Sneakers, guitars, a stomping foot and a very curious cat.',
  order: 2,
  waypoints: b.waypoints,
  segments: seg,
  boosts,
  checkpoints,
  tokens: tk,
  hazards: hz,
  props,
  minPossibleTimeMs: 50000,
  parTimeMs: 80000,
  theme: {
    skyTop: 0xe8d9bd,
    skyHorizon: 0xf5e6c8,
    skyBottom: 0xb88a5a,
    fog: 0xf0dfc0,
    fogNear: 55,
    fogFar: 200,
    sun: 0xfff0d0,
    sunIntensity: 2.8,
    sunDir: [0.4, 0.8, 0.4],
    hemiSky: 0xfff0d8,
    hemiGround: 0x8a6a4a,
    hemiIntensity: 1.2,
    exposure: 1,
    floor: 'wood',
    trackColor: 0xb98a5a,
    curbColor: 0x6a4a2e,
    saturation: 1.05,
    contrast: 1.02,
    bloom: 0.25,
  },
}
