export interface LevelInfo {
  id: string
  name: string
  tagline: string
  order: number
  locked: boolean
  bestMs: number | null
  stars: number
  tokens: number
  totalTokens: number
}

export type SubmitStatus = 'pending' | 'ok' | 'offline' | 'rejected' | 'skipped'

export interface ResultData {
  levelId: string
  levelName: string
  timeMs: number
  parMs: number
  tokens: number
  totalTokens: number
  stars: number
  newBest: boolean
  bestMs: number
  hasNext: boolean
  status: SubmitStatus
  rank?: number
  total?: number
  message?: string
}

export interface HudData {
  timeMs: number
  tokens: number
  totalTokens: number
  boost: number
  deaths: number
}

/** What the UI can ask the game to do. */
export interface GameApi {
  levels(): LevelInfo[]
  startLevel(id: string): void
  retry(): void
  next(): void
  pause(): void
  resume(): void
  quitToMenu(): void
  settingsChanged(): void
  requestTilt(): Promise<boolean>
  toggleFullscreen(): void
  canFullscreen(): boolean
  unlockAudio(): void
}
