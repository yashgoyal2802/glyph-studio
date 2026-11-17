<script lang="ts">
  import { DARK_THEME, MatrixRenderer, type Ctx2D } from '../core/renderer'
  import { MATRIX_CELLS } from '../generated/shared'
  import { frameIndexAt, prefersReducedMotion, revealed, subscribeClock, type TimedFrame } from './matrixClock'

  /**
   * A small round matrix that can play an animation. With no frames (or one frame, or reduced motion) it shows [still].
   * [reveal] lights the dots in a clockwise sweep once before playing. Dark display in both app themes: it is the hardware.
   */
  let { frames = null, still, size = 56, active = true, reveal = false, revealMs = 900 }: {
    frames?: TimedFrame[] | null
    still: Uint8Array
    size?: number
    active?: boolean
    reveal?: boolean
    revealMs?: number
  } = $props()

  let canvas: HTMLCanvasElement
  let renderer: MatrixRenderer | null = null

  function paint(pixels: Uint8Array) {
    renderer?.invalidate()
    renderer?.draw(pixels)
  }

  $effect(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    renderer = new MatrixRenderer(ctx as unknown as Ctx2D, DARK_THEME)
    renderer.resize({ w: size, h: size }, dpr)

    const moving = !!frames && frames.length > 1 && active && !prefersReducedMotion()
    const first = frames && frames.length ? frames[0].pixels : still
    const sweep = reveal && active && !prefersReducedMotion()
    const base = frames && frames.length ? frames : [{ pixels: still, durationMs: 1000 }]

    if (!moving && !sweep) {
      paint(first)
      return
    }
    let startedAt = -1
    let shown = -2
    const stop = subscribeClock((now) => {
      if (startedAt < 0) startedAt = now
      const elapsed = now - startedAt
      if (sweep && elapsed < revealMs) {
        paint(revealed(base[0].pixels, elapsed / revealMs))
        shown = -2
        return
      }
      const idx = moving ? frameIndexAt(base, elapsed - (sweep ? revealMs : 0)) : 0
      if (idx !== shown) {
        shown = idx
        paint(base[idx].pixels)
      }
      if (!moving) stop() // the sweep is over and nothing moves: stop using the clock
    })
    return stop
  })
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true" data-cells={MATRIX_CELLS}></canvas>

<style>
  canvas { display: block; border-radius: 50%; flex: none; }
</style>
