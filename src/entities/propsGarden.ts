import type { PropCtx } from './propCtx'

const GREENS = [0x5fa83a, 0x4f9a33, 0x6dbb45]
const ONION = [0xd9a441, 0xc98a3a, 0xa7508a]

export function gardenProp(c: PropCtx, kind: string, v: number): boolean {
  switch (kind) {
    case 'onion': {
      const col = ONION[v % 3]
      c.sphere(col, 3.2, 0, 2.6, 0, 1, 0.9, 1)
      c.cone(col, 1.4, 3.2, 0, 5.6, 0)
      c.sphere(0xe9d7a0, 0.9, 0, 0.3, 0, 1.6, 0.4, 1.6)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + v
        c.cyl(GREENS[i % 3], 0.35, 11, Math.cos(a) * 0.9, 10, Math.sin(a) * 0.9, Math.sin(a) * 0.25, -Math.cos(a) * 0.25)
      }
      c.blocker(0, 3, 0, 6, 6, 6)
      return true
    }
    case 'stalk': {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + v
        c.cyl(GREENS[i], 0.7, 20, Math.cos(a) * 1.1, 10, Math.sin(a) * 1.1)
      }
      // overhead leaf blades arching toward the track
      for (let i = 0; i < 3; i++) {
        c.box(GREENS[(i + 1) % 3], 10, 0.15, 3, -4, 17 - i * 1.5, i - 1, 0, 0, 0.25 + i * 0.1)
      }
      return true
    }
    case 'post': {
      c.box(0x8b6b45, 3, 15, 3, 0, 7.5, 0)
      c.box(0x7a5a38, 3.4, 0.5, 3.4, 0, 15.2, 0)
      c.box(0x6a4c30, 0.3, 0.3, 3.2, 1.51, 9, 0)
      c.sphere(0x555555, 0.18, 1.55, 6, 0.8)
      c.sphere(0x555555, 0.18, 1.55, 6, -0.8)
      c.blocker(0, 7.5, 0, 3, 15, 3)
      return true
    }
    case 'worm': {
      const n = 14
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        const x = (t - 0.5) * 14
        const y = 0.9 + Math.sin(t * Math.PI * 3) * 0.7
        c.sphere(i % 3 === 0 ? 0xe0a0a0 : 0xd98a8a, 1.0 - 0.25 * Math.abs(t - 0.5), x, y, 0)
      }
      c.sphere(0xcf7a7a, 0.9, 7.4, 1.1, 0)
      c.sphere(0x222222, 0.15, 8.1, 1.5, -0.35)
      c.sphere(0x222222, 0.15, 8.1, 1.5, 0.35)
      return true
    }
    case 'twigArch': {
      const hw = 9
      for (const side of [-1, 1]) {
        c.cyl(0x6b4a2a, 0.45, 9, side * hw, 4.4, 0, 0, side * 0.12)
        c.cyl(0x7a5732, 0.3, 4, side * (hw - 1.2), 9, 0, 0, side * 1.2)
      }
      c.cyl(0x7a5732, 0.3, hw * 2 - 2, 0, 9.8, 0, 0, Math.PI / 2)
      c.cyl(0x6b4a2a, 0.15, 3, -3, 10.5, 0, 0, 0.5)
      c.sphere(0x5fa83a, 0.6, 3, 10.4, 0.2)
      c.sphere(0x4f9a33, 0.5, -4, 10.3, -0.2)
      return true
    }
    case 'picket': {
      for (let i = 0; i < 9; i++) {
        c.box(0xf2eee0, 1.4, 7, 0.4, i * 2.2 - 9, 3.5, 0)
        c.cone(0xf2eee0, 0.7, 1.2, i * 2.2 - 9, 7.4, 0)
      }
      c.box(0xe2ddcc, 20, 0.6, 0.3, 0, 2, -0.3)
      c.box(0xe2ddcc, 20, 0.6, 0.3, 0, 5.2, -0.3)
      return true
    }
    case 'pebble':
      c.sphere(0x8a8680, 1.2, 0, 0.5, 0, 1.2, 0.55, 1)
      return true
    case 'leaf':
      c.box(GREENS[v % 3], 6, 0.12, 3.2, 0, 0.9, 0, 0, 0, 0.12)
      c.box(0x3f7a2a, 6, 0.14, 0.2, 0, 0.95, 0, 0, 0, 0.12)
      return true
    case 'flower': {
      c.cyl(0x4f9a33, 0.18, 7, 0, 3.5, 0)
      const pc = [0xff6b9a, 0xffd23f, 0xffffff][v % 3]
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        c.sphere(pc, 0.9, Math.cos(a) * 1.3, 7.3, Math.sin(a) * 1.3, 1, 0.35, 1)
      }
      c.sphere(0xf0a020, 0.8, 0, 7.5, 0, 1, 0.6, 1)
      return true
    }
    default:
      return false
  }
}
