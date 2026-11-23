import * as THREE from 'three'
import type { Track } from '../core/track'
import { makeTrackPoint } from '../core/track'
import type { LevelConfig, SegmentDef } from '../levels/types'
import { Batch, CHUNK, GEO } from './batch'
import { PropCtx } from './propCtx'

const P = makeTrackPoint()

function samples(a: number, b: number, extra: number[]): number[] {
  const set = new Set<number>([a, b])
  for (let s = Math.ceil(a); s < b; s++) set.add(s)
  for (const e of extra) if (e > a && e < b) set.add(e)
  return [...set].sort((x, y) => x - y)
}

/** Flat ribbon between lateral offsets, following the ground height. UVs are world-space. */
export function ribbon(
  track: Track,
  a: number,
  b: number,
  dMin: number | ((s: number) => number),
  dMax: number | ((s: number) => number),
  y: (s: number) => number,
  uvScale = 8,
  extra: number[] = [],
): THREE.BufferGeometry {
  const ss = samples(a, b, extra)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const lo = typeof dMin === 'function' ? dMin : () => dMin
  const hi = typeof dMax === 'function' ? dMax : () => dMax
  for (const s of ss) {
    const p = track.at(s, P)
    const yy = y(s)
    for (const d of [lo(s), hi(s)]) {
      const x = p.x + p.nx * d
      const z = p.z + p.nz * d
      pos.push(x, yy, z)
      uv.push(x / uvScale, z / uvScale)
    }
  }
  for (let i = 0; i < ss.length - 1; i++) {
    const k = i * 2
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // make normals face up regardless of winding
  const n = g.getAttribute('normal')
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}

/** Prism wall along the track edge (inner face, top, outer face). */
export function wallStrip(
  track: Track,
  a: number,
  b: number,
  side: 1 | -1,
  height: number,
  thick: number,
  hwOf: (s: number) => number,
  yOf: (s: number) => number,
  extra: number[],
): THREE.BufferGeometry {
  const ss = samples(a, b, extra)
  const pos: number[] = []
  const idx: number[] = []
  const rows: number[][] = []
  for (const s of ss) {
    const p = track.at(s, P)
    const hw = hwOf(s)
    const y0 = yOf(s)
    const row: number[] = []
    const pts: [number, number][] = [
      [hw, y0 - 0.2],
      [hw, y0 + height],
      [hw + thick, y0 + height],
      [hw + thick, y0 - 0.2],
    ]
    for (const [d, y] of pts) {
      row.push(pos.length / 3)
      pos.push(p.x + p.nx * d * side, y, p.z + p.nz * d * side)
    }
    rows.push(row)
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i]
    const r1 = rows[i + 1]
    for (let k = 0; k < 3; k++) idx.push(r0[k], r0[k + 1], r1[k], r0[k + 1], r1[k + 1], r1[k])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Half-pipe tunnel/arch shell over [a,b] made of coloured rings (bricks). */
function tunnelShell(track: Track, a: number, b: number, height: number, hwOf: (s: number) => number, colors: [number, number]): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const c0 = new THREE.Color(colors[0])
  const c1 = new THREE.Color(colors[1])
  const seg = 12
  const step = 1.5
  const rings: number[] = []
  for (let s = a; s < b; s += step) rings.push(s)
  rings.push(b)
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const quad: [number, number, number, number][] = []
      for (const [ri, ak] of [[i, k], [i, k + 1], [i + 1, k], [i + 1, k + 1]] as const) {
        const s = rings[ri]
        const p = track.at(s, P)
        const ang = (ak / seg) * Math.PI
        const hw = hwOf(s) + 0.6
        const d = -Math.cos(ang) * hw
        const y = Math.sin(ang) * height
        quad.push([p.x + p.nx * d, y, p.z + p.nz * d, 0])
      }
      const c = (i + k) % 2 ? c0 : c1
      const order = [0, 1, 2, 1, 3, 2]
      for (const o of order) {
        pos.push(quad[o][0], quad[o][1], quad[o][2])
        col.push(c.r, c.g, c.b)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

export interface TrackMeshes {
  group: THREE.Group
  triangles: number
}

function splitRuns(level: LevelConfig, length: number): [number, number][] {
  const cuts: [number, number][] = []
  for (const g of level.segments) if (g.type === 'gap' || g.type === 'plank') cuts.push([g.s0, g.s1])
  cuts.sort((x, y) => x[0] - y[0])
  const runs: [number, number][] = []
  let cur = 0
  for (const [a, b] of cuts) {
    if (a > cur) runs.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (cur < length) runs.push([cur, length])
  const out: [number, number][] = []
  for (const [a, b] of runs) {
    for (let s = a; s < b; s += 60) out.push([s, Math.min(b, s + 60)])
  }
  return out
}

export function buildTrackMeshes(
  level: LevelConfig,
  track: Track,
  floorMap: THREE.Texture,
  trackMap: THREE.Texture,
  chevron: THREE.Texture,
  batch: Batch,
  ctx: PropCtx,
): TrackMeshes {
  const group = new THREE.Group()
  const th = level.theme
  const bounds = level.segments.flatMap((g: SegmentDef) => [g.s0, g.s1])
  const floorMat = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 1, side: THREE.DoubleSide })
  const trackMat = new THREE.MeshStandardMaterial({ map: trackMap, roughness: 0.85, side: THREE.DoubleSide })
  const yOf = (s: number) => track.ground(s, 0) ?? 0
  let tris = 0

  for (const [a, b] of splitRuns(level, track.length)) {
    const shoulder = new THREE.Mesh(ribbon(track, a, b, -90, 90, () => -0.08, 8, []), floorMat)
    shoulder.receiveShadow = true
    group.add(shoulder)
    const road = new THREE.Mesh(ribbon(track, a, b, (s) => -track.halfWidth(s), (s) => track.halfWidth(s), yOf, 8, bounds), trackMat)
    road.receiveShadow = true
    group.add(road)
    tris += ((b - a) * 2 * 2) | 0
    const chunk = Math.floor(a / CHUNK)
    // curbs / walls on non-drop runs
    for (const side of [-1, 1] as const) {
      const trench = level.segments.find((g) => g.type === 'trench' && g.s0 < b && g.s1 > a)
      const wallH = trench && trench.type === 'trench' ? (trench.wallHeight ?? 1.5) : 0.35
      batch.addRaw(
        wallStrip(track, a, b, side, wallH, trench ? 1.4 : 0.5, (s) => track.halfWidth(s), yOf, bounds),
        th.curbColor,
        chunk,
      )
    }
  }

  // abyss + cliffs
  const abyssColor = new THREE.Color(th.fog).lerp(new THREE.Color(0x000000), 0.55)
  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: abyssColor }))
  abyss.rotation.x = -Math.PI / 2
  abyss.position.y = -14
  group.add(abyss)
  for (const g of level.segments) {
    if (g.type !== 'gap' && g.type !== 'plank') continue
    for (const s of [g.s0, g.s1]) {
      const p = track.at(s, P)
      const geo = new THREE.PlaneGeometry(180, 14)
      geo.rotateY(Math.atan2(p.tx, -p.tz) + Math.PI)
      geo.translate(p.x, -7.08, p.z)
      batch.addRaw(geo, new THREE.Color(th.curbColor).multiplyScalar(0.5).getHex(), Math.floor(s / CHUNK))
    }
  }

  // ramp lips (front faces)
  for (const g of level.segments) {
    if (g.type !== 'ramp') continue
    const p = track.at(g.s1, P)
    const hw = track.halfWidth(g.s1)
    ctx.place(g.s1, 0, 0)
    ctx.box(th.curbColor, hw * 2 + 1, g.height + 0.2, 0.4, 0, g.height / 2 - 0.1, 0.2)
    // hazard stripe on the lip
    ctx.box(0xffd21a, hw * 2, 0.08, 0.5, 0, g.height + 0.02, -0.3)
    void p
  }

  // planks / bridges
  for (const g of level.segments) {
    if (g.type !== 'plank') continue
    const w = g.width
    let i = 0
    for (let s = g.s0; s < g.s1; s += 1.05, i++) {
      ctx.place(Math.min(s + 0.5, g.s1), 0, 0)
      const tone = i % 3 === 0 ? 0x9a6a3a : i % 3 === 1 ? 0xb07a45 : 0x85582f
      ctx.box(tone, w, 0.26, 0.98, 0, -0.14, 0)
    }
    for (const side of [-1, 1]) {
      for (let s = g.s0; s < g.s1; s += 4) {
        ctx.place(Math.min(s + 2, g.s1), side * (w / 2 + 0.1), 0)
        ctx.box(0x6b4423, 0.22, 0.32, 4.05, 0, -0.1, 0)
      }
    }
  }

  // tunnels
  for (const g of level.segments) {
    if (g.type !== 'tunnel') continue
    batch.addRaw(tunnelShell(track, g.s0, g.s1, g.height, (s) => track.halfWidth(s), [0x8a4b3a, 0x74402f]), -1, Math.floor(g.s0 / CHUNK))
    // end rings
    for (const s of [g.s0, g.s1]) {
      ctx.place(s, 0, 0)
      const hw = track.halfWidth(s) + 0.6
      for (let k = 0; k <= 10; k++) {
        const ang = (k / 10) * Math.PI
        ctx.box(0xb9a58a, 0.9, 0.9, 0.9, -Math.cos(ang) * (hw + 0.3), Math.sin(ang) * (g.height + 0.3), 0)
      }
    }
  }

  // water
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f7fbf, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.2, emissive: 0x0a2a44 })
  for (const g of level.segments) {
    if (g.type !== 'surface' || g.surface === 'normal') continue
    const m = g.surface === 'water' ? waterMat : new THREE.MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.2, transparent: true, opacity: 0.85 })
    const mesh = new THREE.Mesh(ribbon(track, g.s0, g.s1, (s) => -track.halfWidth(s) + 0.2, (s) => track.halfWidth(s) - 0.2, () => 0.04, 8, bounds), m)
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // boost pads
  const padMat = new THREE.MeshStandardMaterial({ map: chevron, emissive: 0xffc800, emissiveIntensity: 0.35, roughness: 0.6 })
  for (const b of level.boosts) {
    const p = track.at(b.s, P)
    const geo = new THREE.PlaneGeometry(5.6, 4.6)
    geo.rotateX(-Math.PI / 2)
    // chevron points forward (-Z in local space)
    geo.rotateY(Math.atan2(-p.tx, p.tz) + Math.PI)
    geo.translate(p.x + p.nx * b.d, 0.06 + (track.ground(b.s, 0) ?? 0), p.z + p.nz * b.d)
    const m = new THREE.Mesh(geo, padMat)
    m.receiveShadow = true
    group.add(m)
  }
  return { group, triangles: tris + batch.triangles }
}

export function addCheckpointFlags(level: LevelConfig, track: Track, ctx: PropCtx): void {
  for (const s of level.checkpoints) {
    const hw = track.halfWidth(s)
    for (const side of [-1, 1]) {
      ctx.place(s, side * (hw + 0.5), 0)
      ctx.cyl(0xdddddd, 0.07, 3.6, 0, 1.8, 0)
      ctx.sphere(0xffd21a, 0.14, 0, 3.65, 0)
      // red-and-white pennant (stacked wedges)
      for (let i = 0; i < 5; i++) {
        ctx.box(i % 2 ? 0xffffff : 0xe5252a, 0.6, 0.38, 0.05, side * -(0.3 + i * 0), 3.3 - i * 0.04, 0)
        ctx.box(i % 2 ? 0xffffff : 0xe5252a, 0.4 - i * 0.07, 0.38, 0.05, side * -(0.9 + i * 0.3), 3.3, 0)
      }
    }
    ctx.place(s, 0, 0)
    ctx.box(0xe5252a, hw * 2, 0.06, 0.4, 0, 0.05, 0)
  }
}

export function addFinishGate(level: LevelConfig, track: Track, ctx: PropCtx, checker: THREE.Texture, group: THREE.Group): void {
  const s = track.length - 2
  const hw = track.halfWidth(s)
  const p = track.at(s, P)
  const h = 5
  ctx.place(s, 0, 0)
  for (const side of [-1, 1]) {
    ctx.box(0x222222, 0.7, h, 0.7, side * (hw + 0.6), h / 2, 0)
    ctx.box(0xffffff, 0.75, 0.6, 0.75, side * (hw + 0.6), 0.6, 0)
  }
  ctx.box(0x222222, hw * 2 + 2.4, 0.5, 0.7, 0, h, 0)
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2 + 1.2, 1.6),
    new THREE.MeshStandardMaterial({ map: checker, side: THREE.DoubleSide, emissive: 0x222222 }),
  )
  banner.position.set(p.x, h - 1.0, p.z)
  banner.rotation.y = -Math.atan2(p.tx, -p.tz)
  group.add(banner)
  // start + finish line stripes
  for (const ss of [2, s + 0.5]) {
    ctx.place(ss, 0, 0)
    for (let i = 0; i < 8; i++) ctx.box(i % 2 ? 0x111111 : 0xffffff, (hw * 2) / 8, 0.05, 1, -hw + (i + 0.5) * ((hw * 2) / 8), 0.03, 0)
  }
  void level
  void GEO
}
