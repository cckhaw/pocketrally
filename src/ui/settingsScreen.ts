import { load, persist, sanitizeNickname, type InputMode, type QualitySetting } from '../core/save'
import { validateNickname } from '../net/nickname'
import { h } from './dom'
import type { GameApi } from './types'

function row(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'setting' }, h('span', {}, label), control)
}

function select<T extends string>(
  value: T,
  options: [T, string][],
  onChange: (v: T) => void,
  testId?: string,
): HTMLSelectElement {
  const s = h(
    'select',
    { 'data-testid': testId ?? '' },
    ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
  )
  s.addEventListener('change', () => onChange(s.value as T))
  return s
}

export class SettingsScreen {
  readonly el = h('div', { class: 'screen settings hidden', 'data-testid': 'settings' })
  private api: GameApi
  private onClose: () => void

  constructor(api: GameApi, onClose: () => void) {
    this.api = api
    this.onClose = onClose
  }

  open(): void {
    this.render()
    this.el.classList.remove('hidden')
  }

  close(): void {
    this.el.classList.add('hidden')
  }

  private render(): void {
    const s = load().settings
    const save = (): void => {
      persist()
      this.api.settingsChanged()
    }
    const msg = h('div', { class: 'setting-msg' })
    const nick = h('input', {
      type: 'text',
      maxlength: 16,
      value: s.nickname,
      placeholder: '3-16 characters',
      'data-testid': 'nickname',
      autocomplete: 'off',
    })
    nick.addEventListener('change', () => {
      const raw = sanitizeNickname(nick.value)
      if (raw === '') {
        s.nickname = ''
        msg.textContent = ''
        save()
        return
      }
      const r = validateNickname(raw)
      if (r.ok) {
        s.nickname = r.nickname
        msg.textContent = 'Saved'
        save()
      } else msg.textContent = r.reason
    })
    const slider = (
      value: number,
      min: number,
      max: number,
      step: number,
      on: (v: number) => void,
    ): HTMLInputElement => {
      const i = h('input', { type: 'range', min, max, step, value })
      i.addEventListener('input', () => on(Number(i.value)))
      i.addEventListener('change', save)
      return i
    }
    const toggle = (value: boolean, on: (v: boolean) => void): HTMLInputElement => {
      const i = h('input', { type: 'checkbox', checked: value, class: 'switch' })
      i.addEventListener('change', () => {
        on(i.checked)
        save()
      })
      return i
    }
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel wide', 'data-ui': '' },
        h('h2', {}, 'Settings'),
        h(
          'div',
          { class: 'settings-grid' },
          row('Nickname', nick),
          h('div', { class: 'setting-msg-row' }, msg),
          row(
            'Controls',
            select<InputMode>(
              s.inputMode,
              [
                ['auto', 'Auto-detect'],
                ['touch', 'Touch'],
                ['tilt', 'Tilt'],
                ['mouse', 'Mouse'],
                ['keyboard', 'Keyboard'],
                ['gamepad', 'Gamepad'],
              ],
              (v) => {
                s.inputMode = v
                if (v === 'tilt')
                  void this.api.requestTilt().then((ok) => {
                    msg.textContent = ok ? 'Tilt enabled' : 'Tilt permission denied or unavailable'
                  })
                save()
              },
              'input-mode',
            ),
          ),
          row(
            'Touch style',
            select(
              s.touchStyle,
              [
                ['drag', 'Drag anywhere'],
                ['zones', 'Left / right zones'],
              ],
              (v) => {
                s.touchStyle = v
                save()
              },
            ),
          ),
          row(
            'Sensitivity',
            slider(s.sensitivity, 0.5, 1.8, 0.05, (v) => {
              s.sensitivity = v
            }),
          ),
          row(
            'Volume',
            slider(s.volume, 0, 1, 0.05, (v) => {
              s.volume = v
              this.api.settingsChanged()
            }),
          ),
          row(
            'Quality',
            select<QualitySetting>(
              s.quality,
              [
                ['auto', 'Auto'],
                ['low', 'Low'],
                ['med', 'Medium'],
                ['high', 'High'],
              ],
              (v) => {
                s.quality = v
                save()
              },
              'quality',
            ),
          ),
          row(
            'Haptics',
            toggle(s.haptics, (v) => {
              s.haptics = v
            }),
          ),
          row(
            'Reduced motion',
            toggle(s.reducedMotion, (v) => {
              s.reducedMotion = v
            }),
          ),
        ),
        h(
          'button',
          {
            class: 'btn primary',
            'data-testid': 'close-settings',
            onclick: () => {
              this.close()
              this.onClose()
            },
          },
          'Done',
        ),
      ),
    )
  }
}
