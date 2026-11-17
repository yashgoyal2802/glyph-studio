import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { idx, inBounds, isLed, type Point } from './matrix'
import { linePoints } from './raster'
import { diffPixels, type PixelChange } from './stroke'

/**
 * Selecting part of a frame and moving, flipping, rotating, copying and pasting it.
 * Everything here is plain data in, plain data out: the editor holds a [SelectionState] while the user works and only
 * the finished result (a [PixelChange]) is ever sent to the phone, as one undoable action.
 */

/** One flag per matrix cell, 1 = selected. Cells without an LED are never selected. */
export type Mask = Uint8Array

export const emptyMask = (): Mask => new Uint8Array(MATRIX_CELLS)

export const maskSize = (m: Mask): number => {
  let n = 0
  for (let i = 0; i < m.length; i++) if (m[i]) n++
  return n
}

/** Every cell in the rectangle spanned by the two corners (either order) that has an LED. */
export function rectMask(a: Point, b: Point): Mask {
  const m = emptyMask()
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isLed(x, y)) m[idx(x, y)] = 1
  return m
}

/**
 * A freehand selection: the cells along the path plus everything the path encloses (the end is joined back to the
 * start). Enclosed means the cell's centre lies inside the outline.
 */
export function lassoMask(path: Point[]): Mask {
  const m = emptyMask()
  if (path.length === 0) return m
  const mark = (p: Point) => { if (isLed(p.x, p.y)) m[idx(p.x, p.y)] = 1 }
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length]
    for (const p of linePoints(a, b)) mark(p)
  }
  if (path.length < 3) return m
  for (let y = 0; y < MATRIX_SIZE; y++) {
    const yc = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length]
      const ay = a.y + 0.5, by = b.y + 0.5
      if ((ay <= yc) !== (by <= yc)) xs.push(a.x + 0.5 + ((yc - ay) / (by - ay)) * (b.x - a.x))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) if (isLed(x, y)) m[idx(x, y)] = 1
    }
  }
  return m
}

/** Selected pixels, lifted out of a frame: a box of values placed at (x, y), and which cells of the box belong to it. */
export interface Floating {
  x: number
  y: number
  w: number
  h: number
  /** Brightness of each cell in the box, row by row. */
  values: Uint8Array
  /** 1 where the cell is part of the selection (its value may still be 0). */
  covered: Uint8Array
}

/** Copy the selected cells out of [pixels]. Null when nothing is selected. */
export function copyFloating(pixels: Uint8Array, mask: Mask): Floating | null {
  let x0 = MATRIX_SIZE, y0 = MATRIX_SIZE, x1 = -1, y1 = -1
  for (let i = 0; i < MATRIX_CELLS; i++) {
    if (!mask[i]) continue
    const x = i % MATRIX_SIZE, y = Math.floor(i / MATRIX_SIZE)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x)
    y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  if (x1 < 0) return null
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const values = new Uint8Array(w * h), covered = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x0 + x, y0 + y)
      if (mask[i]) { covered[y * w + x] = 1; values[y * w + x] = pixels[i] }
    }
  }
  return { x: x0, y: y0, w, h, values, covered }
}

export const moveFloating = (f: Floating, dx: number, dy: number): Floating => ({ ...f, x: f.x + dx, y: f.y + dy })

export function flipFloating(f: Floating, axis: 'horizontal' | 'vertical'): Floating {
  const values = new Uint8Array(f.w * f.h), covered = new Uint8Array(f.w * f.h)
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const sx = axis === 'horizontal' ? f.w - 1 - x : x
      const sy = axis === 'vertical' ? f.h - 1 - y : y
      values[y * f.w + x] = f.values[sy * f.w + sx]
      covered[y * f.w + x] = f.covered[sy * f.w + sx]
    }
  }
  return { ...f, values, covered }
}

/**
 * Rotate by 90 degrees about the centre of the box. When the box's width and height differ by an odd number the centre
 * falls between cells, so the box shifts half a cell: clockwise rounds one way and counter-clockwise the other, which
 * makes a clockwise turn followed by a counter-clockwise turn land exactly where it started.
 */
export function rotateFloating(f: Floating, direction: 'clockwise' | 'counterclockwise'): Floating {
  const w = f.h, h = f.w
  const values = new Uint8Array(w * h), covered = new Uint8Array(w * h)
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const nx = direction === 'clockwise' ? f.h - 1 - y : y
      const ny = direction === 'clockwise' ? x : f.w - 1 - x
      values[ny * w + nx] = f.values[y * f.w + x]
      covered[ny * w + nx] = f.covered[y * f.w + x]
    }
  }
  const d = f.w - f.h
  const shift = direction === 'clockwise' ? Math.floor(d / 2) : Math.ceil(d / 2)
  return { x: f.x + shift, y: f.y - shift, w, h, values, covered }
}

/** The floating pixels written over [base], skipping cells off the grid or without an LED and cells that are off. */
function overlay(base: Uint8Array, f: Floating): Uint8Array {
  const out = base.slice()
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const v = f.values[y * f.w + x]
      if (!f.covered[y * f.w + x] || v === 0) continue
      const gx = f.x + x, gy = f.y + y
      if (isLed(gx, gy)) out[idx(gx, gy)] = v
    }
  }
  return out
}

/** [base] with the [source] cells switched off and [floating] (if any) placed on top. */
export function composeFloating(base: Uint8Array, source: Mask | null, floating: Floating | null): Uint8Array {
  let out = base
  if (source) {
    out = base.slice()
    for (let i = 0; i < MATRIX_CELLS; i++) if (source[i]) out[i] = 0
  }
  return floating ? overlay(out, floating) : out
}

/** Where the floating pixels' selection outline lies on the grid (cells outside the matrix are dropped). */
export function floatingMask(f: Floating): Mask {
  const m = emptyMask()
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const gx = f.x + x, gy = f.y + y
      if (f.covered[y * f.w + x] && inBounds(gx, gy) && LED_MASK[idx(gx, gy)]) m[idx(gx, gy)] = 1
    }
  }
  return m
}

/**
 * The editor's selection for the frame being edited.
 *
 *  - [select] picks cells. Nothing changes in the frame yet.
 *  - [liftAndMove] / [flip] / [rotate] act on the selection. While [dragging] the pixels are only held here (a "floating"
 *    copy), so the phone never sees a half-moved picture. [commit] turns the result into ONE [PixelChange].
 *  - [pastePixels] brings in copied pixels as a floating selection that stays loose until [commit], so the user can
 *    position it first.
 */
export class SelectionState {
  /** Cells currently selected (in the frame, when nothing is lifted; the outline of the floating pixels otherwise). */
  private mask: Mask = emptyMask()
  /** Cells that will be switched off when the floating pixels are committed (where they were lifted from). */
  private source: Mask | null = null
  private floating: Floating | null = null
  /** True when the floating pixels came from a paste: flips and rotations then stay loose instead of committing at once. */
  private pasted = false

  get hasSelection(): boolean {
    return this.floating !== null || maskSize(this.mask) > 0
  }

  /** True while there are pixels held back from the frame. */
  get isFloating(): boolean {
    return this.floating !== null
  }

  /** Top-left of the floating pixels on the grid, or null when nothing is floating. */
  get position(): { x: number; y: number } | null {
    return this.floating ? { x: this.floating.x, y: this.floating.y } : null
  }

  get isPasting(): boolean {
    return this.pasted
  }

  select(mask: Mask) {
    this.mask = mask
    this.source = null
    this.floating = null
    this.pasted = false
  }

  /** Drop the selection. Floating pixels that were not committed are lost; call [commit] first to keep them. */
  clear() {
    this.select(emptyMask())
  }

  /** Give up a move that was interrupted: put the lifted pixels back and keep the original selection. A paste stays loose. */
  dropFloating() {
    if (!this.floating || this.pasted) return
    this.mask = this.source ?? this.mask
    this.floating = null
    this.source = null
  }

  /** The cells to outline on the canvas. */
  outline(): Mask {
    return this.floating ? floatingMask(this.floating) : this.mask
  }

  /** The frame as it should look right now: the selection lifted out and floating pixels shown at their position. */
  preview(base: Uint8Array): Uint8Array {
    return composeFloating(base, this.source, this.floating)
  }

  /** Copy of the selected pixels for the clipboard (what is floating, or the selected cells of [base]). */
  copy(base: Uint8Array): Floating | null {
    return this.floating ?? copyFloating(base, this.mask)
  }

  /** Start moving: lift the selection out of [base]. Does nothing if it is already lifted or nothing is selected. */
  lift(base: Uint8Array) {
    if (this.floating) return
    const f = copyFloating(base, this.mask)
    if (!f) return
    this.floating = f
    this.source = this.mask
  }

  /** Move the lifted pixels by (dx, dy) cells. Lifts first if needed. */
  moveBy(base: Uint8Array, dx: number, dy: number) {
    this.lift(base)
    if (this.floating) this.floating = moveFloating(this.floating, dx, dy)
  }

  /** Bring in pixels from the clipboard, placed with its top-left at (x, y), and keep them loose until [commit]. */
  pastePixels(f: Floating, x: number, y: number) {
    this.mask = emptyMask()
    this.source = null
    this.floating = { ...f, x, y }
    this.pasted = true
  }

  /** Flip. A pasted selection stays loose; a selection in the frame is committed at once as its own action. */
  flip(base: Uint8Array, axis: 'horizontal' | 'vertical'): PixelChange | null {
    return this.transform(base, (f) => flipFloating(f, axis))
  }

  rotate(base: Uint8Array, direction: 'clockwise' | 'counterclockwise'): PixelChange | null {
    return this.transform(base, (f) => rotateFloating(f, direction))
  }

  private transform(base: Uint8Array, change: (f: Floating) => Floating): PixelChange | null {
    this.lift(base)
    if (!this.floating) return null
    this.floating = change(this.floating)
    return this.pasted ? null : this.commit(base)
  }

  /**
   * Turn the lifted pixels into a change to the frame and keep the result selected. Returns null when nothing was
   * lifted or the frame ends up the same. After this nothing is floating.
   */
  commit(base: Uint8Array): PixelChange | null {
    const f = this.floating
    if (!f) return null
    const result = composeFloating(base, this.source, f)
    this.mask = floatingMask(f)
    this.floating = null
    this.source = null
    this.pasted = false
    return diffPixels(base, result)
  }

  /** Switch off every selected cell (delete). The selection is cleared. Floating pixels are simply discarded. */
  delete(base: Uint8Array): PixelChange | null {
    const result = composeFloating(base, this.floating ? this.source : this.mask, null)
    this.clear()
    return diffPixels(base, result)
  }
}
