export type InputMode = 'auto' | 'touch' | 'tilt' | 'mouse' | 'keyboard' | 'gamepad'
export type QualitySetting = 'auto' | 'low' | 'med' | 'high'

export interface Settings {
  inputMode: InputMode
  touchStyle: 'drag' | 'zones'
  sensitivity: number
  volume: number
  quality: QualitySetting
  haptics: boolean
  reducedMotion: boolean
  nickname: string
}

export interface LevelBest {
  timeMs: number
  tokens: number
  stars: number
}

export interface QueuedScore {
  levelId: string
  runToken: string
  timeMs: number
  tokens: number
  nickname: string
  inputLogHash: string
  queuedAt: number
}

export interface SaveData {
  playerId: string
  settings: Settings
  bests: Record<string, LevelBest>
  queue: QueuedScore[]
}

const KEY = 'pocket-rally:v1'

export function defaultSettings(): Settings {
  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    inputMode: 'auto',
    touchStyle: 'drag',
    sensitivity: 1,
    volume: 0.7,
    quality: 'auto',
    haptics: true,
    reducedMotion: reduce,
    nickname: '',
  }
}

export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)]
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`
}

function fresh(): SaveData {
  return { playerId: uuid(), settings: defaultSettings(), bests: {}, queue: [] }
}

let cache: SaveData | null = null

export function load(): SaveData {
  if (cache) return cache
  let data: SaveData | null = null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>
      const base = fresh()
      data = {
        playerId:
          typeof p.playerId === 'string' && p.playerId.length >= 8 ? p.playerId : base.playerId,
        settings: { ...base.settings, ...(p.settings ?? {}) },
        bests: p.bests && typeof p.bests === 'object' ? p.bests : {},
        queue: Array.isArray(p.queue) ? p.queue : [],
      }
    }
  } catch {
    data = null
  }
  cache = data ?? fresh()
  persist()
  return cache
}

export function persist(): void {
  if (!cache) return
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage unavailable (private mode): keep in-memory state */
  }
}

/** Records a finished run; returns true if it is a new personal best. */
export function recordBest(
  levelId: string,
  timeMs: number,
  tokens: number,
  stars: number,
): boolean {
  const save = load()
  const prev = save.bests[levelId]
  const better = !prev || timeMs < prev.timeMs
  save.bests[levelId] = {
    timeMs: better ? timeMs : prev.timeMs,
    tokens: Math.max(tokens, prev?.tokens ?? 0),
    stars: Math.max(stars, prev?.stars ?? 0),
  }
  persist()
  return better
}

export function sanitizeNickname(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 16)
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const c = Math.floor((total % 1000) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}
