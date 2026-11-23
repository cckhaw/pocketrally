import type { InputMode, Settings } from './save'

type Source = 'touch' | 'mouse' | 'keyboard' | 'gamepad' | 'tilt'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Unified steering input: touch drag/zones, tilt, mouse drag, keyboard and gamepad. */
export class Input {
  steer = 0
  brake = false
  /** Last device that produced input; shown in settings and used to pick on-screen hints. */
  lastDevice: Source = 'keyboard'
  enabled = false
  onPause: () => void = () => {}
  onDevice: (d: Source) => void = () => {}

  private settings: () => Settings
  private keys = new Set<string>()
  private pointers = new Map<number, { x0: number; x: number; type: string }>()
  private tiltValue = 0
  private tiltActive = false
  private target = 0
  private lastPad = false

  constructor(settings: () => Settings) {
    this.settings = settings
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    window.addEventListener('blur', this.reset)
    window.addEventListener('deviceorientation', this.onTilt)
  }

  reset = (): void => {
    this.keys.clear()
    this.pointers.clear()
    this.steer = 0
    this.target = 0
    this.brake = false
  }

  private allowed(src: Source): boolean {
    const m: InputMode = this.settings().inputMode
    if (m === 'auto') return src !== 'tilt'
    return m === src
  }

  private setDevice(d: Source): void {
    if (this.lastDevice !== d) {
      this.lastDevice = d
      this.onDevice(d)
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) this.onPause()
      return
    }
    if (!this.enabled) return
    this.keys.add(e.code)
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault()
    }
    this.setDevice('keyboard')
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  private ignoreTarget(t: EventTarget | null): boolean {
    return t instanceof Element && !!t.closest('button, a, input, select, label, [data-ui]')
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.ignoreTarget(e.target)) return
    const type = e.pointerType === 'mouse' ? 'mouse' : 'touch'
    if (type === 'mouse' && e.button !== 0) return
    this.pointers.set(e.pointerId, { x0: e.clientX, x: e.clientX, type })
    this.setDevice(type)
  }

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    const range = this.dragRange(p.type)
    // Re-anchor so a long drag keeps working in both directions.
    if (Math.abs(p.x - p.x0) > range * 1.4) p.x0 = p.x - Math.sign(p.x - p.x0) * range * 1.4
  }

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
  }

  private dragRange(type: string): number {
    const base =
      type === 'mouse'
        ? window.innerWidth * 0.1
        : Math.min(window.innerWidth, window.innerHeight) * 0.16
    return Math.max(40, base / Math.max(0.3, this.settings().sensitivity))
  }

  private onTilt = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null && e.beta === null) return
    const angle = (screen.orientation && screen.orientation.angle) || 0
    let v: number
    if (angle === 90) v = e.beta ?? 0
    else if (angle === 270 || angle === -90) v = -(e.beta ?? 0)
    else v = e.gamma ?? 0
    this.tiltValue = clamp(v / 22, -1, 1)
    this.tiltActive = true
  }

  /** iOS requires an explicit permission request from a user gesture. */
  async requestTilt(): Promise<boolean> {
    type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
    const doe = (window as unknown as { DeviceOrientationEvent?: DOE }).DeviceOrientationEvent
    if (!doe) return false
    if (typeof doe.requestPermission === 'function') {
      try {
        return (await doe.requestPermission()) === 'granted'
      } catch {
        return false
      }
    }
    return true
  }

  update(dt: number): void {
    if (!this.enabled) {
      this.steer = 0
      this.brake = false
      return
    }
    const s = this.settings()
    let target = 0
    let brake = false

    if (this.allowed('keyboard')) {
      const l = this.keys.has('ArrowLeft') || this.keys.has('KeyA')
      const r = this.keys.has('ArrowRight') || this.keys.has('KeyD')
      const k = (r ? 1 : 0) - (l ? 1 : 0)
      if (k !== 0) target = k
      if (this.keys.has('Space') || this.keys.has('ArrowDown') || this.keys.has('KeyS'))
        brake = true
    }

    if (this.allowed('touch') || this.allowed('mouse')) {
      let n = 0
      for (const p of this.pointers.values()) {
        if (!this.allowed(p.type as Source)) continue
        n++
        if (n === 2) {
          brake = true
          continue
        }
        if (n > 2) continue
        if (p.type === 'touch' && s.touchStyle === 'zones') {
          target = p.x < window.innerWidth / 2 ? -1 : 1
        } else {
          target = clamp((p.x - p.x0) / this.dragRange(p.type), -1, 1)
        }
      }
    }

    if (this.allowed('tilt') && this.tiltActive) {
      target = clamp(this.tiltValue * s.sensitivity, -1, 1)
      this.setDevice('tilt')
    }

    if (this.allowed('gamepad')) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      for (const pad of pads) {
        if (!pad) continue
        let ax = pad.axes[0] ?? 0
        if (Math.abs(ax) < 0.15) ax = 0
        const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
        const v = dpad !== 0 ? dpad : ax
        if (v !== 0) {
          target = v
          this.setDevice('gamepad')
        }
        if (pad.buttons[0]?.pressed || pad.buttons[6]?.pressed || pad.buttons[7]?.pressed)
          brake = true
        const start = !!pad.buttons[9]?.pressed
        if (start && !this.lastPad) this.onPause()
        this.lastPad = start
      }
    }

    this.target = target
    const rate = Math.abs(target) > Math.abs(this.steer) ? 16 : 22
    this.steer += (this.target - this.steer) * (1 - Math.exp(-rate * dt))
    if (Math.abs(this.steer) < 0.001) this.steer = 0
    this.brake = brake
  }

  /** Visible while a touch/mouse drag is active (used by the HUD steering hint). */
  get dragging(): boolean {
    return this.pointers.size > 0
  }
}
