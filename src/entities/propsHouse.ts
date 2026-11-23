import * as THREE from 'three'
import type { LevelConfig } from '../levels/types'
import type { PropCtx } from './propCtx'

const BOOKS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22]

export function houseProp(c: PropCtx, kind: string, v: number, _level: LevelConfig): boolean {
  switch (kind) {
    case 'sneakerS':
      c.box(0xf4f4f4, 2.8, 0.6, 6, 0, 0.3, 0)
      c.sphere(v % 2 ? 0x2a6fd6 : 0xd8362c, 1.5, 0, 1.3, 0.8, 1, 0.8, 1.7)
      c.sphere(0xffffff, 1.1, 0, 1.0, -1.9, 1.15, 0.7, 1)
      c.box(0x2a2a2a, 2.4, 2, 1.4, 0, 1.8, 2.4)
      c.blocker(0, 1.5, 0, 3, 3, 6)
      return true
    case 'guitarAS':
    case 'guitarES': {
      const e = kind === 'guitarES'
      const body = e ? 0xc4161c : 0xc9843a
      c.sphere(body, 2.0, 0, 0.6, 2, 1, 0.3, 1.1)
      c.sphere(body, 1.5, 0, 0.6, -0.4, 1, 0.3, 1)
      c.box(0x5a3a1a, 0.7, 0.25, 6.4, 0, 0.9, -4.6)
      c.box(0x1a1a1a, 0.9, 0.3, 1.1, 0, 1.0, -8.3)
      return true
    }
    case 'ballS':
      c.sphere(0xe36a1a, 3, 0, 3, 0)
      c.cyl(0x1a1a1a, 3.02, 0.15, 0, 3, 0, Math.PI / 2, 0)
      c.cyl(0x1a1a1a, 3.02, 0.15, 0, 3, 0, 0, Math.PI / 2)
      c.blocker(0, 3, 0, 6, 6, 6)
      return true
    case 'cable':
      for (let i = 0; i < 12; i++) {
        c.box(
          0x16161a,
          0.5,
          0.45,
          1.6,
          Math.sin(i * 0.7) * 2.4,
          0.22,
          i * 1.3 - 8,
          Math.cos(i * 0.7) * 0.5,
        )
      }
      c.box(0xdddddd, 1, 0.8, 1.4, 0, 0.4, 8.5)
      return true
    case 'mouseHole': {
      const hw = 9.5
      c.box(0xe8dcc2, 22, 20, 1.5, -hw - 11, 10, 0)
      c.box(0xe8dcc2, 22, 20, 1.5, hw + 11, 10, 0)
      c.box(0xe8dcc2, hw * 2 + 2, 11, 1.5, 0, 14.5, 0)
      c.box(0x6a4a2a, 22, 1.2, 1.9, -hw - 11, 0.6, 0)
      c.box(0x6a4a2a, 22, 1.2, 1.9, hw + 11, 0.6, 0)
      // round arch top
      for (let k = 0; k < 9; k++) {
        const a = (k / 8) * Math.PI
        c.box(0x4a3a2a, 1.6, 1.6, 1.7, -Math.cos(a) * (hw + 0.5), 8.4 + Math.sin(a) * 1.4, 0.05)
      }
      c.box(0x1a1410, hw * 2, 8, 0.2, 0, 4, 0.9)
      return true
    }
    case 'stairs':
      for (let i = 0; i < 6; i++) {
        c.box(i % 2 ? 0xb58a5a : 0xc29767, 14, 2.4, 5, 0, 1.2 + i * 2.4, i * -5)
        c.box(0x7a2a2a, 8, 0.12, 5, 0, 2.45 + i * 2.4, i * -5)
      }
      c.blocker(0, 8, -12, 14, 16, 30)
      return true
    case 'frame': {
      c.box(0xefe6d0, 1, 22, 26, 0, 11, 0)
      c.box(0x6b4423, 1.4, 9, 7, 0.1, 13, -5)
      c.box(BOOKS[v % 6], 1.5, 7.4, 5.4, 0.2, 13, -5)
      c.box(0x6b4423, 1.4, 6, 9, 0.1, 12, 6)
      c.box(BOOKS[(v + 2) % 6], 1.5, 4.6, 7.6, 0.2, 12, 6)
      c.box(0x6b4423, 1.0, 1.2, 26, 0.1, 0.6, 0)
      return true
    }
    case 'cereal': {
      for (let i = 0; i < 22; i++) {
        const a = i * 2.39
        const r = 0.5 + (i % 7) * 0.45
        c.add(CEREAL, [0xf2c14e, 0xe89a2a, 0xf7d98a][i % 3], {
          x: Math.cos(a) * r * 1.6,
          y: 0.2,
          z: Math.sin(a) * r * 1.6,
          sx: 0.75,
          sy: 0.75,
          sz: 0.75,
          rx: Math.PI / 2,
        })
      }
      c.cyl(0xf4f1e6, 4.2, 0.06, 0, 0.05, 0)
      c.cyl(0xffffff, 2.6, 0.08, 0.8, 0.07, 0.4)
      return true
    }
    case 'sofa':
      c.box(0x3a6ea5, 16, 4, 9, 0, 2, 0)
      c.box(0x35669b, 16, 8, 2, 0, 5.5, 4)
      c.box(0x2f5c8f, 2.2, 6, 9, -9, 3, 0)
      c.box(0x2f5c8f, 2.2, 6, 9, 9, 3, 0)
      c.box(0x4a7ab5, 6.5, 1.4, 7, -3.5, 4.5, -0.2)
      c.box(0x4a7ab5, 6.5, 1.4, 7, 3.5, 4.5, -0.2)
      c.blocker(0, 4, 0, 16, 8, 9)
      return true
    case 'shelf':
      c.box(0x7a5230, 12, 26, 4, 0, 13, 0)
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 8; k++)
          c.box(BOOKS[(r + k) % 6], 1.0, 3.6, 3, -5 + k * 1.3, 3 + r * 5, 0.8)
      }
      c.blocker(0, 13, 0, 12, 26, 4)
      return true
    case 'lamp':
      c.cyl(0x333333, 1.8, 0.5, 0, 0.25, 0)
      c.cyl(0x555555, 0.35, 15, 0, 7.5, 0)
      c.cone(0xf1e2a8, 3.2, 3.6, 0, 16.4, 0)
      return true
    case 'rug':
      c.box(0x8a3a3a, 30, 0.08, 24, 0, 0.05, 0)
      c.box(0xd9c28a, 26, 0.1, 20, 0, 0.07, 0)
      c.box(0x8a3a3a, 22, 0.12, 16, 0, 0.09, 0)
      return true
    default:
      return false
  }
}

const CEREAL = new THREE.TorusGeometry(0.5, 0.2, 5, 8)
