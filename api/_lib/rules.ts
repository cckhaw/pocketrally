import type { LevelConfig } from '../../src/levels/types'

/** Slack for network latency and the countdown: the claimed time may exceed server elapsed by this much. */
export const ELAPSED_TOLERANCE_MS = 1500
export const MAX_TIME_MS = 60 * 60 * 1000

export interface ScoreInput {
  timeMs: unknown
  tokens: unknown
  inputLogHash: unknown
}

export type RuleResult =
  | { ok: true; timeMs: number; tokens: number; inputLogHash: string }
  | { ok: false; code: string; message: string }

/** Pure anti-cheat rules. `elapsedMs` is server time since the run token was issued. */
export function checkScore(
  level: Pick<LevelConfig, 'minPossibleTimeMs' | 'tokens'>,
  input: ScoreInput,
  elapsedMs: number,
): RuleResult {
  const { timeMs, tokens, inputLogHash } = input
  if (
    typeof timeMs !== 'number' ||
    !Number.isInteger(timeMs) ||
    timeMs <= 0 ||
    timeMs > MAX_TIME_MS
  ) {
    return {
      ok: false,
      code: 'bad_time',
      message: 'timeMs must be a positive integer below one hour',
    }
  }
  if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 0) {
    return { ok: false, code: 'bad_tokens', message: 'tokens must be a non-negative integer' }
  }
  if (typeof inputLogHash !== 'string' || !/^[0-9a-f]{8,128}$/.test(inputLogHash)) {
    return { ok: false, code: 'bad_hash', message: 'inputLogHash must be a hex string' }
  }
  if (tokens > level.tokens.length) {
    return { ok: false, code: 'too_many_tokens', message: 'more tokens than the level contains' }
  }
  if (timeMs < level.minPossibleTimeMs) {
    return {
      ok: false,
      code: 'too_fast',
      message: 'time is below the minimum possible for this level',
    }
  }
  if (elapsedMs < timeMs - ELAPSED_TOLERANCE_MS) {
    return {
      ok: false,
      code: 'elapsed_mismatch',
      message: 'run was shorter on the server than the claimed time',
    }
  }
  return { ok: true, timeMs, tokens, inputLogHash }
}
