import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { cellSize, DEFAULT_VIEW, gridOrigin, type Size, type View } from './viewport'

/** The few canvas calls the renderer needs; a real CanvasRenderingContext2D satisfies it, and tests can fake it. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
}

export interface Theme {
  /** Canvas background. */
  bg: string
  /** An LED that is switched off: dark but visible, so the circle's shape reads clearly. */
  ledOff: string
  /** An LED at full brightness. */
  ledOn: string
  /** Onion-skin tint for the neighbouring frame. */
  ghost: string
  /** Background tint of selected cells. */
  select: string
  /** Colour of the soft halo around lit LEDs; null for no halo. */
  glow: string | null
}

export const DARK_THEME: Theme = { bg: '#0b0b0c', ledOff: '#26262a', ledOn: '#ffffff', ghost: '#d71921', select: '#2f6bff', glow: '#ffffff' }
export const LIGHT_THEME: Theme = { bg: '#f6f6f4', ledOff: '#d5d5d0', ledOn: '#121212', ghost: '#d71921', select: '#2f6bff', glow: null }

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * Draws the circular matrix. Only LED cells are ever drawn (cells without an LED stay background), and after the
 * first draw only cells whose value changed are redrawn, so dragging a pen across the canvas stays cheap.
 */
export class MatrixRenderer {
  private size: Size = { w: 0, h: 0 }
  private dpr = 1
  private view: View = DEFAULT_VIEW
  private shown = new Int16Array(MATRIX_CELLS).fill(-1) // what is currently on the canvas (-1 = nothing yet)
  private shownGhost = new Uint8Array(MATRIX_CELLS)
  private shownSel = new Uint8Array(MATRIX_CELLS)
  private selFill = ''
  private needsFull = true
  private palette: string[] = []
  private ghostPalette: string[] = []
  private bodyPalette: string[] = []
  /** Number of cells drawn by the most recent draw(); lets tests and profiling see the dirty-cell behaviour. */
  lastDrawnCells = 0

  constructor(private readonly ctx: Ctx2D, private theme: Theme = DARK_THEME) {
    this.buildPalettes()
  }

  setTheme(theme: Theme) {
    this.theme = theme
    this.buildPalettes()
    this.needsFull = true
  }

  /** Call whenever the canvas element's CSS size or the device pixel ratio changes. */
  resize(size: Size, dpr = 1) {
    this.size = size
    this.dpr = dpr
    this.needsFull = true
  }

  setView(view: View) {
    if (view.zoom !== this.view.zoom || view.panX !== this.view.panX || view.panY !== this.view.panY) {
      this.view = view
      this.needsFull = true
    }
  }

  /** Force the next draw to repaint everything (e.g. after the canvas was cleared by the browser). */
  invalidate() {
    this.needsFull = true
  }

  /**
   * Paint [pixels] (MATRIX_CELLS brightness values). [ghost], if given, shows another frame faintly under the
   * unlit LEDs (onion skin). Returns the number of cells redrawn.
   */
  draw(pixels: ArrayLike<number>, ghost?: ArrayLike<number>, selected?: ArrayLike<number>): number {
    const { w, h } = this.size
    if (w === 0 || h === 0) return (this.lastDrawnCells = 0)
    const ctx = this.ctx
    const full = this.needsFull
    if (full) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.fillStyle = this.theme.bg
      ctx.fillRect(0, 0, w, h)
      this.shown.fill(-1)
      this.needsFull = false
    }
    const cell = cellSize(this.size, this.view)
    const o = gridOrigin(this.size, this.view)
    let drawn = 0
    for (let i = 0; i < MATRIX_CELLS; i++) {
      if (!LED_MASK[i]) continue
      const v = pixels[i] | 0
      const g = ghost ? ghost[i] | 0 : 0
      const s = selected && selected[i] ? 1 : 0
      if (!full && this.shown[i] === v && this.shownGhost[i] === g && this.shownSel[i] === s) continue
      this.shown[i] = v
      this.shownGhost[i] = g
      this.shownSel[i] = s
      const x = o.x + (i % MATRIX_SIZE) * cell
      const y = o.y + Math.floor(i / MATRIX_SIZE) * cell
      if (!full || s) {
        ctx.fillStyle = s ? this.selFill : this.theme.bg
        ctx.fillRect(x, y, cell, cell)
      }
      ctx.beginPath()
      if (v > 0 && this.bodyPalette.length) {
        // A lit LED is a slightly softer body with a brighter core, so it reads as light and not as a flat white dot.
        ctx.fillStyle = this.bodyPalette[v]
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.43, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = this.palette[v]
        ctx.beginPath()
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.31, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = v > 0 ? this.palette[v] : g > 0 ? this.ghostPalette[g] : this.palette[0]
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      drawn++
    }
    return (this.lastDrawnCells = drawn)
  }

  private buildPalettes() {
    const off = hexToRgb(this.theme.ledOff)
    const on = hexToRgb(this.theme.ledOn)
    const ghost = hexToRgb(this.theme.ghost)
    const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
      `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(',')})`
    this.palette = Array.from({ length: 256 }, (_, v) => mix(off, on, v / 255))
    // Onion skin: a dim tint of the ghost colour, never as strong as a real lit LED.
    this.selFill = mix(hexToRgb(this.theme.bg), hexToRgb(this.theme.select), 0.55)
    this.ghostPalette = Array.from({ length: 256 }, (_, v) => mix(off, ghost, (v / 255) * 0.45))
    // Dark display only: the soft body of a lit LED, a little dimmer than its core.
    this.bodyPalette = this.theme.glow
      ? Array.from({ length: 256 }, (_, v) => mix(off, on, (v / 255) * 0.78))
      : []
  }
}
