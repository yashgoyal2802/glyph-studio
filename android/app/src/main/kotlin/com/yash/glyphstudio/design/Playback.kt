package com.yash.glyphstudio.design

/** Index of the frame shown at playback step [step] (0-based) for a design with [count] frames. */
fun frameIndexAt(step: Int, count: Int, mode: String): Int {
    if (count <= 1) return 0
    return when (mode) {
        "loop" -> step % count
        "once" -> minOf(step, count - 1)
        "bounce" -> {
            val period = 2 * count - 2
            val p = step % period
            if (p < count) p else period - p
        }
        else -> throw IllegalArgumentException("Unknown loop mode: $mode")
    }
}

/** True when playback has reached its end and should stop (only `once` ever finishes). */
fun isFinished(step: Int, count: Int, mode: String): Boolean = mode == "once" && step >= count - 1
