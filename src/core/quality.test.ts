import { describe, expect, it } from 'vitest'
import { QualityScaler } from './quality'

describe('QualityScaler', () => {
  it('downgrades when average frame time exceeds 20ms, one step at a time', () => {
    const q = new QualityScaler('high', 20, 10)
    let changed: string | null = null
    for (let i = 0; i < 10; i++) changed = q.sample(30) ?? changed
    expect(changed).toBe('med')
    for (let i = 0; i < 10; i++) q.sample(30) // cooldown
    for (let i = 0; i < 10; i++) changed = q.sample(30) ?? changed
    expect(changed).toBe('low')
  })

  it('stays put when fast, and never goes below low', () => {
    const q = new QualityScaler('high', 20, 10)
    for (let i = 0; i < 100; i++) expect(q.sample(8)).toBeNull()
    const low = new QualityScaler('low', 20, 5)
    for (let i = 0; i < 50; i++) expect(low.sample(50)).toBeNull()
  })
})
