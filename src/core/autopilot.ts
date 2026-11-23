import { CAR, cloneCar, makeCar, stepCar, type CarInput, type CarState } from '../car/controller'
import { evalHazard, hazardHits, makeHazardState, type HazardState } from '../entities/hazards'
import type { Run } from './run'

const HORIZON_STEPS = 44
const SIM_DT = 1 / 30
const NUM_TARGETS = 9

/**
 * Lookahead planner that "drives the racing line": it simulates candidate lateral targets (with
 * and without braking) against the deterministic hazards and picks the cheapest. Used by
 * `?autopilot=1` and by headless tests.
 */
export class Autopilot {
  private readonly sim: CarState = makeCar()
  private readonly scratch: HazardState = makeHazardState()
  private counter = 0
  private target = 0
  private brake = false
  private seen = new Uint8Array(0)
  private nearHazards: number[] = []
  private nearTokens: number[] = []

  update(run: Run): CarInput {
    if (this.counter++ % 4 === 0) this.plan(run)
    const err = this.target - run.car.d
    return { steer: Math.max(-1, Math.min(1, err / 2.5)), brake: this.brake }
  }

  private plan(run: Run): void {
    const car = run.car
    const track = run.track
    const lvl = run.level
    if (this.seen.length !== lvl.tokens.length) this.seen = new Uint8Array(lvl.tokens.length)

    this.nearHazards.length = 0
    for (let i = 0; i < lvl.hazards.length; i++) {
      const h = lvl.hazards[i]
      const reach = 25 + (h.len ?? 0) + (h.kind === 'door' ? (h.amp ?? 8) : 0)
      if (h.s > car.s - reach && h.s < car.s + 60 + reach) this.nearHazards.push(i)
    }
    this.nearTokens.length = 0
    for (let i = 0; i < lvl.tokens.length; i++) {
      const t = lvl.tokens[i]
      if (!run.tokens[i] && t.s > car.s - 2 && t.s < car.s + 45) this.nearTokens.push(i)
    }

    const hw = Math.max(1, track.halfWidth(car.s + 6) - 1.2)
    let best = Infinity
    let bestTarget = this.target
    let bestBrake = false
    for (let b = 0; b < 2; b++) {
      for (let k = 0; k < NUM_TARGETS; k++) {
        const target = -hw + (2 * hw * k) / (NUM_TARGETS - 1)
        const cost = this.evaluate(run, target, b === 1)
        // hysteresis: slightly prefer the current plan
        const c = cost + (Math.abs(target - this.target) > 0.1 ? 0.5 : 0)
        if (c < best) {
          best = c
          bestTarget = target
          bestBrake = b === 1
        }
      }
    }
    this.target = bestTarget
    this.brake = bestBrake
  }

  private evaluate(run: Run, target: number, brake: boolean): number {
    const lvl = run.level
    const sim = cloneCar(run.car, this.sim)
    const input: CarInput = { steer: 0, brake }
    this.seen.fill(0)
    const s0 = sim.s
    let cost = brake ? 4 : 0
    for (let k = 1; k <= HORIZON_STEPS; k++) {
      input.steer = Math.max(-1, Math.min(1, (target - sim.d) / 2.5))
      stepCar(sim, input, SIM_DT, run.track, run.sensitivity)
      if (sim.fell) return cost + 1500 - k
      if (sim.scraped || sim.wall !== 0) cost += 0.4
      if (sim.boostHit) cost -= 6
      const t = run.time + k * SIM_DT
      if (sim.invulnT <= 0) {
        for (const i of this.nearHazards) {
          const st = evalHazard(lvl.hazards[i], t, this.scratch)
          if (hazardHits(st, sim.s, sim.d, CAR.halfWidth + 0.9)) {
            return cost + (st.severe ? 1400 : 900) - k
          }
        }
      }
      for (const i of this.nearTokens) {
        if (this.seen[i]) continue
        const tk = lvl.tokens[i]
        if (Math.abs(tk.s - sim.s) < 1.6 && Math.abs(tk.d - sim.d) < 1.6) {
          this.seen[i] = 1
          cost -= 7
        }
      }
    }
    cost -= (sim.s - s0) * 1.2
    cost += Math.abs(target) * 0.02
    return cost
  }
}
