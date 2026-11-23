import * as THREE from 'three'
import type { Run } from '../core/run'
import type { Track } from '../core/track'
import { makeTrackPoint } from '../core/track'
import type { HazardDef, LevelConfig } from '../levels/types'
import { Batch, GEO, type Xform } from './batch'
import { warningTexture } from './textures'

/** Small helper that builds one merged, vertex-coloured mesh in local coordinates. */
export class Mini {
  readonly batch = new Batch()
  add(geo: THREE.BufferGeometry, color: number, t: Xform): this {
    this.batch.add(geo, color, t, 0)
    return this
  }
  box(
    color: number,
    w: number,
    h: number,
    d: number,
    x = 0,
    y = 0,
    z = 0,
    ry = 0,
    rx = 0,
    rz = 0,
  ): this {
    return this.add(GEO.box, color, { x, y, z, sx: w, sy: h, sz: d, ry, rx, rz })
  }
  cyl(color: number, r: number, h: number, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0): this {
    return this.add(GEO.cyl, color, { x, y, z, sx: r, sy: h, sz: r, rx, rz, ry })
  }
  sphere(color: number, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): this {
    return this.add(GEO.sphere, color, { x, y, z, sx: r * sx, sy: r * sy, sz: r * sz })
  }
  cone(color: number, r: number, h: number, x = 0, y = 0, z = 0, rx = 0, rz = 0): this {
    return this.add(GEO.cone, color, { x, y, z, sx: r, sy: h, sz: r, rx, rz })
  }
  mesh(): THREE.Mesh {
    const g = this.batch.build(MODEL_MAT).children[0] as THREE.Mesh
    g.castShadow = true
    return g
  }
}

const MODEL_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.65,
  metalness: 0.05,
})

const SKIN = 0xf0b48c
const SKIN_D = 0xd89c74

export function footModel(): THREE.Mesh {
  const m = new Mini()
  m.sphere(SKIN, 1.5, 0, 0.9, 0.2, 0.95, 0.55, 1.55) // sole/body
  m.sphere(SKIN_D, 0.9, 0, 0.9, 1.7, 0.95, 0.6, 0.75) // heel
  m.cyl(SKIN, 0.85, 14, 0, 7.8, 1.5) // leg
  const toes: [number, number, number][] = [
    [-1.0, 0.7, -1.8],
    [-0.5, 0.7, -2.1],
    [0.05, 0.7, -2.15],
    [0.55, 0.65, -2.05],
    [1.0, 0.6, -1.75],
  ]
  toes.forEach(([x, y, z], i) => {
    m.sphere(SKIN, 0.42 - i * 0.04, x, y, z)
    m.sphere(0xf7e3d4, 0.12, x, y + 0.15, z - 0.28)
  })
  return m.mesh()
}

function pawModel(): THREE.Mesh {
  const m = new Mini()
  const fur = 0xe58a3a
  m.sphere(fur, 1.1, 0, 0.9, 0, 1.1, 0.8, 1.2)
  m.sphere(0xf3b6b6, 0.55, 0, 0.5, 0, 1, 0.5, 1)
  for (let i = 0; i < 4; i++) m.sphere(0xf3b6b6, 0.2, -0.65 + i * 0.43, 0.55, -0.75)
  m.cyl(fur, 0.8, 14, 0, 1, 7, Math.PI / 2, 0)
  m.box(0x8a4a1a, 0.15, 0.1, 6, 0, 1.75, 3)
  return m.mesh()
}

function toddlerModel(): THREE.Mesh {
  const m = new Mini()
  m.cyl(0xf2c9a5, 0.28, 1.1, -0.45, 0.7, 0)
  m.cyl(0xf2c9a5, 0.28, 1.1, 0.45, 0.7, 0)
  m.sphere(0xffffff, 0.95, 0, 1.6, 0, 1.2, 0.9, 1.1) // diaper
  m.cyl(0x4aa3f0, 0.8, 1.2, 0, 2.7, 0)
  m.sphere(0xf2c9a5, 0.7, 0, 3.9, 0)
  m.sphere(0x6b4a2a, 0.5, 0, 4.2, 0.15, 1, 0.6, 1)
  for (const x of [-0.25, 0.25]) m.sphere(0x222222, 0.08, x, 3.95, -0.62)
  m.cyl(0xf2c9a5, 0.18, 1.1, -1.05, 2.7, 0, 0, 0.8)
  m.cyl(0xf2c9a5, 0.18, 1.1, 1.05, 2.7, 0, 0, -0.8)
  return m.mesh()
}

function barrelModel(): THREE.Mesh {
  const m = new Mini()
  m.cyl(0x8a5a2b, 1.2, 2.2, 0, 1.2, 0, Math.PI / 2, 0)
  m.cyl(0x333333, 1.25, 0.2, 0, 1.2, -0.7, Math.PI / 2, 0)
  m.cyl(0x333333, 1.25, 0.2, 0, 1.2, 0.7, Math.PI / 2, 0)
  return m.mesh()
}

function ballModel(): THREE.Mesh {
  const m = new Mini()
  m.sphere(0xe36a1a, 1.2, 0, 1.2, 0)
  m.cyl(0x1a1a1a, 1.22, 0.1, 0, 1.2, 0, Math.PI / 2, 0)
  m.cyl(0x1a1a1a, 1.22, 0.1, 0, 1.2, 0, 0, Math.PI / 2)
  return m.mesh()
}

function vacuumModel(): THREE.Mesh {
  const m = new Mini()
  m.cyl(0xe8eaee, 1.7, 0.7, 0, 0.45, 0)
  m.cyl(0x2a2d33, 1.75, 0.22, 0, 0.25, 0)
  m.cyl(0x2a2d33, 0.55, 0.12, 0, 0.84, 0)
  m.sphere(0x33dd66, 0.14, 0, 0.9, -1.2)
  m.box(0x2a2d33, 1.4, 0.12, 0.3, 0, 0.35, -1.65)
  return m.mesh()
}

function sneakerModel(): THREE.Mesh {
  const m = new Mini()
  m.box(0xf4f4f4, 2.4, 0.5, 5.2, 0, 0.3, 0) // sole
  m.sphere(0xd8362c, 1.2, 0, 1.0, 0.7, 1, 0.8, 1.7) // upper
  m.sphere(0xffffff, 0.9, 0, 0.9, -1.6, 1.15, 0.7, 1) // toe cap
  m.box(0xffffff, 1.7, 0.25, 0.3, 0, 1.55, -0.2)
  m.box(0xffffff, 1.7, 0.25, 0.3, 0, 1.6, 0.4)
  m.box(0xd8362c, 2.0, 1.6, 1.2, 0, 1.4, 2.0)
  m.box(0x1a1a1a, 2.0, 0.2, 0.2, 0, 2.2, 2.0)
  return m.mesh()
}

function guitarModel(electric: boolean): THREE.Mesh {
  const m = new Mini()
  const body = electric ? 0xc4161c : 0xc9843a
  m.sphere(body, 1.5, 0, 0.45, 1.3, 1, 0.3, 1.1)
  m.sphere(body, 1.15, 0, 0.45, -0.3, 1, 0.3, 1)
  m.box(electric ? 0x3a2a1a : 0x5a3a1a, 0.5, 0.18, 4.6, 0, 0.75, -3.4)
  m.box(0x1a1a1a, 0.7, 0.2, 0.9, 0, 0.85, -6)
  m.cyl(0x111111, 0.5, 0.1, 0, 0.8, 0.5, 0, 0)
  for (let i = 0; i < 6; i++) m.box(0xdddddd, 0.02, 0.02, 7.4, -0.18 + i * 0.07, 0.9, -2.5)
  return m.mesh()
}

export function corkModel(): THREE.Mesh {
  const m = new Mini()
  m.cyl(0xc99a5a, 1.0, 1.8, 0, 0.9, 0)
  m.cyl(0xb08040, 1.02, 0.1, 0, 1.8, 0)
  return m.mesh()
}

function crateModel(): THREE.Mesh {
  const m = new Mini()
  m.box(0x9a6a3a, 2.4, 2.2, 2.4, 0, 1.1, 0)
  m.box(0x6b4423, 2.5, 0.25, 2.5, 0, 0.3, 0)
  m.box(0x6b4423, 2.5, 0.25, 2.5, 0, 1.9, 0)
  return m.mesh()
}

function doorModel(len: number): THREE.Mesh {
  const m = new Mini()
  m.box(0x7a4a22, len, 6, 0.35, len / 2, 3, 0)
  m.box(0x3a3a3f, len * 0.9, 0.3, 0.45, len / 2, 1.2, 0)
  m.box(0x3a3a3f, len * 0.9, 0.3, 0.45, len / 2, 4.6, 0)
  m.cyl(0x2a2a2e, 0.35, 6.4, 0, 3.2, 0)
  return m.mesh()
}

function fanModel(len: number): { stand: THREE.Mesh; blades: THREE.Mesh } {
  const s = new Mini()
  s.cyl(0x555a62, 0.5, 1.2, 0, 0.6, 0)
  s.cyl(0x777c84, 1.2, 0.2, 0, 0.1, 0)
  const b = new Mini()
  b.box(0xd9dde3, len * 2, 0.12, 0.9, 0, 0, 0)
  b.box(0xd9dde3, 0.9, 0.12, len * 2, 0, 0, 0)
  b.cyl(0x444a52, 0.5, 0.35, 0, 0, 0)
  return { stand: s.mesh(), blades: b.mesh() }
}

function wormModel(): THREE.Mesh {
  const m = new Mini()
  const n = 9
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    m.sphere(
      i % 2 ? 0xe0a0a0 : 0xd98a8a,
      1.15 - 0.3 * Math.abs(t - 0.5),
      0,
      0.95 + Math.sin(t * Math.PI * 2) * 0.55,
      (t - 0.5) * 7,
    )
  }
  m.sphere(0xcf7a7a, 1.1, 0, 1.2, -3.8)
  m.sphere(0x222222, 0.16, -0.4, 1.7, -4.7)
  m.sphere(0x222222, 0.16, 0.4, 1.7, -4.7)
  return m.mesh()
}

function onionRollModel(): THREE.Mesh {
  const m = new Mini()
  m.sphere(0xd9a441, 1.3, 0, 1.3, 0, 1, 0.92, 1)
  m.cone(0xd9a441, 0.5, 1.2, 0, 2.7, 0)
  m.cyl(0xb8862f, 1.32, 0.08, 0, 1.3, 0, Math.PI / 2, 0)
  return m.mesh()
}

function bootModel(): THREE.Mesh {
  const m = new Mini()
  m.box(0x3b2a1a, 3.2, 0.7, 6.4, 0, 0.35, 0)
  m.sphere(0x6a4a2a, 1.6, 0, 1.2, -0.8, 1, 0.8, 1.5)
  m.box(0x6a4a2a, 2.8, 12, 2.8, 0, 7, 1.6)
  m.box(0x2a1c10, 3.0, 0.5, 3.0, 0, 13, 1.6)
  return m.mesh()
}

function logModel(): THREE.Mesh {
  const m = new Mini()
  m.cyl(0x7a5230, 1.2, 5.6, 0, 1.1, 0, Math.PI / 2, 0, 0)
  m.cyl(0xc9a06a, 1.15, 0.1, 2.85, 1.1, 0, 0, Math.PI / 2)
  m.cyl(0xc9a06a, 1.15, 0.1, -2.85, 1.1, 0, 0, Math.PI / 2)
  return m.mesh()
}

function catModel(): THREE.Mesh {
  const m = new Mini()
  const fur = 0xe58a3a
  m.sphere(fur, 1.0, 0, 1.5, 0, 0.8, 0.9, 1.8)
  m.sphere(fur, 0.8, 0, 2.0, -1.9)
  m.cone(fur, 0.3, 0.6, -0.4, 2.8, -1.9)
  m.cone(fur, 0.3, 0.6, 0.4, 2.8, -1.9)
  for (const [x, z] of [
    [-0.5, -1],
    [0.5, -1],
    [-0.5, 1],
    [0.5, 1],
  ])
    m.cyl(fur, 0.22, 1.5, x, 0.75, z)
  m.cyl(0xc9701f, 0.18, 3, 0, 2.6, 2.4, 0.6, 0)
  m.box(0x8a4a1a, 0.9, 0.12, 2.4, 0, 2.3, 0)
  return m.mesh()
}

const MODELS: Record<string, () => THREE.Mesh> = {
  worm: wormModel,
  onionRoll: onionRollModel,
  boot: bootModel,
  log: logModel,
  cat: catModel,
  foot: footModel,
  paw: pawModel,
  toddler: toddlerModel,
  barrel: barrelModel,
  ball: ballModel,
  vacuum: vacuumModel,
  sneaker: sneakerModel,
  guitarA: () => guitarModel(false),
  guitarE: () => guitarModel(true),
  cork: corkModel,
  crate: crateModel,
}

interface View {
  def: HazardDef
  root: THREE.Group
  body: THREE.Object3D
  shadow: THREE.Mesh | null
  extra: THREE.Object3D | null
  lift: number
  lastD: number
  facing: number
}

const P = makeTrackPoint()

/** Visual side of the hazards; positions come from the deterministic evaluation in the Run. */
export class HazardViews {
  readonly group = new THREE.Group()
  private views: View[] = []
  private track: Track

  constructor(level: LevelConfig, track: Track) {
    this.track = track
    const warn = new THREE.MeshBasicMaterial({
      map: warningTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    for (const def of level.hazards) {
      const root = new THREE.Group()
      let body: THREE.Object3D
      let extra: THREE.Object3D | null = null
      if (def.kind === 'door') {
        body = doorModel(def.amp ?? 8)
      } else if (def.kind === 'fan') {
        const f = fanModel(def.amp ?? 3.2)
        body = f.stand
        f.blades.position.y = 1.3
        extra = f.blades
      } else {
        body = (MODELS[def.model] ?? crateModel)()
      }
      root.add(body)
      if (extra) root.add(extra)
      let shadow: THREE.Mesh | null = null
      if (def.kind === 'stomp' || def.kind === 'paw') {
        shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), warn.clone())
        shadow.rotation.x = -Math.PI / 2
        shadow.renderOrder = 2
        this.group.add(shadow)
      }
      this.group.add(root)
      this.views.push({ def, root, body, shadow, extra, lift: 0, lastD: def.d, facing: 1 })
    }
  }

  update(run: Run, dt: number): void {
    const track = this.track
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i]
      const st = run.hazards[i]
      const def = v.def
      const p = track.at(st.s, P)
      const heading = Math.atan2(p.tx, -p.tz)
      const x = p.x + p.nx * st.d
      const z = p.z + p.nz * st.d
      const gy = track.ground(st.s, st.d) ?? 0
      v.root.visible = st.visible
      v.root.position.set(x, gy, z)
      v.root.rotation.set(0, -heading, 0)
      switch (def.kind) {
        case 'stomp': {
          v.lift += (st.lift - v.lift) * Math.min(1, dt * (st.lift > 0.9 ? 40 : 6))
          v.root.position.y = gy + (1 - v.lift) * 11
          if (v.shadow) {
            const k = (def.r ?? 1.8) * 2 * (0.7 + 0.6 * st.tele)
            v.shadow.scale.set(k * 1.2, k * 1.2, 1)
            v.shadow.position.set(x, gy + 0.05, z)
            ;(v.shadow.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.75 * st.tele
          }
          break
        }
        case 'paw': {
          const dir = Math.sign(def.side ?? 1)
          v.root.rotation.y = -heading + (dir > 0 ? -Math.PI / 2 : Math.PI / 2)
          if (v.shadow) {
            v.shadow.visible = st.tele > 0 && !st.hurt
            const k = (def.r ?? 1.6) * 2.4
            v.shadow.scale.set(k * 1.6, k, 1)
            v.shadow.position.set(x, gy + 0.05, z)
            ;(v.shadow.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.8 * st.tele
          }
          break
        }
        case 'toddler': {
          const dd = st.d - v.lastD
          if (Math.abs(dd) > 1e-4) v.facing = Math.sign(dd)
          v.lastD = st.d
          v.root.rotation.y = -heading + (v.facing > 0 ? -Math.PI / 2 : Math.PI / 2)
          v.body.rotation.z = Math.sin(st.angle) * 0.18
          v.body.position.y = Math.abs(Math.sin(st.angle)) * 0.12
          break
        }
        case 'roller': {
          v.body.rotation.z = st.angle * (def.side ?? 1) * -1
          break
        }
        case 'vacuum': {
          v.body.rotation.y = st.angle * 2
          break
        }
        case 'door': {
          const side = def.side ?? 1
          const len = def.amp ?? 8
          const th = st.angle
          const dx = Math.cos(th)
          const dn = -side * Math.sin(th)
          const wx = p.tx * dx + p.nx * dn
          const wz = p.tz * dx + p.nz * dn
          v.root.rotation.y = Math.atan2(-wz, wx)
          void len
          break
        }
        case 'fan': {
          if (v.extra) {
            const dx = Math.cos(st.angle)
            const dn = Math.sin(st.angle)
            const wx = p.tx * dx + p.nx * dn
            const wz = p.tz * dx + p.nz * dn
            v.extra.rotation.y = Math.atan2(-wz, wx)
          }
          v.root.rotation.y = 0
          break
        }
        case 'block':
          v.root.rotation.y = -heading + (def.speed ?? 0)
          break
      }
    }
  }
}
