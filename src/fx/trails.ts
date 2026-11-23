import * as THREE from 'three'

/** Fading tyre-track ribbon: fixed-size buffer, shifted in place (no allocation per frame). */
export class Trail {
  readonly mesh: THREE.Mesh
  private n: number
  private pos: Float32Array
  private col: Float32Array
  private ages: Float32Array
  private geo: THREE.BufferGeometry
  private lastX = 0
  private lastZ = 0
  private has = false
  private acc = 0
  active = false
  private width: number

  constructor(points = 90, width = 0.26) {
    this.n = points
    this.width = width
    this.pos = new Float32Array(points * 2 * 3)
    this.col = new Float32Array(points * 2 * 4)
    this.ages = new Float32Array(points)
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.geo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage),
    )
    const idx: number[] = []
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo.setIndex(idx)
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.clear()
  }

  clear(): void {
    this.pos.fill(0)
    this.col.fill(0)
    this.ages.fill(99)
    this.has = false
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.color.needsUpdate = true
  }

  /** Feed the wheel contact point and the car's right vector. */
  push(dt: number, x: number, y: number, z: number, rx: number, rz: number): void {
    this.acc += dt
    const moved = this.has ? Math.hypot(x - this.lastX, z - this.lastZ) : 0
    const emit = this.active && (!this.has || moved > 0.35)
    if (emit) {
      // shift everything one slot
      this.pos.copyWithin(6, 0, (this.n - 1) * 6)
      this.ages.copyWithin(1, 0, this.n - 1)
      const hw = this.width / 2
      this.pos[0] = x - rx * hw
      this.pos[1] = y + 0.04
      this.pos[2] = z - rz * hw
      this.pos[3] = x + rx * hw
      this.pos[4] = y + 0.04
      this.pos[5] = z + rz * hw
      this.ages[0] = 0
      // a fresh stroke: collapse the link to the previous stroke so no streak is drawn
      if (!this.has) this.pos.copyWithin(6, 0, 6)
      this.lastX = x
      this.lastZ = z
      this.has = true
    } else if (!this.active) {
      this.has = false
    }
    for (let i = 0; i < this.n; i++) {
      this.ages[i] += dt
      const a = Math.max(0, 0.38 - this.ages[i] * 0.12)
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 4
        this.col[o] = 0.08
        this.col[o + 1] = 0.07
        this.col[o + 2] = 0.06
        this.col[o + 3] = a
      }
    }
    // collapse stale / disconnected segments to avoid long streaks when re-activating
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.color.needsUpdate = true
  }
}
