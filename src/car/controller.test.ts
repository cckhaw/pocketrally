import { describe, expect, it } from 'vitest'
import { CAR, hit, makeCar, respawn, stepCar } from './controller'
import { Track } from '../core/track'
import { testLevel } from '../levels/test/config'
import { buildTrack } from '../core/run'

const DT = 1 / 60
const track = buildTrack(testLevel)
const noInput = { steer: 0, brake: false }

const plain = new Track(testLevel.waypoints, [], [])

function run(car: ReturnType<typeof makeCar>, n: number, input = noInput, t: Track = plain) {
  for (let i = 0; i < n; i++) stepCar(car, input, DT, t)
}

describe('car controller', () => {
  it('auto-accelerates to cruise speed', () => {
    const car = makeCar()
    run(car, 240)
    expect(car.speed).toBeCloseTo(CAR.cruise, 0)
    expect(car.s).toBeGreaterThan(40)
  })

  it('steers right with positive input and left with negative', () => {
    const a = makeCar()
    run(a, 30, { steer: 1, brake: false })
    expect(a.d).toBeGreaterThan(0.5)
    const b = makeCar()
    run(b, 30, { steer: -1, brake: false })
    expect(b.d).toBeLessThan(-0.5)
  })

  it('is clamped by walls on normal ground', () => {
    const car = makeCar()
    run(car, 240, { steer: 1, brake: false })
    expect(car.d).toBeLessThanOrEqual(track.halfWidth(car.s))
    expect(car.wall).toBe(1)
    expect(car.fell).toBe(false)
  })

  it('braking slows the car down', () => {
    const car = makeCar()
    run(car, 200)
    run(car, 60, { steer: 0, brake: true })
    expect(car.speed).toBeLessThan(CAR.cruise - 5)
  })

  it('boost pads raise speed and set boost timer', () => {
    const car = makeCar(testLevel.boosts[0].s - 6)
    car.speed = CAR.cruise
    let boosted = false
    for (let i = 0; i < 60; i++) {
      stepCar(car, noInput, DT, track)
      if (car.boostHit) boosted = true
    }
    expect(boosted).toBe(true)
    expect(car.speed).toBeGreaterThan(CAR.cruise + 4)
  })

  it('launches off a ramp, lands, and falls into a gap when too slow', () => {
    const ramp = testLevel.segments[0]
    const gap = testLevel.segments[1]
    if (ramp.type !== 'ramp' || gap.type !== 'gap') throw new Error('bad test level')
    const car = makeCar(ramp.s0 - 5)
    car.speed = CAR.cruise + 6
    let launched = false
    let landed = false
    for (let i = 0; i < 180; i++) {
      stepCar(car, noInput, DT, track)
      if (car.launched) launched = true
      if (car.landed > 0) landed = true
      if (car.fell) break
    }
    expect(launched).toBe(true)
    expect(landed).toBe(true)
    expect(car.fell).toBe(false)

    const slow = makeCar(ramp.s0 - 5)
    slow.speed = 6
    let fell = false
    for (let i = 0; i < 400; i++) {
      slow.speed = Math.min(slow.speed, 7)
      stepCar(slow, { steer: 0, brake: true }, DT, track)
      if (slow.fell) {
        fell = true
        break
      }
    }
    expect(fell).toBe(true)
  })

  it('hit() spins out and slows, with an invulnerability window', () => {
    const car = makeCar()
    hit(car)
    expect(car.spinT).toBeGreaterThan(0)
    expect(car.slowT).toBeGreaterThan(0)
    car.spinT = 0
    hit(car)
    expect(car.spinT).toBe(0)
  })

  it('respawn puts the car back on the track', () => {
    const car = makeCar(100)
    car.y = -10
    respawn(car, 40)
    expect(car.s).toBe(40)
    expect(car.y).toBe(0)
    expect(car.grounded).toBe(true)
  })
})

describe('track', () => {
  it('has a sensible length and tangent frame', () => {
    expect(track).toBeInstanceOf(Track)
    expect(track.length).toBeGreaterThan(200)
    const p = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0, w: 0 }
    track.at(10, p)
    expect(Math.hypot(p.tx, p.tz)).toBeCloseTo(1, 3)
    expect(p.nx).toBeCloseTo(-p.tz, 5)
  })
})
