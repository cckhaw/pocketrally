import type { BoostDef, SegmentDef, Surface, Waypoint } from '../levels/types'

export interface TrackPoint {
  x: number
  z: number
  /** Unit tangent (forward). */
  tx: number
  tz: number
  /** Unit right normal. */
  nx: number
  nz: number
  w: number
}

export function makeTrackPoint(): TrackPoint {
  return { x: 0, z: 0, tx: 0, tz: -1, nx: 1, nz: 0, w: 10 }
}

const STEP = 1

/** Data-driven track: a Catmull-Rom spline resampled by arc length plus typed segments. */
export class Track {
  readonly length: number
  readonly count: number
  readonly px: Float32Array
  readonly pz: Float32Array
  readonly tx: Float32Array
  readonly tz: Float32Array
  readonly pw: Float32Array
  readonly segments: SegmentDef[]
  readonly boosts: BoostDef[]

  constructor(waypoints: Waypoint[], segments: SegmentDef[], boosts: BoostDef[]) {
    this.segments = segments
    this.boosts = boosts
    const dense = sampleSpline(waypoints)
    // Resample by arc length at STEP.
    let total = 0
    const cum: number[] = [0]
    for (let i = 1; i < dense.length; i++) {
      total += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z)
      cum.push(total)
    }
    this.length = total
    const n = Math.floor(total / STEP) + 1
    this.count = n
    this.px = new Float32Array(n)
    this.pz = new Float32Array(n)
    this.tx = new Float32Array(n)
    this.tz = new Float32Array(n)
    this.pw = new Float32Array(n)
    let j = 0
    for (let i = 0; i < n; i++) {
      const s = i * STEP
      while (j < dense.length - 2 && cum[j + 1] < s) j++
      const span = cum[j + 1] - cum[j] || 1
      const t = Math.min(1, Math.max(0, (s - cum[j]) / span))
      this.px[i] = dense[j].x + (dense[j + 1].x - dense[j].x) * t
      this.pz[i] = dense[j].z + (dense[j + 1].z - dense[j].z) * t
      this.pw[i] = dense[j].w + (dense[j + 1].w - dense[j].w) * t
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1)
      const b = Math.min(n - 1, i + 1)
      const dx = this.px[b] - this.px[a]
      const dz = this.pz[b] - this.pz[a]
      const l = Math.hypot(dx, dz) || 1
      this.tx[i] = dx / l
      this.tz[i] = dz / l
    }
  }

  /** Interpolated centre line point at distance s (clamped to the track). */
  at(s: number, out: TrackPoint): TrackPoint {
    const f = Math.min(Math.max(s, 0), this.length) / STEP
    const i = Math.min(this.count - 2, Math.floor(f))
    const t = f - i
    out.x = this.px[i] + (this.px[i + 1] - this.px[i]) * t
    out.z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t
    let tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t
    const l = Math.hypot(tx, tz) || 1
    tx /= l
    tz /= l
    out.tx = tx
    out.tz = tz
    out.nx = -tz
    out.nz = tx
    out.w = this.pw[i] + (this.pw[i + 1] - this.pw[i]) * t
    return out
  }

  /** Signed heading change per unit distance around s (positive = turning right). */
  curvature(s: number): number {
    const a = Math.min(Math.max(s - 3, 0), this.length - 6)
    const ia = Math.min(this.count - 1, Math.round(a / STEP))
    const ib = Math.min(this.count - 1, Math.round((a + 6) / STEP))
    const ha = Math.atan2(this.tx[ia], -this.tz[ia])
    let hb = Math.atan2(this.tx[ib], -this.tz[ib])
    let d = hb - ha
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    hb = d
    return hb / 6
  }

  private segAt(s: number, type: SegmentDef['type']): SegmentDef | undefined {
    for (const g of this.segments) if (g.type === type && s >= g.s0 && s <= g.s1) return g
    return undefined
  }

  /** Half width of the drivable surface at s. */
  halfWidth(s: number): number {
    const plank = this.segAt(s, 'plank')
    if (plank && plank.type === 'plank') return plank.width / 2
    const i = Math.min(this.count - 1, Math.max(0, Math.round(s / STEP)))
    return this.pw[i] / 2
  }

  /** True where leaving the track means falling (planks and gaps) rather than hitting a wall. */
  isDropEdge(s: number): boolean {
    return !!this.segAt(s, 'plank') || !!this.segAt(s, 'gap')
  }

  surfaceAt(s: number): Surface {
    const g = this.segAt(s, 'surface')
    return g && g.type === 'surface' ? g.surface : 'normal'
  }

  ceilingAt(s: number): number {
    const g = this.segAt(s, 'tunnel')
    return g && g.type === 'tunnel' ? g.height : Infinity
  }

  inTrench(s: number): boolean {
    return !!this.segAt(s, 'trench')
  }

  /** Ground height at (s, d), or null if there is nothing to stand on. */
  ground(s: number, d: number): number | null {
    if (this.segAt(s, 'gap')) return null
    const hw = this.halfWidth(s)
    if (Math.abs(d) > hw + 0.05 && this.isDropEdge(s)) return null
    for (const g of this.segments) {
      if (g.type === 'ramp' && s >= g.s0 && s <= g.s1) {
        const t = (s - g.s0) / (g.s1 - g.s0)
        return g.height * t
      }
    }
    return 0
  }

  boostAt(s: number, d: number): boolean {
    for (const b of this.boosts) {
      if (Math.abs(s - b.s) < 2.2 && Math.abs(d - b.d) < 3.2) return true
    }
    return false
  }
}

function sampleSpline(wp: Waypoint[]): Waypoint[] {
  const out: Waypoint[] = []
  const n = wp.length
  const get = (i: number): Waypoint => wp[Math.min(n - 1, Math.max(0, i))]
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    const k = Math.max(4, Math.ceil(len / 1.5))
    for (let j = 0; j < k; j++) {
      const t = j / k
      out.push({
        x: cr(p0.x, p1.x, p2.x, p3.x, t),
        z: cr(p0.z, p1.z, p2.z, p3.z, t),
        w: p1.w + (p2.w - p1.w) * t,
      })
    }
  }
  out.push({ ...wp[n - 1] })
  return out
}

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
}
