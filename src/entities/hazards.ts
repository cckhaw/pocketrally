import type { HazardDef } from '../levels/types'

/** Capsule in track space: (s, d) endpoints and radius. */
export interface Capsule {
  as: number
  ad: number
  bs: number
  bd: number
  r: number
}

export interface HazardState {
  /** Centre in track space. */
  s: number
  d: number
  /** Kind-specific angle or phase (radians). */
  angle: number
  /** 0 = at rest / raised, 1 = fully down / extended. */
  lift: number
  /** Telegraph strength 0..1 (drives ground shadow). */
  tele: number
  /** True when the hazard can hurt right now. */
  hurt: boolean
  /** Stomps respawn the car; everything else spins it out. */
  severe: boolean
  visible: boolean
  caps: Capsule[]
  nCaps: number
}

export function makeHazardState(): HazardState {
  const caps: Capsule[] = []
  for (let i = 0; i < 3; i++) caps.push({ as: 0, ad: 0, bs: 0, bd: 0, r: 0 })
  return {
    s: 0,
    d: 0,
    angle: 0,
    lift: 0,
    tele: 0,
    hurt: false,
    severe: false,
    visible: true,
    caps,
    nCaps: 0,
  }
}

function cap(
  st: HazardState,
  i: number,
  as: number,
  ad: number,
  bs: number,
  bd: number,
  r: number,
) {
  const c = st.caps[i]
  c.as = as
  c.ad = ad
  c.bs = bs
  c.bd = bd
  c.r = r
  st.nCaps = Math.max(st.nCaps, i + 1)
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/** Evaluate a hazard at time t (seconds). Deterministic, so the autopilot can predict it. */
export function evalHazard(h: HazardDef, t: number, out: HazardState): HazardState {
  out.nCaps = 0
  out.hurt = false
  out.severe = false
  out.visible = true
  out.tele = 0
  out.lift = 0
  out.angle = 0
  out.s = h.s
  out.d = h.d
  const period = h.period ?? 4
  const u = (((t + (h.phase ?? 0)) % period) + period) % period
  const r = h.r ?? 1.6

  switch (h.kind) {
    case 'block': {
      const hl = h.len ?? 1.5
      const rw = Math.min(r, hl)
      cap(out, 0, h.s - hl + rw, h.d, h.s + hl - rw, h.d, rw)
      out.hurt = true
      out.lift = 1
      break
    }
    case 'stomp': {
      // raised -> telegraph 1.3 s -> down 0.45 s -> raise
      const tele = 1.3
      const down = 0.45
      const start = period - tele - down
      if (u < start) {
        out.lift = 0
        out.tele = 0.08
      } else if (u < start + tele) {
        const f = (u - start) / tele
        out.tele = Math.max(0.08, f)
        out.lift = smooth(f) * 0.25
      } else if (u < start + tele + down) {
        out.tele = 1
        out.lift = 1
        out.hurt = true
        out.severe = true
        cap(out, 0, h.s, h.d, h.s, h.d, r)
      } else {
        out.lift = 0
      }
      break
    }
    case 'paw': {
      const amp = h.amp ?? 5
      const side = h.side ?? 1
      const tele = 1.0
      const swipe = 0.5
      const start = period - tele - swipe
      let d = -side * (amp + 2.5)
      if (u >= start && u < start + tele) {
        out.tele = (u - start) / tele
        d = -side * (amp + 2.5 - out.tele * 1.5)
      } else if (u >= start + tele && u < start + tele + swipe) {
        const f = (u - start - tele) / swipe
        d = -side * (amp + 1 - smooth(f) * (2 * amp + 1))
        out.hurt = true
        out.lift = 1
        out.tele = 1
        cap(out, 0, h.s, d, h.s, d, r)
      } else if (u >= start + tele + swipe) {
        d = side * (amp + 2.5)
        out.visible = false
      } else {
        out.visible = out.tele > 0
      }
      out.d = d
      break
    }
    case 'toddler': {
      const amp = h.amp ?? 5
      // walk across and back, pausing at the edges
      const f = u / period
      const d = f < 0.5 ? -amp + 2 * amp * smooth(f * 2) : amp - 2 * amp * smooth((f - 0.5) * 2)
      out.d = h.d + d
      out.angle = u * 6
      out.hurt = true
      cap(out, 0, h.s, out.d, h.s, out.d, r)
      break
    }
    case 'roller': {
      const amp = h.amp ?? 7
      const speed = h.speed ?? 12
      const side = h.side ?? 1
      const travel = (2 * amp) / speed
      if (u < travel) {
        out.d = h.d - side * amp + side * speed * u
        out.angle = (speed * u) / r
        out.hurt = true
        cap(out, 0, h.s, out.d, h.s, out.d, r)
      } else {
        out.visible = false
        out.d = h.d + side * amp
      }
      break
    }
    case 'vacuum': {
      const len = h.len ?? 6
      const amp = h.amp ?? 4
      const w = (u / period) * Math.PI * 2
      out.s = h.s + Math.sin(w) * len
      out.d = h.d + Math.sin(w * 2 + 1) * amp
      out.angle = w
      out.hurt = true
      cap(out, 0, out.s, out.d, out.s, out.d, r)
      break
    }
    case 'door': {
      const side = h.side ?? 1
      const len = h.amp ?? 8
      const w = (u / period) * Math.PI * 2
      const theta = (Math.PI / 2) * (0.5 - 0.5 * Math.cos(w))
      out.angle = theta
      out.lift = theta / (Math.PI / 2)
      const hs = h.s
      const hd = h.d
      out.hurt = theta > 0.25
      // theta 0: door lies along the track side (open); theta 90deg: it blocks the track.
      cap(out, 0, hs, hd, hs + len * Math.cos(theta), hd - side * len * Math.sin(theta), 0.7)
      break
    }
    case 'fan': {
      const len = h.amp ?? 3.2
      const ang = (t * (h.speed ?? 3)) % (Math.PI * 2)
      out.angle = ang
      out.hurt = true
      const ds = Math.cos(ang) * len
      const dd = Math.sin(ang) * len
      cap(out, 0, h.s - ds, h.d - dd, h.s + ds, h.d + dd, 0.55)
      const ds2 = Math.cos(ang + Math.PI / 2) * len
      const dd2 = Math.sin(ang + Math.PI / 2) * len
      cap(out, 1, h.s - ds2, h.d - dd2, h.s + ds2, h.d + dd2, 0.55)
      break
    }
  }
  return out
}

/** Distance from point (ps,pd) to a capsule's core segment, minus its radius. */
export function capsuleDistance(c: Capsule, ps: number, pd: number): number {
  const abs = c.bs - c.as
  const abd = c.bd - c.ad
  const len2 = abs * abs + abd * abd
  let t = len2 > 1e-9 ? ((ps - c.as) * abs + (pd - c.ad) * abd) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cs = c.as + abs * t
  const cd = c.ad + abd * t
  return Math.hypot(ps - cs, pd - cd) - c.r
}

export function hazardHits(st: HazardState, ps: number, pd: number, carR: number): boolean {
  if (!st.hurt) return false
  for (let i = 0; i < st.nCaps; i++) {
    if (capsuleDistance(st.caps[i], ps, pd) < carR) return true
  }
  return false
}
