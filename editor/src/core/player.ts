import type { LoopMode } from '../generated/shared'
import { frameIndexAt, isFinished } from '../format/playback'

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

/**
 * Plays an animation in the editor: tells you which frame to show, and when to move on, using each frame's own duration
 * and the loop mode. It knows nothing about drawing; [onFrame] receives the index to display.
 *  - loop: restarts forever. bounce: forward then backward forever.
 *  - once: stops after the last frame has been shown for its duration, then calls [onEnd].
 *  - A single frame has nothing to animate: it is shown and stays until stopped (or, in "once", for its duration).
 */
export class AnimationPlayer {
  private timer: unknown = null
  private running = false
  private step = 0
  private durations: number[] = []
  private loop: LoopMode = 'loop'

  constructor(
    private readonly onFrame: (index: number) => void,
    private readonly onEnd: () => void,
    private readonly timers: Timers = globalThis as unknown as Timers,
  ) {}

  get playing(): boolean {
    return this.running
  }

  start(durations: number[], loop: LoopMode) {
    this.stop()
    if (durations.length === 0) return
    this.durations = durations
    this.loop = loop
    this.step = 0
    this.running = true
    this.tick()
  }

  stop() {
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
    this.running = false
  }

  private tick() {
    const count = this.durations.length
    const index = frameIndexAt(this.step, count, this.loop)
    this.onFrame(index)
    const ms = this.durations[index]
    const finished = isFinished(this.step, count, this.loop)
    if (count === 1 && this.loop !== 'once') return // a still picture: nothing to schedule
    this.timer = this.timers.setTimeout(() => {
      this.timer = null
      if (finished) {
        this.running = false
        this.onEnd()
      } else {
        this.step++
        this.tick()
      }
    }, ms)
  }
}
