import { beforeEach, describe, expect, it } from 'vitest'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

import { formatTime, load, recordBest, sanitizeNickname } from './save'

describe('save', () => {
  beforeEach(() => store.clear())

  it('creates a player id and records personal bests', () => {
    const s = load()
    expect(s.playerId.length).toBeGreaterThan(8)
    expect(recordBest('garden', 70000, 5, 2)).toBe(true)
    expect(recordBest('garden', 80000, 9, 3)).toBe(false)
    expect(s.bests.garden).toEqual({ timeMs: 70000, tokens: 9, stars: 3 })
  })

  it('formats time and trims nicknames', () => {
    expect(formatTime(65432)).toBe('1:05.43')
    expect(sanitizeNickname('  Bob   the  builder and more and more ')).toHaveLength(16)
  })
})
