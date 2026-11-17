package com.yash.glyphstudio.pc

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Remembers when a paired browser last used the PC server. A browser holding a live editing connection (WebSocket)
 * counts as busy for as long as it stays connected, because an editor left open on a design may be quiet for a while.
 */
class ActivityTracker(private val clock: () -> Long = System::currentTimeMillis) {
    private val last = AtomicLong(clock())
    private val sockets = AtomicInteger(0)

    fun touch() { last.set(clock()) }

    fun socketOpened() { sockets.incrementAndGet(); touch() }

    fun socketClosed() { sockets.updateAndGet { maxOf(0, it - 1) }; touch() }

    fun isIdle(limitMs: Long): Boolean = sockets.get() == 0 && clock() - last.get() >= limitMs
}
