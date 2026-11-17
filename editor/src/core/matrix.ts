import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'

export interface Point {
  x: number
  y: number
}

/** Row-major cell index. */
export const idx = (x: number, y: number): number => y * MATRIX_SIZE + x

export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MATRIX_SIZE && y < MATRIX_SIZE

/** True when the cell exists on the grid AND has a physical LED. */
export const isLed = (x: number, y: number): boolean => inBounds(x, y) && LED_MASK[idx(x, y)] === 1

export const isLedIndex = (i: number): boolean => i >= 0 && i < MATRIX_CELLS && LED_MASK[i] === 1

export const pointOf = (i: number): Point => ({ x: i % MATRIX_SIZE, y: Math.floor(i / MATRIX_SIZE) })
