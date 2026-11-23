import { LEVELS } from '../levels'
import { formatTime, load } from '../core/save'
import { api as net } from '../net/api'
import type { LeaderboardEntry, LeaderboardResponse, Scope } from '../net/types'
import { h } from './dom'
import type { GameApi } from './types'

export class LeaderboardScreen {
  readonly el = h('div', { class: 'screen leaderboard hidden', 'data-testid': 'leaderboard' })
  private level = LEVELS[0].id
  private scope: Scope = 'all'
  private list = h('div', { class: 'lb-list' })
  private timer = 0
  private reqId = 0
  private onClose: () => void

  constructor(_api: GameApi, onClose: () => void) {
    this.onClose = onClose
  }

  open(levelId?: string): void {
    if (levelId) this.level = levelId
    this.el.classList.remove('hidden')
    this.render()
    void this.refresh()
    clearInterval(this.timer)
    this.timer = window.setInterval(() => void this.refresh(true), 30000)
  }

  close(): void {
    this.el.classList.add('hidden')
    clearInterval(this.timer)
  }

  private render(): void {
    const levelTabs = LEVELS.map((l) =>
      h(
        'button',
        {
          class: `tab${l.id === this.level ? ' on' : ''}`,
          onclick: () => {
            this.level = l.id
            this.render()
            void this.refresh()
          },
        },
        l.name.replace(/^The /, ''),
      ),
    )
    const scopeTabs = (['all', 'week'] as const).map((s) =>
      h(
        'button',
        {
          class: `tab${s === this.scope ? ' on' : ''}`,
          'data-testid': `scope-${s}`,
          onclick: () => {
            this.scope = s
            this.render()
            void this.refresh()
          },
        },
        s === 'all' ? 'All time' : 'This week',
      ),
    )
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel wide', 'data-ui': '' },
        h('h2', {}, 'Leaderboard'),
        h('div', { class: 'tabs' }, ...levelTabs),
        h('div', { class: 'tabs small' }, ...scopeTabs),
        this.list,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => void this.refresh() }, 'Refresh'),
          h(
            'button',
            {
              class: 'btn primary',
              'data-testid': 'close-leaderboard',
              onclick: () => {
                this.close()
                this.onClose()
              },
            },
            'Close',
          ),
        ),
      ),
    )
  }

  private rowEl(e: LeaderboardEntry): HTMLElement {
    return h(
      'div',
      { class: `lb-row${e.isYou ? ' you' : ''}`, 'data-testid': e.isYou ? 'lb-you' : 'lb-row' },
      h('span', { class: 'lb-rank' }, `#${e.rank}`),
      h('span', { class: 'lb-name' }, e.nickname + (e.isYou ? ' (you)' : '')),
      h('span', { class: 'lb-time' }, formatTime(e.timeMs)),
    )
  }

  async refresh(silent = false): Promise<void> {
    const id = ++this.reqId
    if (!silent)
      this.list.replaceChildren(
        h('div', { class: 'lb-msg', 'data-testid': 'lb-loading' }, 'Loading…'),
      )
    try {
      const data: LeaderboardResponse = await net.leaderboard(
        this.level,
        this.scope,
        load().playerId,
      )
      if (id !== this.reqId) return
      const rows: HTMLElement[] = []
      if (data.top.length === 0)
        rows.push(h('div', { class: 'lb-msg' }, 'No times yet. Be the first!'))
      for (const e of data.top) rows.push(this.rowEl(e))
      if (data.you && !data.top.some((e) => e.isYou)) {
        rows.push(h('div', { class: 'lb-gap' }, '…'))
        for (const e of data.around) rows.push(this.rowEl(e))
      }
      this.list.replaceChildren(...rows)
    } catch {
      if (id !== this.reqId) return
      this.list.replaceChildren(
        h(
          'div',
          { class: 'lb-msg error', 'data-testid': 'lb-offline' },
          'Leaderboard offline. Your personal bests are saved on this device.',
        ),
      )
    }
  }
}
