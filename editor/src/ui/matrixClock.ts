import { MATRIX_SIZE, MATRIX_CELLS } from '../generated/shared'

/** One frame of an animation as the thumbnails play it. */
export interface TimedFrame {
  pixels: Uint8Array
  durationMs: number
}

/** Which frame is showing [elapsedMs] after the animation started, looping forever. */
export function frameIndexAt(frames: { durationMs: number }[], elapsedMs: number): number {
  const total = frames.reduce((sum, f) => sum + Math.max(1, f.durationMs), 0)
  if (total <= 0 || frames.length === 0) return 0
  let t = elapsedMs % total
  for (let i = 0; i < frames.length; i++) {
    t -= Math.max(1, frames[i].durationMs)
    if (t < 0) return i
  }
  return 0
}

/**
 * The order in which dots light up in the "lit in sequence" opening: a clockwise sweep from the top.
 * One rank in [0, 1) per cell; a cell is shown once the sweep progress passes its rank.
 */
export const REVEAL_RANK: Float32Array = (() => {
  const rank = new Float32Array(MATRIX_CELLS)
  const c = (MATRIX_SIZE - 1) / 2
  for (let i = 0; i < MATRIX_CELLS; i++) {
    const x = (i % MATRIX_SIZE) - c
    const y = Math.floor(i / MATRIX_SIZE) - c
    const angle = Math.atan2(x, -y) // 0 at the top, clockwise
    rank[i] = ((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)
  }
  return rank
})()

/** [pixels] with only the cells the sweep has reached (progress 0..1) still lit. */
export function revealed(pixels: Uint8Array, progress: number): Uint8Array {
  if (progress >= 1) return pixels
  const out = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i++) if (REVEAL_RANK[i] < progress) out[i] = pixels[i]
  return out
}

export const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// One shared animation loop for every moving thumbnail: it runs only while something is subscribed and the page is visible.
type Tick = (now: number) => void
const subscribers = new Set<Tick>()
let raf = 0

function loop(now: number) {
  raf = 0
  for (const tick of [...subscribers]) tick(now)
  if (subscribers.size > 0 && !document.hidden) raf = requestAnimationFrame(loop)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && subscribers.size > 0 && !raf) raf = requestAnimationFrame(loop)
  })
}

/** Call [tick] on every animation frame until the returned function is called. */
export function subscribeClock(tick: Tick): () => void {
  subscribers.add(tick)
  if (!raf && typeof document !== 'undefined' && !document.hidden) raf = requestAnimationFrame(loop)
  return () => { subscribers.delete(tick) }
}

export const activeClockSubscribers = (): number => subscribers.size
