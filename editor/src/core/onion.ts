import { MATRIX_CELLS } from '../generated/shared'
import { pixelsLayerOf, type EDesign } from './model'

export type OnionMode = 'off' | 'previous' | 'both'

export const ONION_MODES: readonly { id: OnionMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'previous', label: 'Previous' },
  { id: 'both', label: 'Prev + next' },
]

/**
 * The faint "ghost" picture drawn under the current frame so the next drawing can follow the last one.
 * This is purely for display: nothing is written into any frame. Returns undefined when there is nothing to show.
 */
export function onionPixels(design: EDesign, frameId: string, mode: OnionMode): Uint8Array | undefined {
  if (mode === 'off') return undefined
  const i = design.frames.findIndex((f) => f.id === frameId)
  if (i < 0) return undefined
  const neighbours = [design.frames[i - 1], mode === 'both' ? design.frames[i + 1] : undefined]
    .map((f) => (f ? pixelsLayerOf(f)?.pixels : undefined))
    .filter((p): p is Uint8Array => !!p)
  if (neighbours.length === 0) return undefined
  const out = new Uint8Array(MATRIX_CELLS)
  for (const px of neighbours) for (let k = 0; k < MATRIX_CELLS; k++) if (px[k] > out[k]) out[k] = px[k]
  return out
}
