export type QualityLevel = 'low' | 'med' | 'high'

export interface QualityPreset {
  name: QualityLevel
  pixelRatioCap: number
  shadowSize: number
  particleScale: number
  post: boolean
  bloom: boolean
  msaa: number
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    name: 'low',
    pixelRatioCap: 1,
    shadowSize: 512,
    particleScale: 0.35,
    post: false,
    bloom: false,
    msaa: 0,
  },
  med: {
    name: 'med',
    pixelRatioCap: 1.5,
    shadowSize: 1024,
    particleScale: 0.7,
    post: true,
    bloom: true,
    msaa: 0,
  },
  high: {
    name: 'high',
    pixelRatioCap: 2,
    shadowSize: 2048,
    particleScale: 1,
    post: true,
    bloom: true,
    msaa: 4,
  },
}

const ORDER: QualityLevel[] = ['high', 'med', 'low']

/** Auto-downgrade: steps down one preset whenever the average frame time exceeds the budget. */
export class QualityScaler {
  level: QualityLevel
  private window = 0
  private sum = 0
  private cooldown = 0
  readonly budgetMs: number
  readonly windowFrames: number

  constructor(start: QualityLevel = 'high', budgetMs = 20, windowFrames = 90) {
    this.level = start
    this.budgetMs = budgetMs
    this.windowFrames = windowFrames
  }

  /** Feed one frame time in ms. Returns the new level if a downgrade happened. */
  sample(frameMs: number): QualityLevel | null {
    if (this.cooldown > 0) {
      this.cooldown--
      return null
    }
    // ignore hitches from tab switches / loading
    this.sum += Math.min(frameMs, 100)
    this.window++
    if (this.window < this.windowFrames) return null
    const avg = this.sum / this.window
    this.window = 0
    this.sum = 0
    if (avg > this.budgetMs) {
      const i = ORDER.indexOf(this.level)
      if (i < ORDER.length - 1) {
        this.level = ORDER[i + 1]
        this.cooldown = this.windowFrames
        return this.level
      }
    }
    return null
  }
}
