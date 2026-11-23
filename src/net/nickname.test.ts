import { describe, expect, it } from 'vitest'
import { validateNickname } from './nickname'

describe('validateNickname', () => {
  it('accepts normal names and trims', () => {
    expect(validateNickname('  Speedy   Gonzo ')).toEqual({ ok: true, nickname: 'Speedy Gonzo' })
  })
  it('enforces length', () => {
    expect(validateNickname('ab').ok).toBe(false)
    expect(validateNickname('a'.repeat(17)).ok).toBe(false)
    expect(validateNickname('a'.repeat(16)).ok).toBe(true)
  })
  it('rejects urls and blocked words (with leetspeak)', () => {
    expect(validateNickname('visit.me.com').ok).toBe(false)
    expect(validateNickname('http://x').ok).toBe(false)
    expect(validateNickname('sh1thead').ok).toBe(false)
    expect(validateNickname(42).ok).toBe(false)
  })
})
