import type { Track } from '../core/track'

export const CAR = {
  cruise: 21,
  boostSpeed: 35,
  brakeSpeed: 8,
  accel: 16,
  boostAccel: 70,
  brakeDecel: 45,
  maxLat: 12,
  latResponse: 11,
  gravity: 30,
  boostTime: 1.5,
  spinTime: 0.9,
  slowTime: 1.0,
  slowFactor: 0.45,
  invulnTime: 1.4,
  halfWidth: 0.7,
  fallY: -7,
} as const

export interface CarState {
  /** Distance along the track and lateral offset (positive = right). */
  s: number
  d: number
  vLat: number
  speed: number
  /** Heading relative to the track tangent (radians, positive = right). */
  yaw: number
  y: number
  vy: number
  grounded: boolean
  groundVy: number
  boostT: number
  spinT: number
  slowT: number
  invulnT: number
  /** -1 left wall, 1 right wall, 0 none; magnitude is contact strength 0..1. */
  wall: number
  brake: boolean
  /** Per-step event outputs. */
  landed: number
  launched: boolean
  fell: boolean
  boostHit: boolean
  scraped: boolean
  airTime: number
}

export interface CarInput {
  /** -1 (left) to 1 (right). */
  steer: number
  brake: boolean
}

export function makeCar(s = 0, d = 0): CarState {
  return {
    s,
    d,
    vLat: 0,
    speed: CAR.cruise * 0.6,
    yaw: 0,
    y: 0,
    vy: 0,
    grounded: true,
    groundVy: 0,
    boostT: 0,
    spinT: 0,
    slowT: 0,
    invulnT: 0,
    wall: 0,
    brake: false,
    landed: 0,
    launched: false,
    fell: false,
    boostHit: false,
    scraped: false,
    airTime: 0,
  }
}

export function cloneCar(src: CarState, dst: CarState): CarState {
  Object.assign(dst, src)
  return dst
}

export function targetSpeed(car: CarState, brake: boolean, surfaceSlow: number): number {
  let t: number = car.boostT > 0 ? CAR.boostSpeed : CAR.cruise
  if (car.slowT > 0) t *= CAR.slowFactor
  if (brake && car.boostT <= 0) t = CAR.brakeSpeed
  return t * surfaceSlow
}

/** Advance the car by dt seconds. Pure maths, no rendering. */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  track: Track,
  sensitivity = 1,
): void {
  car.landed = 0
  car.launched = false
  car.fell = false
  car.boostHit = false
  car.scraped = false
  car.brake = input.brake

  car.boostT = Math.max(0, car.boostT - dt)
  car.slowT = Math.max(0, car.slowT - dt)
  car.spinT = Math.max(0, car.spinT - dt)
  car.invulnT = Math.max(0, car.invulnT - dt)

  const surface = track.surfaceAt(car.s)
  const grip = surface === 'spill' ? 0.28 : 1
  const surfSlow = surface === 'water' ? 0.8 : 1

  // Longitudinal speed
  const tgt = targetSpeed(car, input.brake, surfSlow)
  const rate = car.speed > tgt ? CAR.brakeDecel : car.boostT > 0 ? CAR.boostAccel : CAR.accel
  const airFactor = car.grounded ? 1 : 0.2
  car.speed += Math.sign(tgt - car.speed) * Math.min(Math.abs(tgt - car.speed), rate * airFactor * dt)

  // Lateral steering (spinning out removes control)
  const steer = car.spinT > 0 ? 0 : Math.max(-1, Math.min(1, input.steer)) * sensitivity
  const drift = input.brake && Math.abs(steer) > 0.2 ? 1.35 : 1
  const control = car.grounded ? grip : 0.25
  const latTarget = steer * CAR.maxLat * drift * Math.min(1, 0.5 + car.speed / CAR.cruise / 2)
  const k = 1 - Math.exp(-CAR.latResponse * control * dt)
  car.vLat += (latTarget - car.vLat) * k

  car.s += car.speed * dt
  car.d += car.vLat * dt

  // Edges
  const hw = track.halfWidth(car.s) - CAR.halfWidth * 0.5
  car.wall = 0
  if (!track.isDropEdge(car.s)) {
    if (car.d > hw) {
      car.d = hw
      if (car.vLat > 1) car.scraped = true
      car.vLat = Math.min(car.vLat, 0) * 0.2
      car.wall = 1
      car.speed *= 1 - 0.4 * dt
    } else if (car.d < -hw) {
      car.d = -hw
      if (car.vLat < -1) car.scraped = true
      car.vLat = Math.max(car.vLat, 0) * 0.2
      car.wall = -1
      car.speed *= 1 - 0.4 * dt
    }
  }

  // Boost pads
  if (car.grounded && track.boostAt(car.s, car.d)) {
    if (car.boostT < CAR.boostTime - 0.3) car.boostHit = true
    car.boostT = CAR.boostTime
  }

  // Vertical
  const gy = track.ground(car.s, car.d)
  if (car.grounded) {
    if (gy === null) {
      car.grounded = false
      car.vy = car.groundVy
      car.launched = true
      car.airTime = 0
    } else {
      const ballistic = car.y + car.groundVy * dt - 0.5 * CAR.gravity * dt * dt
      if (ballistic > gy + 0.02) {
        car.grounded = false
        car.vy = car.groundVy
        car.launched = true
        car.airTime = 0
        car.y += car.vy * dt
      } else {
        car.groundVy = (gy - car.y) / dt
        car.y = gy
      }
    }
  } else {
    car.airTime += dt
    car.vy -= CAR.gravity * dt
    car.y += car.vy * dt
    if (gy !== null && car.y <= gy && car.vy <= 0) {
      car.landed = -car.vy
      car.y = gy
      car.vy = 0
      car.groundVy = 0
      car.grounded = true
    }
  }
  if (car.y < CAR.fallY) car.fell = true

  // Visual yaw relative to the track follows lateral motion.
  const yawTarget = Math.atan2(car.vLat, Math.max(car.speed, 1)) * 0.9
  car.yaw += (yawTarget - car.yaw) * (1 - Math.exp(-14 * dt))
}

export function hit(car: CarState): void {
  if (car.invulnT > 0) return
  car.spinT = CAR.spinTime
  car.slowT = CAR.slowTime
  car.invulnT = CAR.invulnTime
}

export function respawn(car: CarState, s: number): void {
  car.s = s
  car.d = 0
  car.vLat = 0
  car.speed = CAR.cruise * 0.5
  car.yaw = 0
  car.y = 0
  car.vy = 0
  car.groundVy = 0
  car.grounded = true
  car.boostT = 0
  car.spinT = 0
  car.slowT = 0
  car.invulnT = 2
  car.fell = false
  car.wall = 0
}
