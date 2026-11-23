export type Scope = 'all' | 'week'

export interface LeaderboardEntry {
  rank: number
  nickname: string
  timeMs: number
  isYou: boolean
}

export interface LeaderboardResponse {
  levelId: string
  scope: Scope
  total: number
  top: LeaderboardEntry[]
  you: LeaderboardEntry | null
  around: LeaderboardEntry[]
}

export interface ScoreResponse {
  ok: boolean
  rank: number
  weekRank: number
  bestTimeMs: number
  improved: boolean
  total: number
}

export interface RunStartResponse {
  runToken: string
}

export interface ApiError {
  error: string
  message?: string
}
