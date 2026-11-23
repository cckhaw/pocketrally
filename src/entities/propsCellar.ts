import * as THREE from 'three'
import { Mini } from './hazardModels'
import type { PropCtx } from './propCtx'

const WOOD = [0x8a5a2b, 0x7a4c22, 0x9a6a38]
const GLASS = [0x2f8f4a, 0x6b3a1a, 0x1f5f9a]

export function cellarProp(c: PropCtx, kind: string, v: number): boolean {
  switch (kind) {
    case 'corkS':
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + v
        c.cyl(
          0xc99a5a,
          1.0,
          1.8,
          Math.cos(a) * 1.2 * i * 0.6,
          0.9,
          Math.sin(a) * 1.2 * i * 0.6,
          0,
          (i % 2) * 1.4,
        )
      }
      return true
    case 'cap':
      c.cyl([0xd33a2c, 0xe8c030, 0x3a7ad3, 0x888888][v % 4], 1.2, 0.3, 0, 0.15, 0)
      c.cyl(0xdddddd, 0.95, 0.34, 0, 0.17, 0)
      return true
    case 'barrel': {
      c.cyl(WOOD[v % 3], 2.3, 5, 0, 2.5, 0)
      c.cyl(WOOD[v % 3], 2.6, 2.6, 0, 2.5, 0)
      for (const y of [0.7, 2.5, 4.3]) c.cyl(0x2f2f33, 2.45 + (y === 2.5 ? 0.35 : 0), 0.25, 0, y, 0)
      c.cyl(0x6a4420, 2.2, 0.15, 0, 5.05, 0)
      c.blocker(0, 2.5, 0, 5, 5, 5)
      return true
    }
    case 'tank': {
      c.cyl(0x9aa6b2, 5, 16, 0, 8, 0)
      c.sphere(0xaab6c2, 5, 0, 16, 0, 1, 0.5, 1)
      for (const y of [3, 8, 13]) c.cyl(0x6b7580, 5.15, 0.4, 0, y, 0)
      c.cyl(0x7b8590, 0.9, 6, 4.8, 4, 0, 0, 0)
      c.sphere(0xd33a2c, 0.7, 4.9, 9, 0)
      c.blocker(0, 8, 0, 10, 16, 10)
      return true
    }
    case 'pipe': {
      c.cyl(0xb06a2a, 0.7, 40, 0, 9, 0, Math.PI / 2, 0)
      for (let i = -3; i <= 3; i++) c.cyl(0x6e4018, 0.95, 0.5, 0, 9, i * 6, Math.PI / 2, 0)
      c.cyl(0x555a62, 0.2, 9, 0, 4.5, 6)
      c.cyl(0x555a62, 0.2, 9, 0, 4.5, -6)
      return true
    }
    case 'crate':
      c.box(0x9a6a3a, 3.4, 3.4, 3.4, 0, 1.7, 0)
      c.box(0x6b4423, 3.5, 0.3, 3.5, 0, 0.3, 0)
      c.box(0x6b4423, 3.5, 0.3, 3.5, 0, 3.1, 0)
      c.box(0x6b4423, 0.3, 3.5, 3.5, 1.7, 1.7, 0)
      c.blocker(0, 1.7, 0, 3.4, 3.4, 3.4)
      return true
    case 'bottle':
      c.cyl(GLASS[v % 3], 1.3, 5, 0, 2.5, 0, Math.PI / 2, 0)
      c.cyl(GLASS[v % 3], 0.5, 2.2, 3.6, 2.5, 0, Math.PI / 2, 0)
      c.cyl(0xe8e0c8, 1.34, 2, 0, 2.5, 0, Math.PI / 2, 0)
      return true
    case 'puddle':
      c.cyl(0x2b4a5a, 3, 0.05, 0, 0.04, 0)
      return true
    case 'lantern':
      c.cyl(0x333333, 0.1, 6, 0, 13, 0)
      c.box(0x3a2a1a, 1.4, 1.8, 1.4, 0, 9.4, 0)
      c.sphere(0xffd890, 0.7, 0, 9.4, 0)
      return true
    case 'wall':
      c.box(0x5a4638, 1, 24, 30, 0, 12, 0)
      for (let i = 0; i < 12; i++)
        c.box(i % 2 ? 0x6a5242 : 0x4f3d30, 0.3, 2.2, 5, 0.6, 1.1 + (i % 6) * 4, (i % 5) * 5.5 - 11)
      return true
    case 'hatch': {
      // round hatch window in the wall with a cat peering in
      c.box(0x5a4638, 1.4, 26, 30, 0, 13, 0)
      c.add(new THREE.TorusGeometry(1, 0.1, 6, 22), 0x7a8088, {
        x: 0.8,
        y: 9,
        ry: Math.PI / 2,
        sx: 6.5,
        sy: 6.5,
        sz: 6.5,
      })
      c.add(new THREE.CircleGeometry(1, 20), 0x15202a, {
        x: 0.78,
        y: 9,
        ry: Math.PI / 2,
        sx: 6.2,
        sy: 6.2,
        sz: 1,
      })
      const cat = new Mini()
      cat.sphere(0xe58a3a, 2.2, 0, 0, 0, 1.15, 1, 0.8)
      cat.cone(0xe58a3a, 0.8, 1.6, -1.5, 1.9, 0)
      cat.cone(0xe58a3a, 0.8, 1.6, 1.5, 1.9, 0)
      cat.sphere(0xffe27a, 0.6, -0.9, 0.3, -1.6)
      cat.sphere(0xffe27a, 0.6, 0.9, 0.3, -1.6)
      cat.box(0x111111, 0.18, 1.1, 0.2, -0.9, 0.3, -2.1)
      cat.box(0x111111, 0.18, 1.1, 0.2, 0.9, 0.3, -2.1)
      cat.sphere(0xf3a0a0, 0.28, 0, -0.5, -2.1)
      const mesh = cat.mesh()
      const holder = new THREE.Group()
      holder.add(mesh)
      mesh.rotation.y = Math.PI / 2
      holder.applyMatrix4(c.base)
      const base = new THREE.Vector3(1.4, 9, 0)
      holder.position.add(base.applyMatrix4(new THREE.Matrix4().extractRotation(c.base)))
      c.group.add(holder)
      const y0 = holder.position.y
      c.dynamic.push({
        update(t) {
          holder.position.y = y0 + Math.sin(t * 1.3) * 0.5
          mesh.rotation.z = Math.sin(t * 0.9) * 0.12
        },
      })
      return true
    }
    case 'legs': {
      for (let k = 0; k < 2; k++) {
        const x = k * 5 - 2.5
        const pant = [0x2a3a5a, 0x4a3a2a, 0x3a4a3a][(v + k) % 3]
        for (const lx of [-0.9, 0.9]) {
          c.cyl(pant, 1.0, 14, x + lx, 9, 0)
          c.box(0x2a1a10, 1.8, 1.1, 3, x + lx, 0.55, -0.6)
        }
        c.box(0x1a1a1a, 2.6, 0.5, 0.4, x, 14.5, 0)
      }
      return true
    }
    default:
      return false
  }
}
