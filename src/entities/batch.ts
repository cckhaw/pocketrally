import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

export interface Xform {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  sx?: number
  sy?: number
  sz?: number
}

export const CHUNK = 90

/**
 * Collects many small primitives, bakes them into vertex-coloured geometry and merges them per
 * spatial chunk. Keeps draw calls low while frustum culling still works.
 */
export class Batch {
  private chunks = new Map<number, THREE.BufferGeometry[]>()
  triangles = 0

  matrix(t: Xform): THREE.Matrix4 {
    tmpE.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ')
    tmpQ.setFromEuler(tmpE)
    tmpP.set(t.x ?? 0, t.y ?? 0, t.z ?? 0)
    tmpS.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1)
    return tmpM.compose(tmpP, tmpQ, tmpS)
  }

  /** Adds a geometry with a flat colour. Chunk is picked from world z/x via `chunk`. */
  add(geo: THREE.BufferGeometry, color: number, t: Xform, chunk: number): this {
    return this.addMatrix(geo, color, this.matrix(t), chunk)
  }

  addMatrix(geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4, chunk: number): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    g.applyMatrix4(m)
    this.paint(g, color)
    this.push(g, chunk)
    return this
  }

  /** Adds an already-positioned geometry (position+normal) painting it with `color` (negative = keep its own colours). */
  addRaw(g: THREE.BufferGeometry, color: number, chunk: number): this {
    if (color >= 0) this.paint(g, color)
    this.push(g, chunk)
    return this
  }

  private paint(g: THREE.BufferGeometry, color: number): void {
    tmpC.setHex(color)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmpC.r
      arr[i * 3 + 1] = tmpC.g
      arr[i * 3 + 2] = tmpC.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  }

  private push(g: THREE.BufferGeometry, chunk: number): void {
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name)
    }
    this.triangles += g.getAttribute('position').count / 3
    let list = this.chunks.get(chunk)
    if (!list) this.chunks.set(chunk, (list = []))
    list.push(g)
  }

  build(material: THREE.Material, shadows = true): THREE.Group {
    const group = new THREE.Group()
    for (const [, list] of this.chunks) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = shadows
      mesh.receiveShadow = shadows
      group.add(mesh)
      for (const g of list) g.dispose()
    }
    this.chunks.clear()
    return group
  }
}

/** Shared unit primitives; callers scale them through the Xform. */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  lowSphere: new THREE.SphereGeometry(1, 7, 5),
  torus: new THREE.TorusGeometry(1, 0.2, 6, 14),
}
