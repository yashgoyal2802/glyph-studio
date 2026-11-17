import { decompressFrames, parseGIF } from 'gifuct-js'
import { clampDurationMs } from '../core/ops'
import { downscale, type Rgba } from './pixelmath'

export const MAX_GIF_FRAMES = 300

export interface GifFrame {
  rgba: Rgba
  /** How long the GIF shows this frame, already clamped to what a design allows. */
  durationMs: number
}

export interface DecodedGif {
  width: number
  height: number
  frames: GifFrame[]
}

/**
 * GIF files can carry a delay of 0 or 1/100 s, meaning "as fast as possible". Every browser shows those at 10 frames
 * per second, so we do the same instead of making a flickering 16 ms animation.
 */
export function gifDelayToMs(delayMs: number): number {
  return clampDurationMs(!Number.isFinite(delayMs) || delayMs <= 10 ? 100 : delayMs)
}

/**
 * Decode every frame of a GIF into a complete picture (not just the changed rectangle), honouring transparency and the
 * "restore" rules, and shrink each one so [maxSide] is its longest side: 300 frames of a large GIF would otherwise not
 * fit in memory, and the matrix only needs 25x25.
 */
export function decodeGif(buffer: ArrayBuffer, maxSide = 160): DecodedGif {
  const gif = parseGIF(buffer)
  const parsed = decompressFrames(gif, true)
  const width = gif.lsd.width
  const height = gif.lsd.height
  const canvas = new Uint8ClampedArray(width * height * 4) // starts fully transparent
  let before: Uint8ClampedArray | null = null // canvas as it was before the previous frame (for "restore to previous")
  let previous: (typeof parsed)[number] | null = null
  const frames: GifFrame[] = []

  for (const f of parsed) {
    // First undo what the previous frame asked to be undone.
    if (previous) {
      if (previous.disposalType === 2) clearRect(canvas, width, previous.dims)
      else if (previous.disposalType === 3 && before) canvas.set(before)
    }
    before = f.disposalType === 3 ? canvas.slice() : null
    // Draw this frame's rectangle; transparent pixels leave what is already there.
    const { left, top, width: fw, height: fh } = f.dims
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const src = (y * fw + x) * 4
        if (f.patch[src + 3] === 0) continue
        const dst = ((top + y) * width + (left + x)) * 4
        if (left + x >= width || top + y >= height) continue
        canvas[dst] = f.patch[src]
        canvas[dst + 1] = f.patch[src + 1]
        canvas[dst + 2] = f.patch[src + 2]
        canvas[dst + 3] = f.patch[src + 3]
      }
    }
    frames.push({ rgba: downscale({ data: canvas.slice(), width, height }, maxSide), durationMs: gifDelayToMs(f.delay) })
    previous = f
  }
  return { width, height, frames }
}

function clearRect(canvas: Uint8ClampedArray, width: number, d: { left: number; top: number; width: number; height: number }) {
  for (let y = d.top; y < d.top + d.height; y++) {
    for (let x = d.left; x < d.left + d.width; x++) canvas.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4)
  }
}

export interface GifPlan {
  /** Which source frames to import, in order. */
  indices: number[]
  /** Frames beyond the limit that are left out. */
  dropped: number
  /** True when frames had to be cut because the GIF has more than the limit. */
  truncated: boolean
}

/**
 * Which frames of a [count]-frame GIF to import. At most [limit]. With [skipEveryOther] only every second frame is
 * taken (a quick way to fit a long GIF); otherwise a long GIF is cut after [limit] frames.
 */
export function planGifFrames(count: number, skipEveryOther: boolean, limit = MAX_GIF_FRAMES): GifPlan {
  const all = Array.from({ length: count }, (_, i) => i)
  const picked = skipEveryOther ? all.filter((i) => i % 2 === 0) : all
  const indices = picked.slice(0, limit)
  const used = skipEveryOther ? (indices.length ? indices[indices.length - 1] + 2 : 0) : indices.length
  return { indices, dropped: Math.max(0, count - Math.min(count, used)), truncated: picked.length > limit }
}

/**
 * Durations for the chosen frames. When every other frame is skipped, each kept frame also takes the time of the one
 * after it, so the animation keeps its overall speed.
 */
export function durationsForPlan(durations: number[], plan: GifPlan, skipEveryOther: boolean): number[] {
  return plan.indices.map((i) => clampDurationMs(durations[i] + (skipEveryOther ? (durations[i + 1] ?? 0) : 0)))
}
