import * as THREE from 'three'

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // fade out particles that get very close to the camera so they never fill the screen
  vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.8, 3.0, -mv.z));
  gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 120.0);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Pooled point particles: one draw call, zero allocations after construction. */
export class Particles {
  readonly points: THREE.Points
  private max: number
  private pos: Float32Array
  private col: Float32Array
  private size: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private baseSize: Float32Array
  private grav: Float32Array
  private cursor = 0
  /** 0..1 multiplier from the quality preset. */
  scale = 1
  private geo: THREE.BufferGeometry
  private uniforms = { uScale: { value: 400 } }

  constructor(max = 600) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 4)
    this.size = new Float32Array(max)
    this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.baseSize = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.geo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage),
    )
    this.geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    )
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  setViewportHeight(h: number, fov: number): void {
    this.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360))
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    r: number,
    g: number,
    b: number,
    a = 1,
    gravity = 0,
  ): void {
    if (this.scale < 1 && Math.random() > this.scale) return
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.max
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.life[i] = life
    this.maxLife[i] = life
    this.baseSize[i] = size
    this.grav[i] = gravity
    this.col[i * 4] = r
    this.col[i * 4 + 1] = g
    this.col[i * 4 + 2] = b
    this.col[i * 4 + 3] = a
    this.size[i] = size
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      const l = this.life[i]
      if (l <= 0) {
        this.size[i] = 0
        continue
      }
      this.life[i] = l - dt
      const f = this.life[i] / this.maxLife[i]
      this.vel[i * 3 + 1] -= this.grav[i] * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.vel[i * 3] *= 1 - dt * 1.5
      this.vel[i * 3 + 2] *= 1 - dt * 1.5
      this.size[i] = this.baseSize[i] * (0.6 + 0.8 * (1 - f))
      this.col[i * 4 + 3] = Math.max(0, f) * 0.8
      if (this.life[i] <= 0) this.size[i] = 0
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aColor.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
  }

  clear(): void {
    this.life.fill(0)
    this.size.fill(0)
  }
}
