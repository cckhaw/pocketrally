import { formatTime } from '../core/save'
import { clear, h, stars } from './dom'
import { LeaderboardScreen } from './leaderboardScreen'
import { SettingsScreen } from './settingsScreen'
import type { GameApi, HudData, ResultData } from './types'

export interface UIOptions {
  embed: boolean
  debug: boolean
}

/** All DOM UI: title, level select, HUD, pause, results and overlays. */
export class UI {
  private root: HTMLElement
  private layer = h('div', { class: 'layer' })
  private hud = h('div', { class: 'hud hidden' })
  private timer = h('div', { class: 'hud-timer', 'data-testid': 'timer' }, '0:00.00')
  private tokens = h('div', { class: 'hud-tokens', 'data-testid': 'tokens' }, '0/0')
  private boostBar = h('div', { class: 'boost-fill' })
  private hint = h('div', { class: 'hud-hint' })
  private levelName = h('div', { class: 'hud-level' })
  private countdown = h('div', { class: 'countdown', 'aria-live': 'assertive' })
  private fade = h('div', { class: 'fade' })
  private toastEl = h('div', { class: 'toast', role: 'status' })
  private speed = h('div', { class: 'speedlines' })
  private dbg = h('div', { class: 'debug hidden', 'data-testid': 'debug' })
  private loading = h('div', { class: 'screen loading hidden' })
  private loadFill = h('div', { class: 'load-fill' })
  private loadTitle = h('div', { class: 'load-title' })
  private toastTimer = 0
  private current: HTMLElement | null = null
  private resultEls: { rank: HTMLElement } | null = null
  readonly settings: SettingsScreen
  readonly leaderboard: LeaderboardScreen
  private opts: UIOptions
  private api: GameApi
  private returnTo: 'title' | 'select' | 'pause' | 'results' = 'title'
  private lastResult: ResultData | null = null

  constructor(root: HTMLElement, api: GameApi, opts: UIOptions) {
    this.root = root
    this.api = api
    this.opts = opts
    this.settings = new SettingsScreen(api, () => this.closeSub())
    this.leaderboard = new LeaderboardScreen(api, () => this.closeSub())
    const pauseBtn = h(
      'button',
      {
        class: 'btn icon',
        'aria-label': 'Pause',
        'data-testid': 'pause',
        onclick: () => this.api.pause(),
      },
      '⏸',
    )
    const fsBtn = h(
      'button',
      {
        class: 'btn icon fs',
        'aria-label': 'Fullscreen',
        onclick: () => this.api.toggleFullscreen(),
      },
      '⛶',
    )
    if (!api.canFullscreen()) fsBtn.classList.add('hidden')
    this.hud.append(
      h('div', { class: 'hud-left' }, this.timer, this.levelName),
      h('div', { class: 'hud-center' }, h('span', { class: 'coin' }, '●'), this.tokens),
      h(
        'div',
        { class: 'hud-right', 'data-ui': '' },
        h('div', { class: 'hud-buttons' }, fsBtn, pauseBtn),
        h('div', { class: 'boost' }, this.boostBar),
      ),
      this.hint,
    )
    this.loading.append(
      h(
        'div',
        { class: 'panel narrow' },
        this.loadTitle,
        h('div', { class: 'load-bar' }, this.loadFill),
        h('div', { class: 'load-sub' }, 'Loading…'),
      ),
    )
    this.layer.append(
      this.speed,
      this.hud,
      this.countdown,
      this.toastEl,
      this.fade,
      this.loading,
      this.dbg,
      this.settings.el,
      this.leaderboard.el,
    )
    this.root.append(this.layer)
    if (opts.debug) this.dbg.classList.remove('hidden')
  }

  // ---------- generic ----------
  private show(el: HTMLElement): void {
    this.current?.remove()
    this.current = el
    this.layer.append(el)
    this.layer.append(this.settings.el, this.leaderboard.el, this.fade)
  }

  hideAll(): void {
    this.current?.remove()
    this.current = null
    this.hud.classList.add('hidden')
    this.settings.close()
    this.leaderboard.close()
    this.countdown.textContent = ''
  }

  private backToArcade(): HTMLElement | null {
    if (this.opts.embed) return null
    return h(
      'a',
      { class: 'btn ghost small', href: 'https://games.khaw.cc', 'data-testid': 'back-arcade' },
      '← Back to Arcade',
    )
  }

  private closeSub(): void {
    // Re-show whichever screen opened the sub screen.
    if (this.returnTo === 'pause') return
  }

  // ---------- screens ----------
  showTitle(): void {
    this.hud.classList.add('hidden')
    const el = h(
      'div',
      { class: 'screen title', 'data-testid': 'title' },
      h(
        'div',
        { class: 'title-box', 'data-ui': '' },
        h(
          'div',
          { class: 'logo' },
          h('span', {}, 'POCKET'),
          h('span', { class: 'rally' }, 'RALLY'),
        ),
        h('p', { class: 'tag' }, 'A tiny RC car. A giant world.'),
        h(
          'button',
          {
            class: 'btn primary big',
            'data-testid': 'play',
            onclick: () => {
              this.api.unlockAudio()
              this.showSelect()
            },
          },
          'Play',
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn',
              'data-testid': 'open-leaderboard',
              onclick: () => {
                this.returnTo = 'title'
                this.leaderboard.open()
              },
            },
            'Leaderboard',
          ),
          h(
            'button',
            {
              class: 'btn',
              'data-testid': 'open-settings',
              onclick: () => {
                this.returnTo = 'title'
                this.settings.open()
              },
            },
            'Settings',
          ),
        ),
        h('div', { class: 'row small-row' }, this.backToArcade(), this.fsButton()),
        h(
          'p',
          { class: 'controls' },
          'Drag / A-D / arrows / tilt / gamepad to steer. Space to brake.',
        ),
      ),
    )
    this.show(el)
  }

  private fsButton(): HTMLElement | null {
    if (!this.api.canFullscreen()) return null
    return h(
      'button',
      { class: 'btn ghost small', onclick: () => this.api.toggleFullscreen() },
      'Fullscreen',
    )
  }

  showSelect(): void {
    this.hud.classList.add('hidden')
    const cards = this.api.levels().map((l) =>
      h(
        'button',
        {
          class: `card${l.locked ? ' locked' : ''}`,
          'data-testid': `level-${l.id}`,
          disabled: l.locked,
          onclick: () => {
            this.api.unlockAudio()
            void this.api.startLevel(l.id)
          },
        },
        h('div', { class: 'card-num' }, String(l.order)),
        h('div', { class: 'card-name' }, l.name),
        h('div', { class: 'card-tag' }, l.tagline),
        h(
          'div',
          { class: 'card-stars' },
          l.locked ? '🔒 Finish the previous level' : stars(l.stars),
        ),
        h(
          'div',
          { class: 'card-best' },
          l.bestMs !== null
            ? `Best ${formatTime(l.bestMs)} · ${l.tokens}/${l.totalTokens} tokens`
            : 'No time yet',
        ),
      ),
    )
    const el = h(
      'div',
      { class: 'screen select', 'data-testid': 'select' },
      h(
        'div',
        { class: 'select-box', 'data-ui': '' },
        h('h2', {}, 'Choose a level'),
        h('div', { class: 'cards' }, ...cards),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.returnTo = 'select'
                this.leaderboard.open()
              },
            },
            'Leaderboard',
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.returnTo = 'select'
                this.settings.open()
              },
            },
            'Settings',
          ),
          h(
            'button',
            {
              class: 'btn ghost',
              'data-testid': 'to-title',
              onclick: () => {
                this.hideAll()
                this.showTitle()
              },
            },
            'Back',
          ),
        ),
      ),
    )
    this.show(el)
  }

  showLoading(f: number, name: string): void {
    this.loading.classList.remove('hidden')
    this.loadTitle.textContent = name
    this.loadFill.style.width = `${Math.round(f * 100)}%`
  }

  hideLoading(): void {
    this.loading.classList.add('hidden')
  }

  showHud(levelName: string, showHint: boolean): void {
    this.current?.remove()
    this.current = null
    this.hud.classList.remove('hidden')
    this.levelName.textContent = levelName
    this.timer.textContent = '0:00.00'
    this.boostBar.style.width = '0%'
    this.hint.textContent = showHint ? 'Drag to steer · two fingers or Space to brake' : ''
    this.hint.classList.remove('fade-out')
    setTimeout(() => this.hint.classList.add('fade-out'), 4500)
  }

  hideHud(): void {
    this.hud.classList.add('hidden')
    this.setBoostFx(0)
  }

  updateHud(d: HudData): void {
    this.timer.textContent = formatTime(d.timeMs)
    this.tokens.textContent = `${d.tokens}/${d.totalTokens}`
    this.boostBar.style.width = `${Math.round(d.boost * 100)}%`
  }

  setBoostFx(v: number): void {
    this.speed.style.opacity = String(Math.max(0, Math.min(1, v)) * 0.9)
  }

  showCountdown(text: string): void {
    this.countdown.textContent = text
    this.countdown.classList.remove('pop')
    void this.countdown.offsetWidth
    if (text) this.countdown.classList.add('pop')
  }

  flash(): void {
    this.fade.classList.remove('go')
    void this.fade.offsetWidth
    this.fade.classList.add('go')
  }

  toast(text: string): void {
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1600)
  }

  showPause(): void {
    const el = h(
      'div',
      { class: 'screen pause', 'data-testid': 'pause-screen' },
      h(
        'div',
        { class: 'panel', 'data-ui': '' },
        h('h2', {}, 'Paused'),
        h(
          'button',
          { class: 'btn primary', 'data-testid': 'resume', onclick: () => this.api.resume() },
          'Resume',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              this.hidePause()
              this.api.retry()
            },
          },
          'Restart',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              this.returnTo = 'pause'
              this.settings.open()
            },
          },
          'Settings',
        ),
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              this.hidePause()
              this.api.quitToMenu()
            },
          },
          'Quit to menu',
        ),
      ),
    )
    this.show(el)
  }

  hidePause(): void {
    if (this.current?.classList.contains('pause')) {
      this.current.remove()
      this.current = null
    }
  }

  showResults(r: ResultData): void {
    this.lastResult = r
    const rank = h('div', { class: 'result-rank', 'data-testid': 'rank' }, 'Submitting score…')
    this.resultEls = { rank }
    const starEls = [1, 2, 3].map((i) =>
      h(
        'span',
        { class: `star${i <= r.stars ? ' on' : ''}`, style: `animation-delay:${0.25 * i}s` },
        '★',
      ),
    )
    const el = h(
      'div',
      { class: 'screen results', 'data-testid': 'results' },
      h(
        'div',
        { class: 'panel', 'data-ui': '' },
        h('div', { class: 'res-level' }, r.levelName),
        h('h2', {}, r.newBest ? 'New personal best!' : 'Finished!'),
        h('div', { class: 'stars' }, ...starEls),
        h('div', { class: 'res-time', 'data-testid': 'result-time' }, formatTime(r.timeMs)),
        h(
          'div',
          { class: 'res-grid' },
          h('div', {}, h('b', {}, 'Par'), formatTime(r.parMs)),
          h('div', {}, h('b', {}, 'Tokens'), `${r.tokens}/${r.totalTokens}`),
          h('div', {}, h('b', {}, 'Best'), formatTime(r.bestMs)),
        ),
        rank,
        h(
          'div',
          { class: 'row wrap' },
          h(
            'button',
            { class: 'btn primary', 'data-testid': 'retry', onclick: () => this.api.retry() },
            'Retry',
          ),
          r.hasNext
            ? h(
                'button',
                { class: 'btn', 'data-testid': 'next', onclick: () => this.api.next() },
                'Next level',
              )
            : null,
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.returnTo = 'results'
                this.leaderboard.open(r.levelId)
              },
            },
            'Leaderboard',
          ),
          h('button', { class: 'btn ghost', onclick: () => this.api.quitToMenu() }, 'Menu'),
        ),
        this.backToArcade(),
      ),
    )
    this.show(el)
  }

  updateResults(r: ResultData): void {
    this.lastResult = r
    const el = this.resultEls?.rank
    if (!el) return
    el.className = `result-rank ${r.status}`
    if (r.status === 'ok' && r.rank)
      el.textContent = `Global rank #${r.rank}${r.total ? ` of ${r.total}` : ''}`
    else el.textContent = r.message ?? 'Leaderboard offline'
  }

  debug(fps: number, calls: number, tris: number): void {
    this.dbg.textContent = `${fps.toFixed(0)} fps · ${calls} calls · ${(tris / 1000).toFixed(1)}k tris`
  }

  get result(): ResultData | null {
    return this.lastResult
  }
}

export { clear }
