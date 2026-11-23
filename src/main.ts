import { Game } from './core/game'
import { readParams } from './core/params'
import { load } from './core/save'
import { UI } from './ui/ui'

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function main(): void {
  const params = readParams()
  const root = document.getElementById('ui')
  const container = document.getElementById('game')
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null
  if (!root || !container || !canvas) return
  load()
  if (!webglAvailable()) {
    root.textContent = 'Pocket Rally needs WebGL. Please try a different browser or device.'
    root.className = 'fatal'
    return
  }
  const game = new Game(container, canvas, params)
  const ui = new UI(root, game, { embed: params.embed, debug: params.debug })
  game.attachUI(ui)
  game.start()
  if (params.level && params.autostart) {
    void game.startLevel(params.level)
  } else {
    game.showTitle()
  }
  // Handy for tests and debugging.
  ;(window as unknown as { __pocketRally: Game }).__pocketRally = game
}

main()
