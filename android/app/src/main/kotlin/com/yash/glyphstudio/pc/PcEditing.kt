package com.yash.glyphstudio.pc

import com.yash.glyphstudio.server.GlyphServer
import com.yash.glyphstudio.server.ServerDeps
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/** Lets the Android side react to the server starting and stopping (a notification, keeping the process alive). */
interface PcEditingHost {
    fun onStarted()
    fun onStopped()
}

/**
 * "PC editing": a second server that listens on the phone's Wi-Fi address so a browser on the same network can edit.
 * It is off until the user turns it on, and every request needs the pairing code first (see [Pairing]).
 * The in-app server stays on loopback; only this one is reachable from the network.
 */
class PcEditing(
    private val deps: ServerDeps,
    private val addressProvider: () -> String? = LanAddress::find,
    private val preferredPort: Int = DEFAULT_PORT,
    private val host: PcEditingHost? = null,
    private val idleTimeoutMs: Long = DEFAULT_IDLE_MS,
    private val clock: () -> Long = System::currentTimeMillis,
    /** How often to look for idleness. Tests pass 0 and call [checkIdle] themselves. */
    private val checkEveryMs: Long = 30_000,
) {
    data class Status(val on: Boolean, val url: String?, val code: String?, val paired: Int)

    sealed interface StartResult {
        data class Started(val status: Status) : StartResult
        data object NoWifi : StartResult
        data class Failed(val message: String) : StartResult
    }

    private var server: GlyphServer? = null
    private var pairing: Pairing? = null
    private var url: String? = null
    private var activity: ActivityTracker? = null
    private var watchdog: ScheduledExecutorService? = null

    @Synchronized
    fun start(): StartResult {
        if (server != null) return StartResult.Started(status())
        val address = addressProvider() ?: return StartResult.NoWifi
        val newPairing = Pairing()
        val tracker = ActivityTracker(clock)
        val s = bind(address, newPairing, tracker) ?: return StartResult.Failed("Could not open a network port.")
        server = s.first
        pairing = newPairing
        activity = tracker
        url = "http://$address:${s.second}"
        if (checkEveryMs > 0) {
            watchdog = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "pc-editing-idle").apply { isDaemon = true } }
                .also { it.scheduleWithFixedDelay({ checkIdle() }, checkEveryMs, checkEveryMs, TimeUnit.MILLISECONDS) }
        }
        host?.onStarted()
        return StartResult.Started(status())
    }

    /** Tries the usual port first so the address stays the same between sessions, then any free port. */
    private fun bind(address: String, p: Pairing, tracker: ActivityTracker): Pair<GlyphServer, Int>? {
        for (port in listOf(preferredPort, 0).distinct()) {
            val s = GlyphServer(deps.forRemote(tracker), PcAuthenticator(p, onActivity = tracker::touch), host = address, requestedPort = port)
            try {
                return s to s.start()
            } catch (_: Exception) {
                s.stop()
            }
        }
        return null
    }

    @Synchronized
    fun stop() {
        val was = server != null
        server?.stop()
        server = null
        pairing = null
        url = null
        activity = null
        watchdog?.shutdownNow()
        watchdog = null
        if (was) host?.onStopped()
    }

    /**
     * Turns PC editing off when nobody has used it for the idle limit (30 minutes). A browser that is open on a design
     * counts as using it, however quiet, so this never cuts off someone who is working. Returns true if it stopped.
     */
    fun checkIdle(): Boolean {
        synchronized(this) {
            val a = activity ?: return false
            if (server == null || !a.isIdle(idleTimeoutMs)) return false
        }
        stop()
        return true
    }

    /** Signs every connected browser out and makes a new code; the server keeps running. */
    @Synchronized
    fun disconnectAll() { pairing?.revokeAll() }

    @Synchronized
    fun status(): Status = Status(server != null, url, pairing?.code(), pairing?.sessionCount() ?: 0)

    companion object {
        const val DEFAULT_PORT = 8765
        const val DEFAULT_IDLE_MS = 30L * 60 * 1000
    }
}
