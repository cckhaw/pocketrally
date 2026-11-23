import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CarState } from './controller'

export const CAR_SCALE = 0.74

const mat = (color: number, rough = 0.45, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })

/** Chunky blue toy RC car with a small green critter driver, built from bevelled primitives. */
export class CarModel {
  readonly root = new THREE.Group()
  private body = new THREE.Group()
  private wheels: THREE.Group[] = []
  private frontPivots: THREE.Group[] = []
  private antenna = new THREE.Group()
  private critterHead = new THREE.Group()
  private spinAngle = 0
  private wheelRot = 0
  private bounce = 0
  private bounceV = 0
  private squash = 0
  private squashV = 0
  private antX = 0
  private antXV = 0
  private antZ = 0
  private antZV = 0
  private prevVLat = 0
  private prevSpeed = 0
  private roll = 0
  private pitch = 0
  readonly shadow: THREE.Mesh

  constructor() {
    const blue = mat(0x1f6fe0, 0.28, 0.1)
    const white = mat(0xf6f6f6, 0.4)
    const chrome = mat(0xdfe6ee, 0.15, 1)
    const tyre = mat(0x1b1b1f, 0.9)
    const red = mat(0xe5252a, 0.5)
    const green = mat(0x58c84a, 0.6)
    const dark = mat(0x222831, 0.5)

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const o = new THREE.Mesh(g, m)
      o.position.set(x, y, z)
      o.castShadow = true
      return o
    }

    // chassis
    this.body.add(mesh(new RoundedBoxGeometry(1.35, 0.5, 2.3, 2, 0.14), blue, 0, 0.62, 0))
    this.body.add(mesh(new RoundedBoxGeometry(1.0, 0.3, 1.0, 2, 0.12), blue, 0, 0.95, 0.35))
    // racing stripes
    this.body.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 2.2), white, -0.2, 0.89, -0.02))
    this.body.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 2.2), white, 0.2, 0.89, -0.02))
    // chrome bumper
    this.body.add(mesh(new RoundedBoxGeometry(1.5, 0.16, 0.2, 2, 0.07), chrome, 0, 0.5, -1.2))
    this.body.add(mesh(new RoundedBoxGeometry(1.5, 0.16, 0.2, 2, 0.07), chrome, 0, 0.5, 1.2))
    // headlights
    for (const sx of [-0.45, 0.45]) {
      const l = mesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0xfff2b0,
          emissive: 0xffe9a0,
          emissiveIntensity: 1.2,
        }),
        sx,
        0.68,
        -1.15,
      )
      this.body.add(l)
    }
    // spoiler
    this.body.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.32), red, 0, 1.12, 1.0))
    for (const sx of [-0.5, 0.5])
      this.body.add(mesh(new THREE.BoxGeometry(0.08, 0.3, 0.1), dark, sx, 0.95, 1.0))
    // cockpit and critter
    this.body.add(mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.2, 10), dark, 0, 1.12, 0.35))
    this.critterHead.position.set(0, 1.45, 0.35)
    this.critterHead.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), green))
    for (const sx of [-0.13, 0.13]) {
      this.critterHead.add(
        mesh(
          new THREE.SphereGeometry(0.1, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff }),
          sx,
          0.07,
          -0.22,
        ),
      )
      this.critterHead.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), dark, sx, 0.07, -0.31))
      this.critterHead.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 6), green, sx * 2.1, 0.3, 0.02))
    }
    const helmet = mesh(
      new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      red,
      0,
      0.04,
      0,
    )
    this.critterHead.add(helmet)
    this.body.add(this.critterHead)
    // antenna with red tip
    this.antenna.position.set(0.5, 0.9, 1.0)
    this.antenna.add(mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.4, 5), dark, 0, 0.7, 0))
    this.antenna.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), red, 0, 1.42, 0))
    this.antenna.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), red, 0, 1.3, 0))
    this.body.add(this.antenna)

    this.root.add(this.body)
    this.root.scale.setScalar(CAR_SCALE)

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.38, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8)
    hubGeo.rotateZ(Math.PI / 2)
    const spokeGeo = new THREE.BoxGeometry(0.42, 0.06, 0.34)
    const pos: [number, number, number][] = [
      [-0.78, 0.4, -0.82],
      [0.78, 0.4, -0.82],
      [-0.78, 0.4, 0.85],
      [0.78, 0.4, 0.85],
    ]
    pos.forEach((p, i) => {
      const pivot = new THREE.Group()
      pivot.position.set(p[0], p[1], p[2])
      const w = new THREE.Group()
      w.add(mesh(wheelGeo, tyre))
      w.add(mesh(hubGeo, chrome))
      w.add(mesh(spokeGeo, white))
      pivot.add(w)
      this.root.add(pivot)
      this.wheels.push(w)
      if (i < 2) this.frontPivots.push(pivot)
    })

    // contact shadow blob (lives in the scene, not under the body)
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    if (g) {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
      grad.addColorStop(0, 'rgba(0,0,0,0.75)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
    }
    const tex = new THREE.CanvasTexture(c)
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6 * CAR_SCALE * 1.3, 3.4 * CAR_SCALE * 1.3),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.renderOrder = 2
  }

  /** Applies a landing/ground impact to the suspension. */
  impact(strength: number): void {
    this.bounceV -= Math.min(6, strength * 0.35)
    this.squashV += Math.min(4, strength * 0.3)
  }

  /**
   * @param pos world position of the car
   * @param heading world yaw (radians, three.js rotation.y)
   * @param groundY ground height under the car, for the contact shadow
   */
  update(dt: number, car: CarState, pos: THREE.Vector3, heading: number, groundY: number): void {
    // spin out
    if (car.spinT > 0) this.spinAngle += dt * 14
    else
      this.spinAngle +=
        (Math.round(this.spinAngle / (Math.PI * 2)) * Math.PI * 2 - this.spinAngle) *
        Math.min(1, dt * 12)

    this.root.position.copy(pos)
    this.root.rotation.set(0, heading + this.spinAngle, 0)

    // suspension spring
    const k = 160
    const c = 11
    const bumpy = car.grounded
      ? Math.sin(performance.now() * 0.03 + car.s) * 0.004 * (car.speed / 20)
      : 0
    this.bounceV += (-k * this.bounce - c * this.bounceV) * dt
    this.bounce += this.bounceV * dt
    this.squashV += (-220 * this.squash - 14 * this.squashV) * dt
    this.squash += this.squashV * dt

    const latAcc = (car.vLat - this.prevVLat) / Math.max(dt, 1e-4)
    this.prevVLat = car.vLat
    const longAcc = (car.speed - this.prevSpeed) / Math.max(dt, 1e-4)
    this.prevSpeed = car.speed
    const rollT =
      THREE.MathUtils.clamp(-car.vLat * 0.022, -0.3, 0.3) +
      car.wall * -0.35 * (car.wall !== 0 ? 1 : 0)
    this.roll += (rollT - this.roll) * Math.min(1, dt * 9)
    const pitchT = car.grounded
      ? THREE.MathUtils.clamp(-longAcc * 0.004, -0.12, 0.12)
      : THREE.MathUtils.clamp(-car.vy * 0.025, -0.4, 0.4)
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 8)

    this.body.position.y = this.bounce + bumpy
    this.body.rotation.z = this.roll
    this.body.rotation.x = this.pitch
    this.body.scale.set(1 + this.squash * 0.25, 1 - this.squash * 0.35, 1 + this.squash * 0.25)
    this.critterHead.rotation.y = THREE.MathUtils.clamp(-car.vLat * 0.05, -0.5, 0.5)
    this.critterHead.rotation.z = THREE.MathUtils.clamp(latAcc * 0.002, -0.3, 0.3)

    // wheels
    this.wheelRot += (car.speed / 0.4) * dt
    const steerAngle = THREE.MathUtils.clamp(car.vLat * 0.05, -0.5, 0.5)
    for (const w of this.wheels) w.rotation.x = this.wheelRot
    for (const p of this.frontPivots) p.rotation.y = -steerAngle

    // whipping antenna (damped spring driven by accelerations)
    this.antXV += (-90 * this.antX - 5 * this.antXV + latAcc * 0.02) * dt
    this.antX += this.antXV * dt
    this.antZV += (-90 * this.antZ - 5 * this.antZV + longAcc * 0.02) * dt
    this.antZ += this.antZV * dt
    this.antenna.rotation.z = THREE.MathUtils.clamp(this.antX, -0.9, 0.9)
    this.antenna.rotation.x = THREE.MathUtils.clamp(this.antZ - 0.12, -0.9, 0.9)

    // contact shadow scales and fades with height
    const h = Math.max(0, pos.y - groundY)
    this.shadow.position.set(pos.x, groundY + 0.03, pos.z)
    this.shadow.rotation.z = -(heading + this.spinAngle)
    const sc = Math.max(0.35, 1 - h * 0.14)
    this.shadow.scale.set(sc, sc, 1)
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.9 - h * 0.12)
  }
}
