import { MATRIX_SIZE } from '../generated/shared'
import type { Point } from './matrix'

/** Zoom and pan of the canvas. pan is in CSS pixels, measured from the centred position. */
export interface View {
  zoom: number
  panX: number
  panY: number
}

export interface Size {
  w: number
  h: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8
export const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }

/** Margin kept around the grid at zoom 1, as a fraction of a cell. */
const MARGIN_CELLS = 0.5

/** Size of one cell in CSS pixels at zoom 1 so the whole grid fits with a small margin. */
export function baseCellSize(canvas: Size): number {
  return Math.min(canvas.w, canvas.h) / (MATRIX_SIZE + MARGIN_CELLS * 2)
}

export function cellSize(canvas: Size, view: View): number {
  return baseCellSize(canvas) * view.zoom
}

/** Top-left corner of the grid in canvas CSS pixels. */
export function gridOrigin(canvas: Size, view: View): Point {
  const total = cellSize(canvas, view) * MATRIX_SIZE
  return { x: (canvas.w - total) / 2 + view.panX, y: (canvas.h - total) / 2 + view.panY }
}

/** The grid cell under a canvas position, or null when the position is outside the grid. */
export function cellAt(px: number, py: number, canvas: Size, view: View): Point | null {
  const size = cellSize(canvas, view)
  const o = gridOrigin(canvas, view)
  const x = Math.floor((px - o.x) / size)
  const y = Math.floor((py - o.y) / size)
  return x >= 0 && y >= 0 && x < MATRIX_SIZE && y < MATRIX_SIZE ? { x, y } : null
}

/** Like cellAt, but clamps to the nearest edge cell so a drag that leaves the grid keeps its end point sensible. */
export function nearestCell(px: number, py: number, canvas: Size, view: View): Point {
  const size = cellSize(canvas, view)
  const o = gridOrigin(canvas, view)
  const clamp = (n: number) => Math.min(MATRIX_SIZE - 1, Math.max(0, n))
  return { x: clamp(Math.floor((px - o.x) / size)), y: clamp(Math.floor((py - o.y) / size)) }
}

/** Keep at least a third of the grid on screen so it can never be panned out of reach. */
export function clampView(view: View, canvas: Size): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom))
  const total = baseCellSize(canvas) * zoom * MATRIX_SIZE
  const limitX = total / 2 + canvas.w / 2 - total / 3
  const limitY = total / 2 + canvas.h / 2 - total / 3
  return {
    zoom,
    panX: Math.min(limitX, Math.max(-limitX, view.panX)),
    panY: Math.min(limitY, Math.max(-limitY, view.panY)),
  }
}

/** Zoom by [factor] keeping the canvas point (fx, fy) fixed under the fingers/cursor. */
export function zoomAt(view: View, factor: number, fx: number, fy: number, canvas: Size): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
  if (zoom === view.zoom) return view
  const before = gridOrigin(canvas, view)
  const sizeBefore = cellSize(canvas, view)
  const gx = (fx - before.x) / sizeBefore // grid coordinate under the focus, in cells
  const gy = (fy - before.y) / sizeBefore
  const sizeAfter = baseCellSize(canvas) * zoom
  const totalAfter = sizeAfter * MATRIX_SIZE
  // Choose pan so that the same grid coordinate stays under (fx, fy).
  const panX = fx - gx * sizeAfter - (canvas.w - totalAfter) / 2
  const panY = fy - gy * sizeAfter - (canvas.h - totalAfter) / 2
  return clampView({ zoom, panX, panY }, canvas)
}

export function panBy(view: View, dx: number, dy: number, canvas: Size): View {
  return clampView({ ...view, panX: view.panX + dx, panY: view.panY + dy }, canvas)
}
