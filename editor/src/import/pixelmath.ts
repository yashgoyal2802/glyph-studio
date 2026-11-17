import { SWATCHES } from '../core/brightness'
import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'

/** A picture as RGBA bytes (4 per pixel, row by row). */
export interface Rgba {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

// ---- cropping -------------------------------------------------------------------------------------------------

export type CropMode = 'fit' | 'fill' | 'manual'

export interface Crop {
  mode: CropMode
  /** Manual only: 1 = the "fill" crop, 2 = twice as close, 0.5 = twice as far (shows empty space around the picture). */
  zoom: number
  /** Manual only: shift of the crop window as a fraction of its size (-1..1). */
  panX: number
  panY: number
}

export const DEFAULT_CROP: Crop = { mode: 'fit', zoom: 1, panX: 0, panY: 0 }
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 8

/** The square window of the picture that will be shown on the matrix: its centre and side, in picture pixels. */
export interface CropBox {
  cx: number
  cy: number
  size: number
}

export function cropBox(width: number, height: number, crop: Crop): CropBox {
  const cx = width / 2
  const cy = height / 2
  switch (crop.mode) {
    case 'fit': // the whole picture is visible; the shorter side gets empty (dark) margins
      return { cx, cy, size: Math.max(width, height) }
    case 'fill': // the matrix is completely covered; the longer side is cut off
      return { cx, cy, size: Math.min(width, height) }
    case 'manual': {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom || 1))
      const size = Math.min(width, height) / zoom
      return { cx: cx + crop.panX * size, cy: cy + crop.panY * size, size }
    }
  }
}

// ---- picture -> 25x25 brightness --------------------------------------------------------------------------------

/**
 * The picture inside [box], shrunk to the 25x25 grid by averaging all the pixels each cell covers (so thin lines and
 * detail blend instead of being skipped). Colour becomes brightness (0-255); transparent pixels count as dark, and so
 * does any part of the window that lies outside the picture.
 */
export function luminanceGrid(img: Rgba, box: CropBox): Float32Array {
  const out = new Float32Array(MATRIX_CELLS)
  const { data, width: w, height: h } = img
  const cell = box.size / MATRIX_SIZE
  const left = box.cx - box.size / 2
  const top = box.cy - box.size / 2
  const area = cell * cell
  for (let gy = 0; gy < MATRIX_SIZE; gy++) {
    const y0 = top + gy * cell
    const y1 = y0 + cell
    for (let gx = 0; gx < MATRIX_SIZE; gx++) {
      const x0 = left + gx * cell
      const x1 = x0 + cell
      let sum = 0
      for (let py = Math.max(0, Math.floor(y0)); py < Math.min(h, Math.ceil(y1)); py++) {
        const wy = Math.min(py + 1, y1) - Math.max(py, y0)
        if (wy <= 0) continue
        for (let px = Math.max(0, Math.floor(x0)); px < Math.min(w, Math.ceil(x1)); px++) {
          const wx = Math.min(px + 1, x1) - Math.max(px, x0)
          if (wx <= 0) continue
          const i = (py * w + px) * 4
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          sum += lum * (data[i + 3] / 255) * wx * wy
        }
      }
      out[gy * MATRIX_SIZE + gx] = sum / area
    }
  }
  return out
}

// ---- brightness controls -----------------------------------------------------------------------------------------

export type Levels = 'full' | 'eight' | 'bw'

export interface Adjust {
  /** -100..100, added to every cell. */
  brightness: number
  /** -100..100, spreads values away from (or squeezes them toward) the middle grey. */
  contrast: number
  invert: boolean
  /** full = every value 0-255; eight = snap to the 8 swatch levels; bw = only off or full, split at [threshold]. */
  levels: Levels
  /** 0-255, used when levels is 'bw'. */
  threshold: number
}

export const DEFAULT_ADJUST: Adjust = { brightness: 0, contrast: 0, invert: false, levels: 'full', threshold: 128 }

/** Apply the brightness controls and produce the finished frame: 625 values, 0 on cells without an LED. */
export function toBrightness(lum: ArrayLike<number>, adj: Adjust): Uint8Array {
  const out = new Uint8Array(MATRIX_CELLS)
  const c = Math.max(-100, Math.min(100, adj.contrast)) * 2.55
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  const shift = Math.max(-100, Math.min(100, adj.brightness)) * 2.55
  for (let i = 0; i < MATRIX_CELLS; i++) {
    if (!LED_MASK[i]) continue
    let v = lum[i] + shift
    v = factor * (v - 128) + 128
    v = Math.max(0, Math.min(255, v))
    if (adj.invert) v = 255 - v
    switch (adj.levels) {
      case 'full': v = Math.round(v); break
      case 'eight': v = SWATCHES[Math.round((v / 255) * (SWATCHES.length - 1))]; break
      case 'bw': v = v >= adj.threshold ? 255 : 0; break
    }
    out[i] = v
  }
  return out
}

/** Whole pipeline for one picture: crop, shrink, adjust. */
export function pictureToFrame(img: Rgba, crop: Crop, adj: Adjust): Uint8Array {
  return toBrightness(luminanceGrid(img, cropBox(img.width, img.height, crop)), adj)
}

// ---- shrinking large pictures (used while decoding GIF frames, to keep memory small) --------------------------------

/** Shrink so the longer side is at most [maxSide], averaging the covered pixels (alpha-weighted). Returns img if small enough. */
export function downscale(img: Rgba, maxSide: number): Rgba {
  const longest = Math.max(img.width, img.height)
  if (longest <= maxSide) return img
  const scale = maxSide / longest
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const out = new Uint8ClampedArray(w * h * 4)
  const sx = img.width / w
  const sy = img.height / h
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil((y + 1) * sy)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil((x + 1) * sx)))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * img.width + px) * 4
          const alpha = img.data[i + 3]
          r += img.data[i] * alpha; g += img.data[i + 1] * alpha; b += img.data[i + 2] * alpha; a += alpha; n++
        }
      }
      const o = (y * w + x) * 4
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a }
      out[o + 3] = a / n
    }
  }
  return { data: out, width: w, height: h }
}
