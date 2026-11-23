import * as THREE from 'three'

export interface Blocker {
  min: THREE.Vector3
  max: THREE.Vector3
}

/** Critically damped smoothing (Unity-style SmoothDamp) for a scalar. */
export function smoothDamp(
  current: number,
  target: number,
  vel: { v: number },
  smoothTime: number,
  dt: number,
): number {
  const omega = 2 / Math.max(0.0001, smoothTime)
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel.v + omega * change) * dt
  vel.v = (vel.v - omega * temp) * exp
  return target + (change + temp) * exp
}

/**
 * Field of view that keeps the horizontal FOV constant in portrait and the vertical FOV constant
 * in landscape.
 */
export function fovForAspect(baseVFov: number, aspect: number): number {
  if (aspect >= 1) return baseVFov
  const half = Math.tan((baseVFov * Math.PI) / 360)
  return Math.min(110, (2 * Math.atan(half / aspect) * 180) / Math.PI)
}

const tmpDir = new THREE.Vector3()

/** Segment (a -> b) vs AABB; returns entry fraction in [0,1] or 1 if no hit. */
export function segmentBoxHit(a: THREE.Vector3, b: THREE.Vector3, box: Blocker): number {
  tmpDir.subVectors(b, a)
  let t0 = 0
  let t1 = 1
  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z']
  for (const ax of axes) {
    const d = tmpDir[ax]
    const o = a[ax]
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[ax] || o > box.max[ax]) return 1
    } else {
      let ta = (box.min[ax] - o) / d
      let tb = (box.max[ax] - o) / d
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return 1
    }
  }
  return t0
}

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 400)
  baseFov = 62
  private fov = 62
  private fovVel = { v: 0 }
  private px = { v: 0 }
  private py = { v: 0 }
  private pz = { v: 0 }
  private lx = { v: 0 }
  private ly = { v: 0 }
  private lz = { v: 0 }
  private pos = new THREE.Vector3()
  private look = new THREE.Vector3()
  private desired = new THREE.Vector3()
  private lookT = new THREE.Vector3()
  private shake = 0
  private shakeT = 0
  private aspect = 16 / 9
  reducedMotion = false
  blockers: Blocker[] = []
  private first = true

  addShake(amount: number): void {
    if (this.reducedMotion) return
    this.shake = Math.min(1, this.shake + amount)
  }

  setAspect(aspect: number): void {
    this.aspect = aspect
    this.camera.aspect = aspect
  }

  /** Slow orbit around a stationary car (results screen). */
  orbit(carPos: THREE.Vector3, t: number): void {
    this.camera.position.set(carPos.x + Math.sin(t) * 7, carPos.y + 3.2, carPos.z + Math.cos(t) * 7)
    this.camera.lookAt(carPos.x, carPos.y + 0.6, carPos.z)
    this.camera.fov = fovForAspect(55, this.aspect)
    this.camera.updateProjectionMatrix()
    this.first = true
  }

  snap(): void {
    this.first = true
  }

  /**
   * @param carPos world position of the car
   * @param fx,fz forward unit vector of the car (smoothed heading)
   * @param curve signed upcoming curvature (look-ahead)
   * @param boost 0..1 boost amount for the FOV kick
   */
  update(
    dt: number,
    carPos: THREE.Vector3,
    fx: number,
    fz: number,
    curve: number,
    boost: number,
    ceiling: number,
  ): void {
    const back = 3.2
    const up = 1.6
    // look-ahead: shift the look target sideways into turns
    const rx = -fz
    const rz = fx
    const lookAhead = 7
    const bias = Math.max(-1.2, Math.min(1.2, curve * 55))
    this.desired.set(
      carPos.x - fx * back,
      carPos.y + Math.min(up, Math.max(0.7, ceiling - 0.5)),
      carPos.z - fz * back,
    )
    this.lookT.set(
      carPos.x + fx * lookAhead + rx * bias,
      carPos.y + 0.5,
      carPos.z + fz * lookAhead + rz * bias,
    )

    // raycast pull-in against blockers
    let tMin = 1
    for (const b of this.blockers) {
      const t = segmentBoxHit(this.lookT, this.desired, b)
      if (t < tMin) tMin = t
    }
    if (tMin < 1) {
      this.desired.lerpVectors(this.lookT, this.desired, Math.max(0.25, tMin - 0.05))
    }

    if (this.first) {
      this.pos.copy(this.desired)
      this.look.copy(this.lookT)
      this.px.v = this.py.v = this.pz.v = this.lx.v = this.ly.v = this.lz.v = 0
      this.fov = this.baseFov
      this.first = false
    } else {
      this.pos.x = smoothDamp(this.pos.x, this.desired.x, this.px, 0.12, dt)
      this.pos.y = smoothDamp(this.pos.y, this.desired.y, this.py, 0.16, dt)
      this.pos.z = smoothDamp(this.pos.z, this.desired.z, this.pz, 0.12, dt)
      this.look.x = smoothDamp(this.look.x, this.lookT.x, this.lx, 0.1, dt)
      this.look.y = smoothDamp(this.look.y, this.lookT.y, this.ly, 0.14, dt)
      this.look.z = smoothDamp(this.look.z, this.lookT.z, this.lz, 0.1, dt)
    }

    const targetFov = this.baseFov + (this.reducedMotion ? 3 : 13) * boost
    this.fov = smoothDamp(this.fov, targetFov, this.fovVel, 0.18, dt)

    this.shakeT += dt * 60
    const s = this.shake * this.shake
    const ox = Math.sin(this.shakeT * 1.7) * 0.18 * s
    const oy = Math.cos(this.shakeT * 2.3) * 0.14 * s
    this.shake = Math.max(0, this.shake - dt * 2.2)

    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z)
    this.camera.lookAt(this.look)
    this.camera.fov = fovForAspect(this.fov, this.aspect)
    this.camera.updateProjectionMatrix()
  }
}
