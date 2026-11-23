import type { LevelConfig } from './types'
import { gardenLevel } from './garden/config'
import { houseLevel } from './house/config'
import { cellarLevel } from './cellar/config'

export const LEVELS: LevelConfig[] = [gardenLevel, houseLevel, cellarLevel].sort((a, b) => a.order - b.order)

export function getLevel(id: string): LevelConfig | undefined {
  return LEVELS.find((l) => l.id === id)
}
