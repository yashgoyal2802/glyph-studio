import { MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { idx, inBounds, isLed, type Point } from './matrix'

/** Cells on the straight line between two cells, both ends included (Bresenham). */
export function linePoints(a: Point, b: Point): Point[] {
  const out: Point[] = []
  let x = a.x
  let y = a.y
  const dx = Math.abs(b.x - a.x)
  const dy = -Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1
  const sy = a.y < b.y ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push({ x, y })
    if (x === b.x && y === b.y) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return out
}

function bounds(a: Point, b: Point) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

/** Rectangle spanning two corner cells, as an outline or filled. */
export function rectPoints(a: Point, b: Point, filled: boolean): Point[] {
  const { x0, y0, x1, y1 } = bounds(a, b)
  const out: Point[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y })
    }
  }
  return out
}

/**
 * Ellipse inscribed in the box spanned by two corner cells (a circle when the box is square), as an outline or filled.
 * A cell is inside when its centre is inside the ellipse; the outline is the inside cells touching an outside cell,
 * which gives a closed, one-cell-thick ring that is symmetric on every axis the box is.
 */
export function ellipsePoints(a: Point, b: Point, filled: boolean): Point[] {
  const { x0, y0, x1, y1 } = bounds(a, b)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w <= 2 || h <= 2) return rectPoints(a, b, true) // too small to have a hollow middle
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = w / 2
  const ry = h / 2
  const inside = (x: number, y: number) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    return nx * nx + ny * ny <= 1
  }
  const out: Point[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) out.push({ x, y })
    }
  }
  return out
}

/**
 * Cells reached by flood fill from [start]: every 4-connected LED cell holding the same value as the start cell.
 * Returns [] when the start has no LED or already holds [value] (nothing to change).
 */
export function floodFillPoints(pixels: ArrayLike<number>, start: Point, value: number): Point[] {
  if (!isLed(start.x, start.y)) return []
  const target = pixels[idx(start.x, start.y)]
  if (target === value) return []
  const seen = new Uint8Array(MATRIX_CELLS)
  const stack: number[] = [idx(start.x, start.y)]
  seen[stack[0]] = 1
  const out: Point[] = []
  while (stack.length) {
    const i = stack.pop()!
    const x = i % MATRIX_SIZE
    const y = (i - x) / MATRIX_SIZE
    out.push({ x, y })
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!inBounds(nx, ny) || !isLed(nx, ny)) continue
      const n = idx(nx, ny)
      if (seen[n] || pixels[n] !== target) continue
      seen[n] = 1
      stack.push(n)
    }
  }
  return out
}

export interface Symmetry {
  /** Mirror left-right across the vertical centre line. */
  x: boolean
  /** Mirror top-bottom across the horizontal centre line. */
  y: boolean
}

export const NO_SYMMETRY: Symmetry = { x: false, y: false }

/** The point itself plus its mirror images for the active axes (no duplicates). */
export function withSymmetry(p: Point, s: Symmetry): Point[] {
  const out: Point[] = [p]
  const last = MATRIX_SIZE - 1
  if (s.x) out.push({ x: last - p.x, y: p.y })
  if (s.y) out.push({ x: p.x, y: last - p.y })
  if (s.x && s.y) out.push({ x: last - p.x, y: last - p.y })
  const seen = new Set<number>()
  return out.filter((q) => {
    const k = q.y * 1000 + q.x
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
