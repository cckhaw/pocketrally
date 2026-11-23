/** Pure level data types. No three.js imports: the API server imports level configs too. */

export type Surface = 'normal' | 'spill' | 'water'

export interface Waypoint {
  x: number
  z: number
  /** Full track width at this waypoint. */
  w: number
}

export type SegmentDef =
  | { type: 'ramp'; s0: number; s1: number; height: number }
  | { type: 'gap'; s0: number; s1: number }
  | { type: 'plank'; s0: number; s1: number; width: number }
  | { type: 'trench'; s0: number; s1: number; wallHeight?: number }
  | { type: 'tunnel'; s0: number; s1: number; height: number }
  | { type: 'surface'; s0: number; s1: number; surface: Surface }

export interface BoostDef {
  s: number
  d: number
}

export interface TokenDef {
  s: number
  d: number
  /** Height above the ground. */
  y?: number
}

export type HazardKind =
  'stomp' | 'paw' | 'toddler' | 'roller' | 'vacuum' | 'door' | 'fan' | 'block'

export interface HazardDef {
  kind: HazardKind
  /** Visual model name (e.g. 'foot', 'barrel', 'sneaker'). */
  model: string
  s: number
  d: number
  period?: number
  phase?: number
  /** Lateral amplitude / arm length depending on kind. */
  amp?: number
  /** Half length along s (block) or patrol length (vacuum). */
  len?: number
  /** Collision radius. */
  r?: number
  speed?: number
  side?: 1 | -1
}

export interface PropDef {
  kind: string
  s: number
  /** Lateral offset from the centre line (negative = left). */
  d: number
  scale?: number
  rot?: number
  /** Free-form variant index or colour seed. */
  v?: number
}

export interface Theme {
  skyTop: number
  skyHorizon: number
  skyBottom: number
  fog: number
  fogNear: number
  fogFar: number
  sun: number
  sunIntensity: number
  sunDir: [number, number, number]
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  exposure: number
  /** Floor texture kind drawn by the level builder. */
  floor: 'dirt' | 'wood' | 'stone'
  trackColor: number
  curbColor: number
  /** Colour grade: saturation, contrast (post pass). */
  saturation: number
  contrast: number
  bloom: number
}

export interface LevelConfig {
  id: string
  name: string
  tagline: string
  order: number
  waypoints: Waypoint[]
  segments: SegmentDef[]
  boosts: BoostDef[]
  checkpoints: number[]
  tokens: TokenDef[]
  hazards: HazardDef[]
  props: PropDef[]
  /** Anti-cheat: no legitimate run is faster than this. */
  minPossibleTimeMs: number
  parTimeMs: number
  theme: Theme
}

export const SIM_HZ = 60
export const SIM_DT = 1 / SIM_HZ
