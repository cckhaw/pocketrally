import { describe, expect, it, vi } from 'vitest'

type Handler = (e: { origin: string; data: unknown }) => void

function setupWindow(embedded: boolean) {
  const handlers: Handler[] = []
  const posted: { msg: unknown; origin: string }[] = []
  const parent = { postMessage: (msg: unknown, origin: string) => posted.push({ msg, origin }) }
  const win = {
    addEventListener: (type: string, h: Handler) => {
      if (type === 'message') handlers.push(h)
    },
    parent: undefined as unknown,
  }
  win.parent = embedded ? parent : win
  ;(globalThis as unknown as { window: unknown }).window = win
  return { handlers, posted }
}

describe('arcade bridge', () => {
  it('posts ready and score to the portal origin only when embedded', async () => {
    const { posted } = setupWindow(true)
    const { Bridge } = await import('./bridge')
    const b = new Bridge()
    b.ready()
    b.score('garden', 71234)
    expect(posted).toEqual([
      { msg: { type: 'pocket-rally:ready' }, origin: 'https://games.khaw.cc' },
      {
        msg: { type: 'pocket-rally:score', levelId: 'garden', timeMs: 71234 },
        origin: 'https://games.khaw.cc',
      },
    ])
  })

  it('does not post when standalone', async () => {
    vi.resetModules()
    const { posted } = setupWindow(false)
    const { Bridge } = await import('./bridge')
    const b = new Bridge()
    b.ready()
    expect(posted).toHaveLength(0)
  })

  it('handles pause/resume only from https://games.khaw.cc', async () => {
    vi.resetModules()
    const { handlers } = setupWindow(true)
    const { Bridge } = await import('./bridge')
    const b = new Bridge()
    const pause = vi.fn()
    const resume = vi.fn()
    b.onPause = pause
    b.onResume = resume
    handlers[0]({ origin: 'https://evil.example', data: { type: 'pocket-rally:pause' } })
    handlers[0]({ origin: 'https://games.khaw.cc', data: null })
    expect(pause).not.toHaveBeenCalled()
    handlers[0]({ origin: 'https://games.khaw.cc', data: { type: 'pocket-rally:pause' } })
    handlers[0]({ origin: 'https://games.khaw.cc', data: { type: 'pocket-rally:resume' } })
    expect(pause).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
