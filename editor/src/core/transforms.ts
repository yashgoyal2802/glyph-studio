import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { idx } from './matrix'

/** All the whole-frame edits return a NEW array and leave the input alone. Cells without an LED are always 0. */

export function clearPixels(): Uint8Array {
  return new Uint8Array(MATRIX_CELLS)
}

/** Move everything by (dx, dy) cells. Content pushed off the grid or onto cells without an LED is discarded. */
export function shiftPixels(src: Uint8Array, dx: number, dy: number): Uint8Array {
  const out = new Uint8Array(MATRIX_CELLS)
  for (let y = 0; y < MATRIX_SIZE; y++) {
    for (let x = 0; x < MATRIX_SIZE; x++) {
      const sx = x - dx
      const sy = y - dy
      if (sx < 0 || sy < 0 || sx >= MATRIX_SIZE || sy >= MATRIX_SIZE) continue
      if (LED_MASK[idx(x, y)]) out[idx(x, y)] = src[idx(sx, sy)]
    }
  }
  return out
}

export function flipHorizontal(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(MATRIX_CELLS)
  for (let y = 0; y < MATRIX_SIZE; y++) {
    for (let x = 0; x < MATRIX_SIZE; x++) if (LED_MASK[idx(x, y)]) out[idx(x, y)] = src[idx(MATRIX_SIZE - 1 - x, y)]
  }
  return out
}

export function flipVertical(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(MATRIX_CELLS)
  for (let y = 0; y < MATRIX_SIZE; y++) {
    for (let x = 0; x < MATRIX_SIZE; x++) if (LED_MASK[idx(x, y)]) out[idx(x, y)] = src[idx(x, MATRIX_SIZE - 1 - y)]
  }
  return out
}
