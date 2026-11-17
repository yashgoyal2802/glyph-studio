import type { LoopMode } from '../generated/shared'

/** Index of the frame shown at playback step `step` (0-based) for a design with `count` frames. */
export function frameIndexAt(step: number, count: number, mode: LoopMode): number {
  if (count <= 1) return 0
  switch (mode) {
    case 'loop':
      return step % count
    case 'once':
      return Math.min(step, count - 1)
    case 'bounce': {
      const period = 2 * count - 2
      const p = step % period
      return p < count ? p : period - p
    }
  }
}

/** True when playback has reached its end and should stop (only `once` ever finishes). */
export function isFinished(step: number, count: number, mode: LoopMode): boolean {
  return mode === 'once' && step >= count - 1
}
