import { MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { glyphFor, type PixelFont } from './fonts'
import { composeFloating, type Floating } from './selection'

/** The most frames one design may hold (the same cap as GIF import). */
export const MAX_DESIGN_FRAMES = 300

export interface TextBitmap {
  w: number
  h: number
  /** 255-scaled on/off per cell, row by row: 1 = lit, 0 = dark. Brightness is applied when it is placed. */
  lit: Uint8Array
  /** How many characters the font could not draw (shown as placeholders). */
  missing: number
}

/** Text as a bitmap, one font, with [font.gap] dark columns between letters. Newlines are ignored; the text is one line. */
export function renderText(text: string, font: PixelFont): TextBitmap {
  const chars = [...text.replace(/[\r\n]+/g, ' ')]
  const cols: { rows: string[]; blank: number }[] = []
  let missing = 0
  for (const ch of chars) {
    if (ch === ' ') { cols.push({ rows: [], blank: font.space }); continue }
    const g = glyphFor(font, ch)
    if (!g.known) missing++
    cols.push({ rows: g.rows, blank: 0 })
  }
  let w = 0
  cols.forEach((c, i) => { w += (c.rows.length ? c.rows[0].length : c.blank) + (i < cols.length - 1 ? font.gap : 0) })
  const h = font.height
  const lit = new Uint8Array(Math.max(0, w) * h)
  let x = 0
  cols.forEach((c, i) => {
    const gw = c.rows.length ? c.rows[0].length : c.blank
    for (let y = 0; y < c.rows.length; y++) for (let k = 0; k < gw; k++) if (c.rows[y][k] === '#') lit[y * w + x + k] = 1
    x += gw + (i < cols.length - 1 ? font.gap : 0)
  })
  return { w, h, lit, missing }
}

/** The bitmap as selectable pixels at (x, y), lit cells at [brightness], so the editor can drag it before confirming. */
export function textFloating(bitmap: TextBitmap, brightness: number, x: number, y: number): Floating | null {
  if (bitmap.w === 0) return null
  const values = new Uint8Array(bitmap.lit.length)
  for (let i = 0; i < values.length; i++) values[i] = bitmap.lit[i] ? brightness : 0
  return { x, y, w: bitmap.w, h: bitmap.h, values, covered: new Uint8Array(values.length).fill(1) }
}

/** [base] with the text drawn on top (lit cells only; cells off the grid or without an LED are dropped). */
export function drawText(base: Uint8Array, bitmap: TextBitmap, brightness: number, x: number, y: number): Uint8Array {
  const f = textFloating(bitmap, brightness, x, y)
  return f ? composeFloating(base, null, f) : base
}

/** Row at which text of [height] sits vertically centred. */
export const centredY = (height: number): number => Math.floor((MATRIX_SIZE - height) / 2)

export type ScrollDirection = 'rtl' | 'ltr'

/**
 * Speed is how far the text moves each frame and how long a frame shows. The matrix cannot redraw much faster than about
 * 12 times a second, so Fast moves two pixels per frame instead of shortening the frame further.
 */
export const SCROLL_SPEEDS = [
  { id: 'slow', label: 'Slow', durationMs: 160, step: 1 },
  { id: 'medium', label: 'Medium', durationMs: 80, step: 1 },
  { id: 'fast', label: 'Fast', durationMs: 80, step: 2 },
] as const
export type ScrollSpeedId = (typeof SCROLL_SPEEDS)[number]['id']

export interface ScrollResult {
  /** One 625-cell frame per step, or empty when it did not fit. */
  frames: Uint8Array[]
  durationMs: number
  /** Set when nothing was generated. */
  error?: string
}

/**
 * A marquee: the text moves one or two pixels per frame across the whole matrix. Right to left it starts just off the right
 * edge and ends once the last letter has left at the left; left to right is the mirror. The text is fully off the grid
 * in the first frame and the step after the last frame would be that same blank frame again, so a looping design shows
 * no jump.
 */
export function scrollFrames(
  bitmap: TextBitmap, brightness: number, direction: ScrollDirection, speed: ScrollSpeedId,
  existingFrames: number, y = centredY(bitmap.h),
): ScrollResult {
  const preset = SCROLL_SPEEDS.find((s) => s.id === speed) ?? SCROLL_SPEEDS[1]
  const { durationMs, step } = preset
  if (bitmap.w === 0) return { frames: [], durationMs, error: 'Type some text first.' }
  const count = Math.ceil((MATRIX_SIZE + bitmap.w) / step)
  if (existingFrames + count > MAX_DESIGN_FRAMES) {
    return { frames: [], durationMs, error: `This scroll needs ${count} frames, but a design can hold ${MAX_DESIGN_FRAMES} and this one has ${existingFrames}. Use a shorter text or a smaller font.` }
  }
  const blank = new Uint8Array(MATRIX_CELLS)
  const frames: Uint8Array[] = []
  for (let k = 0; k < count; k++) {
    const x = direction === 'rtl' ? MATRIX_SIZE - k * step : -bitmap.w + k * step
    frames.push(drawText(blank, bitmap, brightness, x, y))
  }
  return { frames, durationMs }
}
