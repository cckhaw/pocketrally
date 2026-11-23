import type { Waypoint } from './types'

/** Tiny deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Builds a path from straight and turn commands. Heading 0 points to -Z, positive turns go right.
 * `s` is the planned distance travelled so far, used to anchor segments, tokens and props.
 */
export class PathBuilder {
  readonly waypoints: Waypoint[] = []
  s = 0
  private x: number
  private z: number
  private heading: number
  private w: number

  /** Straights are multiplied by this to stretch levels to a 60-90 s time trial. */
  readonly stretch: number

  constructor(width: number, x = 0, z = 0, headingDeg = 0, stretch = 1.3) {
    this.stretch = stretch
    this.x = x
    this.z = z
    this.heading = (headingDeg * Math.PI) / 180
    this.w = width
    this.waypoints.push({ x, z, w: width })
  }

  width(w: number): this {
    this.w = w
    return this
  }

  straight(rawLen: number, spacing = 16): this {
    const len = rawLen * this.stretch
    const n = Math.max(1, Math.round(len / spacing))
    const step = len / n
    for (let i = 0; i < n; i++) {
      this.x += Math.sin(this.heading) * step
      this.z -= Math.cos(this.heading) * step
      this.waypoints.push({ x: this.x, z: this.z, w: this.w })
    }
    this.s += len
    return this
  }

  /** Turn by `deg` degrees (positive = right) along an arc of the given radius. */
  turn(deg: number, radius: number): this {
    const total = (Math.abs(deg) * Math.PI) / 180
    const sign = Math.sign(deg) || 1
    const arc = total * radius
    const n = Math.max(2, Math.ceil(total / (Math.PI / 12)))
    const dTheta = (total / n) * sign
    const chord = arc / n
    for (let i = 0; i < n; i++) {
      this.heading += dTheta / 2
      this.x += Math.sin(this.heading) * chord
      this.z -= Math.cos(this.heading) * chord
      this.heading += dTheta / 2
      this.waypoints.push({ x: this.x, z: this.z, w: this.w })
    }
    this.s += arc
    return this
  }
}

export function tokenLine(
  s0: number,
  s1: number,
  d: number,
  count: number,
  y = 0,
): { s: number; d: number; y: number }[] {
  const out: { s: number; d: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    out.push({ s: s0 + (s1 - s0) * t, d, y })
  }
  return out
}

export function tokenWave(
  s0: number,
  s1: number,
  amp: number,
  count: number,
  d0 = 0,
): { s: number; d: number; y: number }[] {
  const out: { s: number; d: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1)
    out.push({ s: s0 + (s1 - s0) * t, d: d0 + Math.sin(t * Math.PI * 2) * amp, y: 0 })
  }
  return out
}

export function scatter(
  kind: string,
  s0: number,
  s1: number,
  count: number,
  dMin: number,
  dMax: number,
  seed: number,
  scale: [number, number] = [1, 1],
): { kind: string; s: number; d: number; scale: number; rot: number; v: number }[] {
  const r = rng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const side = r() < 0.5 ? -1 : 1
    out.push({
      kind,
      s: s0 + ((i + r() * 0.8) / count) * (s1 - s0),
      d: side * (dMin + r() * (dMax - dMin)),
      scale: scale[0] + r() * (scale[1] - scale[0]),
      rot: r() * Math.PI * 2,
      v: Math.floor(r() * 1000),
    })
  }
  return out
}
