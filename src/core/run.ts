import { CAR, hit, makeCar, respawn, stepCar, type CarInput, type CarState } from '../car/controller'
import { evalHazard, hazardHits, makeHazardState, type HazardState } from '../entities/hazards'
import { SIM_DT, type LevelConfig } from '../levels/types'
import { Track } from './track'

export type RunEventType =
  | 'boost'
  | 'launch'
  | 'land'
  | 'hit'
  | 'stomp'
  | 'fall'
  | 'respawn'
  | 'token'
  | 'checkpoint'
  | 'finish'
  | 'scrape'

export interface RunEvent {
  type: RunEventType
  value: number
}

const LOG_EVERY = 6
const LOG_MAX = 60 * 60 * 20

/** Headless, deterministic simulation of one attempt at a level. */
export class Run {
  readonly level: LevelConfig
  readonly track: Track
  readonly car: CarState
  readonly hazards: HazardState[]
  readonly tokens: Uint8Array
  readonly events: RunEvent[] = []
  steps = 0
  tokenCount = 0
  checkpointIndex = -1
  checkpointS = 0
  finished = false
  finishTimeMs = 0
  deaths = 0
  hits = 0
  /** Quantised steering log (every LOG_EVERY steps), hashed and sent with the score. */
  readonly log = new Int8Array(LOG_MAX)
  logLen = 0
  sensitivity = 1

  constructor(level: LevelConfig, track: Track) {
    this.level = level
    this.track = track
    this.car = makeCar(0, 0)
    this.hazards = level.hazards.map(() => makeHazardState())
    this.tokens = new Uint8Array(level.tokens.length)
    this.evalHazards(0)
  }

  get time(): number {
    return this.steps * SIM_DT
  }

  get timeMs(): number {
    return Math.round((this.steps * 1000) / 60)
  }

  private push(type: RunEventType, value = 0): void {
    this.events.push({ type, value })
  }

  evalHazards(t: number): void {
    const hz = this.level.hazards
    for (let i = 0; i < hz.length; i++) evalHazard(hz[i], t, this.hazards[i])
  }

  step(input: CarInput): void {
    if (this.finished) return
    const car = this.car
    this.steps++
    if (this.steps % LOG_EVERY === 0 && this.logLen < LOG_MAX) {
      this.log[this.logLen++] = Math.round(Math.max(-1, Math.min(1, input.steer)) * 100)
    }
    stepCar(car, input, SIM_DT, this.track, this.sensitivity)

    if (car.launched) this.push('launch')
    if (car.landed > 0) this.push('land', car.landed)
    if (car.boostHit) this.push('boost')
    if (car.scraped) this.push('scrape')

    this.evalHazards(this.time)
    if (car.invulnT <= 0) {
      for (let i = 0; i < this.hazards.length; i++) {
        const hs = this.hazards[i]
        if (hazardHits(hs, car.s, car.d, CAR.halfWidth + 0.3) && car.y < 1.6) {
          this.hits++
          if (hs.severe) {
            this.push('stomp', i)
            this.doRespawn()
          } else {
            hit(car)
            this.push('hit', i)
          }
          break
        }
      }
    }

    if (car.fell) {
      this.push('fall')
      this.doRespawn()
    }

    // Tokens
    const toks = this.level.tokens
    for (let i = 0; i < toks.length; i++) {
      if (this.tokens[i]) continue
      const t = toks[i]
      if (Math.abs(t.s - car.s) < 1.4 && Math.abs(t.d - car.d) < 1.5 && Math.abs((t.y ?? 0) + 0.6 - car.y) < 2.2) {
        this.tokens[i] = 1
        this.tokenCount++
        this.push('token', i)
      }
    }

    // Checkpoints
    const cps = this.level.checkpoints
    while (this.checkpointIndex + 1 < cps.length && car.s >= cps[this.checkpointIndex + 1]) {
      this.checkpointIndex++
      this.checkpointS = cps[this.checkpointIndex]
      this.push('checkpoint', this.checkpointIndex)
    }

    if (car.s >= this.track.length - 1) {
      this.finished = true
      this.finishTimeMs = this.timeMs
      this.push('finish', this.finishTimeMs)
    }
  }

  private doRespawn(): void {
    this.deaths++
    respawn(this.car, this.checkpointS)
    this.push('respawn', this.checkpointS)
  }
}

export function starsFor(level: LevelConfig, timeMs: number, tokens: number): number {
  let stars = 1
  if (tokens >= Math.ceil(level.tokens.length * 0.7)) stars++
  if (timeMs <= level.parTimeMs) stars++
  return stars
}

export function buildTrack(level: LevelConfig): Track {
  return new Track(level.waypoints, level.segments, level.boosts)
}
