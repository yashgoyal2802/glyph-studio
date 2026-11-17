import { diffPixels } from './stroke'
import { pixelsLayerOf, type EDesign } from './model'
import type { Op } from './ops'

/** Brightness fades across a run of frames. Only the editor computes them; the result is plain setPixels operations. */
export type FadePreset = 'in' | 'out' | 'inOut'
export type FadeRange = 'all' | 'fromHere' | 'toHere'

export const FADE_PRESETS: readonly { id: FadePreset; label: string }[] = [
  { id: 'in', label: 'Fade in' },
  { id: 'out', label: 'Fade out' },
  { id: 'inOut', label: 'In and out' },
]

export const FADE_RANGES: readonly { id: FadeRange; label: string }[] = [
  { id: 'all', label: 'All frames' },
  { id: 'fromHere', label: 'From this frame on' },
  { id: 'toHere', label: 'Up to this frame' },
]

/** How bright frame [j] of [n] should be, 0 to 1. Changes evenly from frame to frame. */
export function fadeFactor(preset: FadePreset, j: number, n: number): number {
  const t = n <= 1 ? 1 : j / (n - 1)
  if (preset === 'in') return t
  if (preset === 'out') return 1 - t
  return 1 - Math.abs(2 * t - 1)
}

/** Scale one pixel: off stays off, and a lit pixel stays at least 1 until its factor reaches 0 (so a fade does not blank early). */
export function fadeValue(v: number, factor: number): number {
  if (v <= 0 || factor <= 0) return 0
  return Math.max(1, Math.min(255, Math.round(v * factor)))
}

export type FadeResult = { ops: Op[]; error?: undefined } | { ops?: undefined; error: string }

/** The operations that apply [preset] to the frames of [range] (around [currentFrameId]). All of them make one history entry when performed together. */
export function fadeOps(design: EDesign, preset: FadePreset, range: FadeRange, currentFrameId: string): FadeResult {
  const cur = design.frames.findIndex((f) => f.id === currentFrameId)
  const from = range === 'fromHere' ? Math.max(0, cur) : 0
  const to = range === 'toHere' ? Math.max(0, cur) : design.frames.length - 1
  const frames = design.frames.slice(from, to + 1)
  const min = preset === 'inOut' ? 3 : 2
  if (frames.length < min) {
    return { error: preset === 'inOut' ? 'A fade in and out needs at least three frames.' : 'A fade needs at least two frames. Add frames first, or pick a bigger range.' }
  }
  const ops: Op[] = []
  frames.forEach((frame, j) => {
    const layer = pixelsLayerOf(frame)
    if (!layer) return
    const factor = fadeFactor(preset, j, frames.length)
    const faded = layer.pixels.map((v) => fadeValue(v, factor))
    const change = diffPixels(layer.pixels, faded)
    if (change) ops.push({ t: 'setPixels', frameId: frame.id, layerId: layer.id, indices: change.indices, values: change.after })
  })
  if (!ops.length) return { error: 'Nothing to fade: the frames in this range are already at the result.' }
  return { ops }
}
