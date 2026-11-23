import * as THREE from 'three'
import { rng } from '../levels/builder'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('2D canvas unavailable')
  return [c, g]
}

function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
  }
  t.anisotropy = 4
  return t
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')

function shade(n: number, f: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)))
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)))
  return `rgb(${r},${g},${b})`
}

/** Repeating floor texture: noisy dirt, wood planks or stone flags. One tile = 8 world units. */
export function floorTexture(kind: 'dirt' | 'wood' | 'stone', base: number, seed = 1): THREE.CanvasTexture {
  const S = 256
  const [c, g] = canvas(S, S)
  const r = rng(seed)
  g.fillStyle = hex(base)
  g.fillRect(0, 0, S, S)
  if (kind === 'dirt') {
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = shade(base, 0.7 + r() * 0.6)
      const s = 1 + r() * 3
      g.fillRect(r() * S, r() * S, s, s)
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = shade(base, 0.55 + r() * 0.2)
      g.beginPath()
      g.ellipse(r() * S, r() * S, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  } else if (kind === 'wood') {
    const n = 4
    for (let i = 0; i < n; i++) {
      const y = (i * S) / n
      g.fillStyle = shade(base, 0.85 + r() * 0.3)
      g.fillRect(0, y, S, S / n)
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = shade(base, 0.7 + r() * 0.25)
        g.globalAlpha = 0.35
        g.beginPath()
        const yy = y + 2 + r() * (S / n - 4)
        g.moveTo(0, yy)
        g.bezierCurveTo(S * 0.3, yy + (r() - 0.5) * 4, S * 0.6, yy + (r() - 0.5) * 4, S, yy)
        g.stroke()
      }
      g.globalAlpha = 1
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(0, y, S, 2)
      const jx = r() * S
      g.fillRect(jx, y, 2, S / n)
    }
  } else {
    const n = 4
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade(base, 0.85 + r() * 0.3)
        g.fillRect((i * S) / n, (j * S) / n, S / n, S / n)
      }
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 3
    for (let i = 0; i <= n; i++) {
      g.beginPath()
      g.moveTo((i * S) / n, 0)
      g.lineTo((i * S) / n, S)
      g.moveTo(0, (i * S) / n)
      g.lineTo(S, (i * S) / n)
      g.stroke()
    }
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = shade(base, 0.7 + r() * 0.5)
      g.fillRect(r() * S, r() * S, 2, 2)
    }
  }
  return tex(c)
}

/** Yellow-and-black chevrons for boost pads. */
export function chevronTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256)
  g.fillStyle = '#16140f'
  g.fillRect(0, 0, 128, 256)
  g.fillStyle = '#ffd21a'
  for (let i = 0; i < 4; i++) {
    const y = i * 64 + 8
    g.beginPath()
    g.moveTo(8, y + 40)
    g.lineTo(64, y)
    g.lineTo(120, y + 40)
    g.lineTo(120, y + 58)
    g.lineTo(64, y + 18)
    g.lineTo(8, y + 58)
    g.closePath()
    g.fill()
  }
  return tex(c, false)
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64)
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'
      g.fillRect(i * 16, j * 16, 16, 16)
    }
  return tex(c, false)
}

/** Hazard telegraph: ring + diagonal hatching so it reads without colour. */
export function warningTexture(): THREE.CanvasTexture {
  const S = 128
  const [c, g] = canvas(S, S)
  g.clearRect(0, 0, S, S)
  g.save()
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = 'rgba(15,10,10,0.55)'
  g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(255,60,40,0.9)'
  g.lineWidth = 6
  for (let i = -S; i < S * 2; i += 20) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + S, S)
    g.stroke()
  }
  g.restore()
  g.lineWidth = 7
  g.strokeStyle = '#ff3b2a'
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 3
  g.strokeStyle = '#fff'
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2)
  g.stroke()
  return tex(c, false)
}

export function softShadowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64)
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(0,0,0,0.85)')
  grad.addColorStop(0.7, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return tex(c, false)
}

/** Gradient sky used as background and as the environment map source. */
export function skyTexture(top: number, horizon: number, bottom: number): THREE.CanvasTexture {
  const [c, g] = canvas(32, 256)
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, hex(top))
  grad.addColorStop(0.5, hex(horizon))
  grad.addColorStop(0.52, hex(horizon))
  grad.addColorStop(1, hex(bottom))
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.mapping = THREE.EquirectangularReflectionMapping
  return t
}

export function coinTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64)
  g.fillStyle = '#ffcf33'
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = '#b8860b'
  g.lineWidth = 6
  g.beginPath()
  g.arc(32, 32, 24, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#b8860b'
  g.font = 'bold 30px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('R', 32, 34)
  return tex(c, false)
}
