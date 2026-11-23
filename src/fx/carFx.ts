import * as THREE from 'three'
import type { CarState } from '../car/controller'
import { Particles } from './particles'
import { Trail } from './trails'

/** Dust, sparks, boost flames and tyre tracks driven by the car state. */
export class CarFx {
  readonly group = new THREE.Group()
  readonly particles = new Particles(700)
  private left = new Trail()
  private right = new Trail()
  private dustColor = new THREE.Color(0xb59a74)
  private acc = 0
  reducedMotion = false

  constructor() {
    this.group.add(this.left.mesh, this.right.mesh, this.particles.points)
  }

  setDustColor(hex: number): void {
    this.dustColor.setHex(hex)
  }

  reset(): void {
    this.left.clear()
    this.right.clear()
    this.particles.clear()
  }

  /** @param pos world position, hx/hz forward unit vector (world heading incl. yaw) */
  update(dt: number, car: CarState, pos: THREE.Vector3, hx: number, hz: number): void {
    const rx = -hz
    const rz = hx
    const grounded = car.grounded
    const slide = Math.abs(car.vLat) > 6 || car.brake || car.spinT > 0
    this.left.active = grounded && (slide || car.boostT > 0) && car.speed > 4
    this.right.active = this.left.active
    const back = 0.85
    const wl = 0.78
    this.left.push(dt, pos.x - hx * back - rx * wl, pos.y, pos.z - hz * back - rz * wl, rx, rz)
    this.right.push(dt, pos.x - hx * back + rx * wl, pos.y, pos.z - hz * back + rz * wl, rx, rz)

    this.acc += dt
    const c = this.dustColor
    if (grounded && car.speed > 6) {
      const rate = (car.brake ? 70 : slide ? 45 : 20) * (car.speed / 25)
      let n = this.acc * rate
      this.acc = 0
      while (n > 0) {
        n--
        const side = Math.random() < 0.5 ? -1 : 1
        this.particles.emit(
          pos.x - hx * 1.1 + rx * side * 0.8,
          pos.y + 0.15,
          pos.z - hz * 1.1 + rz * side * 0.8,
          -hx * 1.5 + (Math.random() - 0.5) * 1.4,
          0.6 + Math.random() * 0.8,
          -hz * 1.5 + (Math.random() - 0.5) * 1.4,
          0.55,
          0.9 + Math.random() * 0.5,
          c.r,
          c.g,
          c.b,
          0.7,
          -0.5,
        )
      }
    } else this.acc = 0
    if (car.boostT > 0 && !this.reducedMotion) {
      for (let i = 0; i < 2; i++) {
        this.particles.emit(
          pos.x - hx * 1.3,
          pos.y + 0.55,
          pos.z - hz * 1.3,
          -hx * 6 + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.6,
          -hz * 6 + (Math.random() - 0.5),
          0.28,
          1.1,
          1,
          0.62 + Math.random() * 0.3,
          0.15,
          0.9,
        )
      }
    }
  }

  burst(x: number, y: number, z: number, n: number, r: number, g: number, b: number, speed = 4, size = 0.6, gravity = 12): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const u = Math.random()
      this.particles.emit(
        x,
        y,
        z,
        Math.cos(a) * speed * u,
        speed * (0.4 + Math.random() * 0.9),
        Math.sin(a) * speed * u,
        0.5 + Math.random() * 0.3,
        size,
        r,
        g,
        b,
        1,
        gravity,
      )
    }
  }

  landing(pos: THREE.Vector3, impact: number): void {
    const n = Math.min(30, 6 + Math.round(impact))
    this.burst(pos.x, pos.y + 0.1, pos.z, n, 1, 0.8, 0.3, 4 + impact * 0.2, 0.5, 14)
    this.burst(pos.x, pos.y + 0.1, pos.z, Math.round(n / 2), this.dustColor.r, this.dustColor.g, this.dustColor.b, 3, 1.1, -0.5)
  }
}
