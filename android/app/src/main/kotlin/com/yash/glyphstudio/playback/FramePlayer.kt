package com.yash.glyphstudio.playback

import com.yash.glyphstudio.design.frameIndexAt
import com.yash.glyphstudio.design.isFinished
import com.yash.glyphstudio.sync.Cancellable
import com.yash.glyphstudio.sync.Scheduler

/**
 * Plays a [BakedAnimation] by pushing each frame to [sink] for its duration, following the loop mode
 * (loop, bounce, once). The sink decides where frames go (a Glyph Toy, or the app preview), so the same
 * timing logic serves both.
 */
class FramePlayer(
    private val scheduler: Scheduler,
    private val sink: (IntArray) -> Unit,
    private val onSinkError: (Throwable) -> Unit = {},
) {
    private val lock = Any()
    private var animation: BakedAnimation? = null
    private var step = 0
    private var timer: Cancellable? = null
    private var generation = 0

    val isPlaying: Boolean get() = synchronized(lock) { animation != null && timer != null }

    /** Start (or restart from the first frame) with [animation]. Whatever was playing stops. */
    fun play(animation: BakedAnimation) = synchronized(lock) {
        stopLocked()
        if (animation.isEmpty) return@synchronized
        this.animation = animation
        step = 0
        tick(generation)
    }

    fun stop() = synchronized(lock) { stopLocked() }

    private fun stopLocked() {
        timer?.cancel()
        timer = null
        animation = null
        generation++ // any task already queued for the old animation will see a different generation and do nothing
    }

    private fun tick(gen: Int) {
        if (gen != generation) return
        val anim = animation ?: return
        val count = anim.frames.size
        val frame = anim.frames[frameIndexAt(step, count, anim.loop)]
        try { sink(frame.pixels) } catch (t: Throwable) { onSinkError(t) } // one bad frame must not stop the animation
        // A single picture needs no timer; "once" is finished on its last frame.
        if (count == 1 || isFinished(step, count, anim.loop)) {
            timer = null
            return
        }
        val current = step
        timer = scheduler.schedule(frame.durationMs.toLong()) {
            synchronized(lock) {
                if (gen == generation) {
                    step = current + 1
                    tick(gen)
                }
            }
        }
    }
}
