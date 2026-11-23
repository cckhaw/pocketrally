/** URL parameters that change behaviour (mostly for tests and embedding). */
export interface Params {
  debug: boolean
  autopilot: boolean
  embed: boolean
  turbo: number
  level: string | null
  autostart: boolean
  quality: 'low' | 'med' | 'high' | null
}

export function readParams(search = location.search): Params {
  const q = new URLSearchParams(search)
  const quality = q.get('quality')
  return {
    debug: q.get('debug') === '1',
    autopilot: q.get('autopilot') === '1',
    embed: q.get('embed') === '1',
    turbo: Math.max(1, Math.min(30, Number(q.get('turbo')) || 1)),
    level: q.get('level'),
    autostart: q.get('autostart') === '1',
    quality: quality === 'low' || quality === 'med' || quality === 'high' ? quality : null,
  }
}
