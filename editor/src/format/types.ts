import type { LoopMode } from '../generated/shared'

export interface PixelsLayer {
  id: string
  type: 'pixels'
  /** base64 of MATRIX_CELLS bytes, row-major, 0-255 brightness. */
  data: string
}

/** A layer type this version does not understand. Kept verbatim so later phases/other versions round-trip. */
export interface UnknownLayer {
  id: string
  type: string
  [key: string]: unknown
}

export type Layer = PixelsLayer | UnknownLayer

export interface Frame {
  id: string
  durationMs: number
  layers: Layer[]
}

export interface Design {
  format: number
  id: string
  name: string
  created: number
  modified: number
  matrix: { w: number; h: number }
  anim: { loop: LoopMode }
  frames: Frame[]
}

export function isPixelsLayer(l: Layer): l is PixelsLayer {
  return l.type === 'pixels' && typeof l.data === 'string'
}
