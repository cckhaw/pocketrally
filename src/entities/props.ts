import type { LevelConfig, PropDef } from '../levels/types'
import type { PropCtx } from './propCtx'
import { gardenProp } from './propsGarden'
import { houseProp } from './propsHouse'
import { cellarProp } from './propsCellar'

/** Dispatches a prop definition to its builder and places it in the level. */
export function buildProp(ctx: PropCtx, def: PropDef, level: LevelConfig): void {
  ctx.place(def.s, def.d, def.rot ?? 0, def.scale ?? 1)
  const v = def.v ?? 0
  const ok =
    gardenProp(ctx, def.kind, v) ||
    houseProp(ctx, def.kind, v, level) ||
    cellarProp(ctx, def.kind, v)
  if (!ok) throw new Error(`Unknown prop kind: ${def.kind}`)
}
