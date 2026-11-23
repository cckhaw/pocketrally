import * as THREE from 'three'
import type { Track, TrackPoint } from '../core/track'
import { makeTrackPoint } from '../core/track'
import type { Blocker } from '../core/camera'
import { Batch, CHUNK, GEO, type Xform } from './batch'

export interface DynamicProp {
  update(t: number, carS: number): void
}

/** Everything a prop builder needs: place primitives in a local frame anchored on the track. */
export class PropCtx {
  readonly base = new THREE.Matrix4()
  readonly tmp = new THREE.Matrix4()
  readonly p: TrackPoint = makeTrackPoint()
  chunk = 0
  scale = 1
  rnd: () => number = Math.random
  heading = 0
  x = 0
  y = 0
  z = 0
  readonly dynamic: DynamicProp[] = []
  readonly blockers: Blocker[] = []
  readonly group = new THREE.Group()

  constructor(
    readonly batch: Batch,
    readonly track: Track,
  ) {}

  /** Anchor at track (s, d) with extra yaw. Local axes: +x right, +y up, -z forward. */
  place(s: number, d: number, rot: number, scale = 1, yOff = 0): void {
    const p = this.track.at(s, this.p)
    this.x = p.x + p.nx * d
    this.z = p.z + p.nz * d
    this.y = yOff
    this.heading = Math.atan2(p.tx, -p.tz)
    this.chunk = Math.floor(s / CHUNK)
    this.scale = scale
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading + rot)
    this.base.compose(new THREE.Vector3(this.x, this.y, this.z), q, new THREE.Vector3(scale, scale, scale))
  }

  /** Add a primitive in the local frame. */
  add(geo: THREE.BufferGeometry, color: number, t: Xform): void {
    this.tmp.copy(this.base).multiply(this.batch.matrix(t))
    this.batch.addMatrix(geo, color, this.tmp, this.chunk)
  }

  box(color: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): void {
    this.add(GEO.box, color, { x, y, z, sx: w, sy: h, sz: d, ry, rx, rz })
  }

  /** Cylinder with radii (uniform) and height, axis = local Y unless rotated. */
  cyl(color: number, r: number, h: number, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0): void {
    this.add(GEO.cyl, color, { x, y, z, sx: r, sy: h, sz: r, rx, rz, ry })
  }

  sphere(color: number, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): void {
    this.add(GEO.sphere, color, { x, y, z, sx: r * sx, sy: r * sy, sz: r * sz })
  }

  cone(color: number, r: number, h: number, x = 0, y = 0, z = 0, rx = 0, rz = 0): void {
    this.add(GEO.cone, color, { x, y, z, sx: r, sy: h, sz: r, rx, rz })
  }

  /** Register a camera blocker box, in world space, from the local box centre and size. */
  blocker(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.base)
    const r = Math.max(w, d) * this.scale * 0.5
    this.blockers.push({
      min: new THREE.Vector3(v.x - r, v.y - (h * this.scale) / 2, v.z - r),
      max: new THREE.Vector3(v.x + r, v.y + (h * this.scale) / 2, v.z + r),
    })
  }
}
