/** WebAudio synthesis only: no audio files. */
export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  volume = 0.7
  private engineOn = false

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      this.ctx = new Ctor()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)
    const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
    const d = n.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.noise = n
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

  startEngine(): void {
    if (!this.ctx || !this.master || this.engineOn) return
    const c = this.ctx
    this.engineOsc = c.createOscillator()
    this.engineOsc2 = c.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc2.type = 'square'
    this.engineGain = c.createGain()
    this.engineGain.gain.value = 0.0
    this.engineFilter = c.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 900
    this.engineOsc.connect(this.engineFilter)
    this.engineOsc2.connect(this.engineFilter)
    this.engineFilter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engineOsc.start()
    this.engineOsc2.start()
    this.engineOn = true
  }

  stopEngine(): void {
    if (!this.engineOn) return
    try {
      this.engineOsc?.stop()
      this.engineOsc2?.stop()
    } catch {
      /* already stopped */
    }
    this.engineOn = false
  }

  setEngine(speed: number, boost: boolean, airborne: boolean): void {
    if (
      !this.ctx ||
      !this.engineOn ||
      !this.engineOsc ||
      !this.engineOsc2 ||
      !this.engineGain ||
      !this.engineFilter
    )
      return
    const t = this.ctx.currentTime
    const f = 60 + speed * 3.4 + (boost ? 40 : 0) + (airborne ? 30 : 0)
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05)
    this.engineOsc2.frequency.setTargetAtTime(f * 0.503, t, 0.05)
    this.engineFilter.frequency.setTargetAtTime(500 + speed * 25, t, 0.08)
    this.engineGain.gain.setTargetAtTime(0.05 + speed * 0.0016, t, 0.08)
  }

  silenceEngine(): void {
    if (this.ctx && this.engineGain)
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slide = 0,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return
    const c = this.ctx
    const t = c.currentTime + delay
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private burst(
    dur: number,
    gain: number,
    freq: number,
    q = 1,
    type: BiquadFilterType = 'lowpass',
    sweep = 0,
  ): void {
    if (!this.ctx || !this.master || !this.noise) return
    const c = this.ctx
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = this.noise
    const f = c.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  token(n = 0): void {
    this.tone(880 + n * 40, 0.12, 'triangle', 0.25)
    this.tone(1320 + n * 40, 0.18, 'triangle', 0.2, 0, 0.06)
  }
  boost(): void {
    this.burst(0.7, 0.5, 400, 2, 'bandpass', 3000)
    this.tone(220, 0.5, 'sawtooth', 0.12, 500)
  }
  land(impact: number): void {
    this.burst(0.18, Math.min(0.7, 0.15 + impact * 0.04), 600)
    this.tone(90, 0.15, 'sine', 0.35)
  }
  hit(): void {
    this.burst(0.35, 0.6, 1200, 1, 'lowpass', -900)
    this.tone(180, 0.3, 'square', 0.18, -120)
  }
  stomp(): void {
    this.burst(0.5, 0.9, 400, 1, 'lowpass', -300)
    this.tone(55, 0.5, 'sine', 0.6, -25)
  }
  fall(): void {
    this.tone(500, 0.6, 'sine', 0.25, -420)
  }
  checkpoint(): void {
    this.tone(660, 0.12, 'square', 0.12)
    this.tone(990, 0.2, 'square', 0.12, 0, 0.1)
  }
  finish(): void {
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.25, 0, i * 0.12))
  }
  beep(final: boolean): void {
    this.tone(final ? 880 : 440, final ? 0.4 : 0.15, 'square', 0.15)
  }
  click(): void {
    this.tone(600, 0.05, 'square', 0.08)
  }
  scrape(): void {
    this.burst(0.08, 0.1, 3000, 1, 'highpass')
  }
}
