import * as THREE from 'three'
import { CarModel } from '../car/car'
import { CarFx } from '../fx/carFx'
import { PostFX } from '../fx/post'
import { LEVELS, getLevel } from '../levels'
import { SIM_DT, type LevelConfig } from '../levels/types'
import { buildLevelView, type LevelView } from '../entities/levelView'
import { buildDiorama, type Diorama } from '../entities/diorama'
import { api } from '../net/api'
import { hashInputLog } from '../net/inputHash'
import { enqueue, flushQueue } from '../net/queue'
import type { GameApi, HudData, LevelInfo, ResultData } from '../ui/types'
import type { UI } from '../ui/ui'
import { Audio } from './audio'
import { Autopilot } from './autopilot'
import { Bridge } from './bridge'
import { ChaseCamera } from './camera'
import { Input } from './input'
import type { Params } from './params'
import { PRESETS, QualityScaler, type QualityLevel } from './quality'
import { Run, buildTrack, starsFor } from './run'
import { load, persist, recordBest, sanitizeNickname } from './save'
import type { Track } from './track'
import { makeTrackPoint } from './track'

export type GameState =
  'title' | 'select' | 'loading' | 'countdown' | 'playing' | 'paused' | 'results'

interface Loaded {
  level: LevelConfig
  track: Track
  view: LevelView
}

const TP = makeTrackPoint()

export class Game implements GameApi {
  readonly renderer: THREE.WebGLRenderer
  readonly input: Input
  readonly audio = new Audio()
  readonly bridge = new Bridge()
  state: GameState = 'title'
  ui!: UI
  private canvas: HTMLCanvasElement
  private container: HTMLElement
  private params: Params
  private scaler: QualityScaler
  private preset = PRESETS.high
  private post: PostFX | null = null
  private diorama: Diorama
  private loaded: Loaded | null = null
  private run: Run | null = null
  private carModel = new CarModel()
  private fx = new CarFx()
  private chase = new ChaseCamera()
  private autopilot = new Autopilot()
  private acc = 0
  private last = 0
  private countdown = 0
  private countdownShown = -1
  private runToken: string | null = null
  private runTokenLevel = ''
  private prev = { s: 0, d: 0, y: 0, yaw: 0 }
  private carPos = new THREE.Vector3()
  private fwd = new THREE.Vector2(0, -1)
  private boostVis = 0
  private frameCount = 0
  private fpsAcc = 0
  private fps = 60
  private hudLast = ''
  private loadToken = 0
  private levelId = ''
  private wasHidden = false

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, params: Params) {
    this.container = container
    this.canvas = canvas
    this.params = params
    const save = load()
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.info.autoReset = false
    this.input = new Input(() => load().settings)
    this.input.onPause = () => {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused') this.resume()
    }
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    const start: QualityLevel =
      params.quality ??
      (save.settings.quality !== 'auto' ? save.settings.quality : coarse ? 'med' : 'high')
    this.scaler = new QualityScaler(start)
    this.diorama = buildDiorama(this.renderer)
    this.applyQuality(start)
    this.applySettings()
    this.bridge.onPause = () => this.pause()
    this.bridge.onResume = () => {
      if (this.state === 'paused') this.resume()
    }
    window.addEventListener('resize', this.resize)
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 150))
    window.visualViewport?.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.wasHidden = true
        if (this.state === 'playing') this.pause()
        this.audio.silenceEngine()
      }
    })
    window.addEventListener('online', () => void flushQueue())
    this.resize()
  }

  /** Snapshot for tests and the debug overlay. */
  debugState(): {
    state: GameState
    level: string
    s: number
    d: number
    timeMs: number
    tokens: number
    deaths: number
    speed: number
    calls: number
    triangles: number
  } {
    const r = this.run
    return {
      state: this.state,
      level: this.levelId,
      s: r?.car.s ?? 0,
      d: r?.car.d ?? 0,
      timeMs: r?.timeMs ?? 0,
      tokens: r?.tokenCount ?? 0,
      deaths: r?.deaths ?? 0,
      speed: r?.car.speed ?? 0,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    }
  }

  attachUI(ui: UI): void {
    this.ui = ui
  }

  start(): void {
    this.last = performance.now()
    const loop = (now: number): void => {
      requestAnimationFrame(loop)
      this.frame(now)
    }
    requestAnimationFrame(loop)
    this.bridge.ready()
    void flushQueue()
  }

  // ---------- GameApi ----------
  levels(): LevelInfo[] {
    const save = load()
    return LEVELS.map((l) => {
      const best = save.bests[l.id]
      return {
        id: l.id,
        name: l.name,
        tagline: l.tagline,
        order: l.order,
        locked: false,
        bestMs: best?.timeMs ?? null,
        stars: best?.stars ?? 0,
        tokens: best?.tokens ?? 0,
        totalTokens: l.tokens.length,
      }
    })
  }

  unlockAudio(): void {
    this.audio.unlock()
  }

  setState(s: GameState): void {
    this.state = s
    document.body.dataset.screen = s
  }

  showTitle(): void {
    this.setState('title')
    this.input.enabled = false
    this.audio.silenceEngine()
    this.ui.showTitle()
  }

  async startLevel(id: string): Promise<void> {
    const level = getLevel(id)
    if (!level) return
    this.audio.unlock()
    const token = ++this.loadToken
    this.setState('loading')
    this.input.enabled = false
    this.ui.hideAll()
    this.ui.showLoading(0, level.name)
    try {
      if (!this.loaded || this.loaded.level.id !== id) {
        this.loaded?.view.dispose()
        this.loaded = null
        const track = buildTrack(level)
        const view = await buildLevelView(level, track, this.renderer, this.preset, (f) =>
          this.ui.showLoading(f, level.name),
        )
        if (token !== this.loadToken) return
        this.loaded = { level, track, view }
        this.carModel.shadow.removeFromParent()
        this.carModel.root.removeFromParent()
        view.scene.add(this.carModel.root, this.carModel.shadow, this.fx.group)
        this.chase.blockers = view.blockers
        this.post?.setScene(view.scene, this.chase.camera)
        this.fx.setDustColor(level.theme.trackColor)
        this.applyQuality(this.preset.name)
      }
    } catch (e) {
      console.error(e)
      this.ui.hideLoading()
      this.showTitle()
      return
    }
    this.levelId = id
    this.beginRun()
  }

  private beginRun(): void {
    const ld = this.loaded
    if (!ld) return
    this.run = new Run(ld.level, ld.track)
    this.run.sensitivity = load().settings.sensitivity
    if (this.params.startS > 0) {
      const cps = ld.level.checkpoints.filter((c) => c <= this.params.startS)
      this.run.car.s = this.params.startS
      this.run.checkpointS = cps.length ? cps[cps.length - 1] : 0
      this.run.checkpointIndex = cps.length - 1
    }
    this.fx.reset()
    this.carModel.root.visible = true
    this.prev = { s: 0, d: 0, y: 0, yaw: 0 }
    this.acc = 0
    this.countdown = 3.2
    this.countdownShown = -1
    this.boostVis = 0
    this.hudLast = ''
    this.input.reset()
    this.input.enabled = false
    this.chase.snap()
    this.setState('countdown')
    this.ui.hideLoading()
    this.ui.showHud(ld.level.name, !this.params.autopilot)
    this.runToken = null
    this.runTokenLevel = ld.level.id
    api
      .startRun(ld.level.id, load().playerId)
      .then((r) => {
        if (this.run && this.runTokenLevel === ld.level.id) this.runToken = r.runToken
      })
      .catch(() => {
        this.runToken = null
      })
    this.audio.startEngine()
    this.applyCameraNow()
  }

  retry(): void {
    if (this.levelId) void this.startLevel(this.levelId)
  }

  next(): void {
    const i = LEVELS.findIndex((l) => l.id === this.levelId)
    const n = LEVELS[i + 1]
    if (n) void this.startLevel(n.id)
    else this.quitToMenu()
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return
    this.prevStateBeforePause = this.state
    this.setState('paused')
    this.input.enabled = false
    this.audio.silenceEngine()
    this.ui.showPause()
  }
  private prevStateBeforePause: GameState = 'playing'

  resume(): void {
    if (this.state !== 'paused') return
    this.ui.hidePause()
    this.input.reset()
    this.input.enabled = this.prevStateBeforePause === 'playing' && !this.params.autopilot
    this.setState(this.prevStateBeforePause)
    this.last = performance.now()
  }

  quitToMenu(): void {
    this.loadToken++
    this.run = null
    this.audio.stopEngine()
    this.ui.hideAll()
    this.ui.showSelect()
    this.setState('select')
    this.input.enabled = false
  }

  settingsChanged(): void {
    this.applySettings()
  }

  requestTilt(): Promise<boolean> {
    return this.input.requestTilt()
  }

  canFullscreen(): boolean {
    return !!document.documentElement.requestFullscreen
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  // ---------- settings / quality ----------
  private applySettings(): void {
    const s = load().settings
    this.audio.setVolume(s.volume)
    this.chase.reducedMotion = s.reducedMotion
    this.fx.reducedMotion = s.reducedMotion
    document.body.classList.toggle('reduced-motion', s.reducedMotion)
    if (this.post) this.post.reducedMotion = s.reducedMotion
    if (this.params.quality === null) {
      if (s.quality !== 'auto') {
        this.scaler.level = s.quality
        this.applyQuality(s.quality)
      }
    }
  }

  private applyQuality(level: QualityLevel): void {
    this.preset = PRESETS[level]
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(Math.min(dpr, this.preset.pixelRatioCap))
    this.fx.particles.scale = this.preset.particleScale
    this.renderer.shadowMap.enabled = true
    this.loaded?.view.setQuality(this.preset)
    this.diorama.setQuality(this.preset)
    if (this.preset.post) {
      if (!this.post) {
        const scene = this.loaded?.view.scene ?? this.diorama.scene
        this.post = new PostFX(this.renderer, scene, this.chase.camera, this.preset)
        this.post.reducedMotion = load().settings.reducedMotion
      }
      const th = this.loaded?.level.theme
      this.post.configure(this.preset, th?.bloom ?? 0.3, th?.saturation ?? 1, th?.contrast ?? 1)
    }
    this.resize()
  }

  private resize = (): void => {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.chase.setAspect(w / h)
    this.diorama.setAspect(w / h)
    this.post?.setSize(w, h, this.renderer.getPixelRatio())
    this.fx.particles.setViewportHeight(h * this.renderer.getPixelRatio(), 62)
    document.documentElement.style.setProperty('--vh', `${h}px`)
  }

  // ---------- main loop ----------
  private frame(now: number): void {
    let dtReal = (now - this.last) / 1000
    this.last = now
    if (this.wasHidden) {
      dtReal = 0.016
      this.wasHidden = false
    }
    const dt = Math.min(0.1, Math.max(0, dtReal))
    if (this.state !== 'loading') {
      const next = this.scaler.sample(dtReal * 1000)
      if (next && load().settings.quality === 'auto' && this.params.quality === null)
        this.applyQuality(next)
    }
    this.fpsAcc += dtReal
    this.frameCount++
    if (this.fpsAcc >= 0.5) {
      this.fps = this.frameCount / this.fpsAcc
      this.fpsAcc = 0
      this.frameCount = 0
    }

    this.renderer.info.reset()
    if (this.state === 'countdown') this.tickCountdown(dt)
    else if (this.state === 'playing') this.tickPlaying(dt)

    if (this.state === 'title' || this.state === 'select' || !this.loaded || !this.run) {
      this.diorama.update(dt)
      this.renderScene(this.diorama.scene, this.diorama.camera, dt, 0)
    } else {
      this.updateVisuals(dt)
      this.renderScene(this.loaded.view.scene, this.chase.camera, dt, this.boostVis)
    }
    if (this.params.debug)
      this.ui.debug(this.fps, this.renderer.info.render.calls, this.renderer.info.render.triangles)
  }

  private renderScene(scene: THREE.Scene, cam: THREE.Camera, dt: number, boost: number): void {
    if (this.post && this.preset.post) {
      this.post.setScene(scene, cam)
      const th = this.loaded?.level.theme
      const dio = scene === this.diorama.scene
      this.post.configure(
        this.preset,
        dio ? 0.3 : (th?.bloom ?? 0.3),
        dio ? 1.1 : (th?.saturation ?? 1),
        dio ? 1.04 : (th?.contrast ?? 1),
      )
      this.post.render(dt, boost)
    } else {
      this.renderer.render(scene, cam)
    }
  }

  private tickCountdown(dt: number): void {
    this.countdown -= dt
    const n = Math.ceil(this.countdown - 0.2)
    if (n !== this.countdownShown) {
      this.countdownShown = n
      if (n > 0) {
        this.ui.showCountdown(String(n))
        this.audio.beep(false)
      } else {
        this.ui.showCountdown('GO!')
        this.audio.beep(true)
      }
    }
    if (this.countdown <= 0.2 && this.state === 'countdown') {
      this.setState('playing')
      this.input.enabled = !this.params.autopilot
      this.input.reset()
      this.acc = 0
      setTimeout(() => this.ui.showCountdown(''), 500)
    }
  }

  private tickPlaying(dt: number): void {
    const run = this.run
    if (!run) return
    this.input.update(dt)
    this.acc += dt * this.params.turbo
    let steps = 0
    const maxSteps = 8 * this.params.turbo
    while (this.acc >= SIM_DT && steps < maxSteps && !run.finished) {
      const c = run.car
      this.prev.s = c.s
      this.prev.d = c.d
      this.prev.y = c.y
      this.prev.yaw = c.yaw
      const ctl = this.params.autopilot
        ? this.autopilot.update(run)
        : { steer: this.input.steer, brake: this.input.brake }
      run.step(ctl)
      this.handleEvents(run)
      this.acc -= SIM_DT
      steps++
    }
    if (steps === maxSteps) this.acc = 0
    if (run.finished) this.finish(run)
    else this.updateHud(run)
  }

  private handleEvents(run: Run): void {
    const s = load().settings
    const a = this.audio
    const car = run.car
    for (const ev of run.events) {
      switch (ev.type) {
        case 'token':
          a.token(run.tokenCount % 8)
          this.fx.burst(
            this.carPos.x,
            this.carPos.y + 0.8,
            this.carPos.z,
            8,
            1,
            0.85,
            0.2,
            3,
            0.45,
            8,
          )
          break
        case 'boost':
          a.boost()
          this.vibrate(30)
          break
        case 'launch':
          break
        case 'land':
          a.land(ev.value)
          this.carModel.impact(ev.value)
          this.chase.addShake(Math.min(0.8, ev.value / 14))
          this.fx.landing(this.carPos, ev.value)
          if (ev.value > 6) this.vibrate(40)
          break
        case 'hit':
          a.hit()
          this.chase.addShake(0.6)
          this.fx.burst(
            this.carPos.x,
            this.carPos.y + 0.8,
            this.carPos.z,
            14,
            1,
            0.9,
            0.3,
            5,
            0.6,
            10,
          )
          this.vibrate(80)
          break
        case 'stomp':
          a.stomp()
          this.chase.addShake(1)
          this.ui.flash()
          this.vibrate(150)
          break
        case 'fall':
          a.fall()
          this.ui.flash()
          break
        case 'respawn':
          this.chase.snap()
          this.fx.reset()
          this.prev.s = car.s
          this.prev.d = car.d
          this.prev.y = car.y
          this.ui.toast('Back to checkpoint (+time)')
          break
        case 'checkpoint':
          a.checkpoint()
          this.ui.toast('Checkpoint!')
          break
        case 'scrape':
          a.scrape()
          this.fx.burst(
            this.carPos.x,
            this.carPos.y + 0.4,
            this.carPos.z,
            2,
            1,
            0.8,
            0.3,
            3,
            0.3,
            10,
          )
          break
        case 'finish':
          break
      }
    }
    run.events.length = 0
    void s
  }

  private vibrate(ms: number): void {
    if (load().settings.haptics && navigator.vibrate) navigator.vibrate(ms)
  }

  private updateHud(run: Run): void {
    const data: HudData = {
      timeMs: run.timeMs,
      tokens: run.tokenCount,
      totalTokens: run.level.tokens.length,
      boost: Math.max(0, run.car.boostT / 1.5),
      deaths: run.deaths,
    }
    const key = `${Math.floor(data.timeMs / 10)}|${data.tokens}|${Math.round(data.boost * 20)}`
    if (key !== this.hudLast) {
      this.hudLast = key
      this.ui.updateHud(data)
    }
  }

  private async finish(run: Run): Promise<void> {
    if (this.state !== 'playing') return
    const level = run.level
    this.setState('results')
    this.input.enabled = false
    this.audio.silenceEngine()
    this.audio.finish()
    this.ui.hideHud()
    const timeMs = run.finishTimeMs
    const stars = starsFor(level, timeMs, run.tokenCount)
    const newBest = recordBest(level.id, timeMs, run.tokenCount, stars)
    const best = load().bests[level.id]
    const idx = LEVELS.findIndex((l) => l.id === level.id)
    const data: ResultData = {
      levelId: level.id,
      levelName: level.name,
      timeMs,
      parMs: level.parTimeMs,
      tokens: run.tokenCount,
      totalTokens: level.tokens.length,
      stars,
      newBest,
      bestMs: best.timeMs,
      hasNext: idx >= 0 && idx < LEVELS.length - 1,
      status: 'pending',
    }
    this.bridge.score(level.id, timeMs)
    this.ui.showResults(data)
    const nick = sanitizeNickname(load().settings.nickname) || 'Rookie'
    const token = this.runToken
    try {
      const hash = await hashInputLog(run.log, run.logLen)
      if (!token) throw new Error('no run token')
      const res = await api.submitScore({
        runToken: token,
        timeMs,
        tokens: run.tokenCount,
        nickname: nick,
        inputLogHash: hash,
      })
      this.ui.updateResults({ ...data, status: 'ok', rank: res.rank, total: res.total })
      void flushQueue()
    } catch (e) {
      const permanent =
        e instanceof Error && 'permanent' in e && (e as { permanent: boolean }).permanent
      if (token && !permanent) {
        const hash = await hashInputLog(run.log, run.logLen)
        enqueue({
          levelId: level.id,
          runToken: token,
          timeMs,
          tokens: run.tokenCount,
          nickname: nick,
          inputLogHash: hash,
          queuedAt: Date.now(),
        })
        this.ui.updateResults({
          ...data,
          status: 'offline',
          message: 'Leaderboard offline. Score queued for retry.',
        })
      } else if (permanent) {
        this.ui.updateResults({
          ...data,
          status: 'rejected',
          message: 'Score not accepted by the leaderboard.',
        })
      } else {
        this.ui.updateResults({
          ...data,
          status: 'offline',
          message: 'Leaderboard offline. Personal best saved locally.',
        })
      }
    }
    persist()
  }

  // ---------- visuals ----------
  private carWorld(
    run: Run,
    alpha: number,
  ): {
    x: number
    y: number
    z: number
    hx: number
    hz: number
    heading: number
    trackHeading: number
  } {
    const c = run.car
    const s = this.prev.s + (c.s - this.prev.s) * alpha
    const d = this.prev.d + (c.d - this.prev.d) * alpha
    const y = this.prev.y + (c.y - this.prev.y) * alpha
    const p = this.loaded?.track.at(s, TP) ?? TP
    const x = p.x + p.nx * d
    const z = p.z + p.nz * d
    const trackHeading = Math.atan2(p.tx, -p.tz)
    const yawAbs = trackHeading + c.yaw
    return { x, y, z, hx: Math.sin(yawAbs), hz: -Math.cos(yawAbs), heading: -yawAbs, trackHeading }
  }

  private applyCameraNow(): void {
    const run = this.run
    if (!run) return
    this.updateVisuals(0.016)
  }

  private updateVisuals(dt: number): void {
    const run = this.run
    const ld = this.loaded
    if (!run || !ld) return
    const alpha = this.state === 'playing' ? Math.min(1, this.acc / SIM_DT) : 1
    if (this.state !== 'playing') {
      this.prev.s = run.car.s
      this.prev.d = run.car.d
      this.prev.y = run.car.y
    }
    const w = this.carWorld(run, alpha)
    this.carPos.set(w.x, w.y, w.z)
    const groundY = ld.track.ground(run.car.s, run.car.d) ?? run.car.y - 3
    const paused = this.state === 'paused'
    const cdt = paused ? 0 : dt
    this.carModel.update(cdt, run.car, this.carPos, w.heading, Math.min(groundY, w.y))
    if (!paused) {
      this.fx.update(dt, run.car, this.carPos, w.hx, w.hz)
      this.fx.particles.update(dt)
    }
    ld.view.update(paused ? 0 : dt, run, this.carPos)

    // chase camera follows the track direction blended with the car heading
    const p = ld.track.at(run.car.s, TP)
    const cx = p.tx * 0.55 + w.hx * 0.45
    const cz = p.tz * 0.55 + w.hz * 0.45
    const l = Math.hypot(cx, cz) || 1
    this.fwd.set(cx / l, cz / l)
    const boostTarget = run.car.boostT > 0 ? 1 : 0
    this.boostVis += (boostTarget - this.boostVis) * Math.min(1, dt * 6)
    const curve = ld.track.curvature(run.car.s + 8)
    const ceiling = ld.track.ceilingAt(run.car.s)
    if (this.state === 'results') {
      this.chase.orbit(this.carPos, performance.now() / 5000)
    } else {
      this.chase.update(dt, this.carPos, this.fwd.x, this.fwd.y, curve, this.boostVis, ceiling)
    }
    this.ui.setBoostFx(this.boostVis)
  }
}
