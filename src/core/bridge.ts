/** postMessage bridge to the Arcade portal (games.khaw.cc). Inbound messages are origin-checked. */
const PORTAL_ORIGIN = 'https://games.khaw.cc'

export class Bridge {
  onPause: () => void = () => {}
  onResume: () => void = () => {}
  readonly embedded: boolean

  constructor() {
    this.embedded = window.parent !== window
    window.addEventListener('message', this.onMessage)
  }

  private onMessage = (e: MessageEvent): void => {
    if (e.origin !== PORTAL_ORIGIN) return
    const d = e.data as { type?: unknown } | null
    if (!d || typeof d.type !== 'string') return
    if (d.type === 'pocket-rally:pause') this.onPause()
    else if (d.type === 'pocket-rally:resume') this.onResume()
  }

  private post(msg: Record<string, unknown>): void {
    if (!this.embedded) return
    try {
      window.parent.postMessage(msg, PORTAL_ORIGIN)
    } catch {
      /* parent unreachable */
    }
  }

  ready(): void {
    this.post({ type: 'pocket-rally:ready' })
  }

  score(levelId: string, timeMs: number): void {
    this.post({ type: 'pocket-rally:score', levelId, timeMs })
  }
}
