package com.yash.glyphstudio.matrix

/** The few operations we use on the phone's Glyph Matrix, so the sharing rules below can be tested without hardware. */
interface MatrixDevice {
    /** Connect to the system service. [onConnected] fires once the matrix can be used, [onDisconnected] if it goes away. */
    fun connect(onConnected: () -> Unit, onDisconnected: () -> Unit)
    fun disconnect()

    /** Frames from a Glyph Toy (shown while the toy is the selected one). */
    fun toyFrame(pixels: IntArray)

    /** Frames from the app itself (preview); needs system version 20250801 or later. */
    fun appFrame(pixels: IntArray)
    fun closeApp()
    fun turnOff()
}

/**
 * One shared connection to the matrix. The Glyph Toys and the live preview both need it, and the SDK hands out a single
 * connection per app, so disconnecting it for one user would cut off the other. Users take a lease; the connection opens
 * with the first lease and closes with the last.
 */
class MatrixLink(private val device: MatrixDevice, private val log: (String) -> Unit = {}) {
    private val lock = Any()
    private var leases = 0
    private var connecting = false
    private var ready = false
    private val waiting = mutableListOf<() -> Unit>()

    inner class Lease internal constructor(private val onReady: () -> Unit) : AutoCloseable {
        private var closed = false
        internal fun deliver() { if (!closed) onReady() }
        override fun close() {
            val shouldDisconnect = synchronized(lock) {
                if (closed) return
                closed = true
                waiting.remove(onReady)
                leases--
                (leases == 0).also { if (it) { ready = false; connecting = false } }
            }
            if (shouldDisconnect) device.disconnect()
        }
    }

    /** Take part in the connection. [onReady] runs when the matrix can be used (straight away if it already can). */
    fun acquire(onReady: () -> Unit): Lease {
        val lease = Lease(onReady)
        var callNow = false
        var startConnect = false
        synchronized(lock) {
            leases++
            if (ready) callNow = true
            else {
                waiting.add(lease::deliver)
                if (!connecting) { connecting = true; startConnect = true }
            }
        }
        if (startConnect) device.connect(::connected, ::lost)
        if (callNow) lease.deliver()
        return lease
    }

    private fun connected() {
        val toNotify = synchronized(lock) {
            ready = true
            connecting = false
            waiting.toList().also { waiting.clear() }
        }
        toNotify.forEach { it() }
    }

    private fun lost() {
        synchronized(lock) { ready = false }
        log("Glyph service disconnected")
    }

    val isReady: Boolean get() = synchronized(lock) { ready }

    /** Each returns false when the matrix is not connected or refuses the frame (the failure is logged, not thrown). */
    fun showToy(pixels: IntArray): Boolean = guarded { device.toyFrame(pixels) }
    fun showApp(pixels: IntArray): Boolean = guarded { device.appFrame(pixels) }
    fun releaseApp(): Boolean = guarded { device.closeApp() }
    fun turnOff(): Boolean = guarded { device.turnOff() }

    private fun guarded(block: () -> Unit): Boolean {
        if (!isReady) return false
        return try { block(); true } catch (t: Throwable) { log("Matrix call failed: $t"); false }
    }
}
