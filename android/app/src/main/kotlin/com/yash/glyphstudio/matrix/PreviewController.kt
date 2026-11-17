package com.yash.glyphstudio.matrix

import com.yash.glyphstudio.playback.Baker
import com.yash.glyphstudio.playback.FramePlayer
import com.yash.glyphstudio.sync.Cancellable
import com.yash.glyphstudio.sync.Scheduler
import com.yash.glyphstudio.sync.SyncHub

/** Whether this phone can show app content on the matrix (needs Nothing OS build 20250801 or later). */
object SystemSupport {
    private const val MIN_DATE = 20250801

    /**
     * [incremental] is Android's build number; Nothing OS builds start with the build date as yyMMdd (e.g. "2609242115"
     * = 2026-09-24). If the format is not recognised we assume support and rely on the matrix refusing frames instead.
     */
    fun supportsAppMatrix(incremental: String): Boolean {
        val m = Regex("^(\\d{2})(\\d{2})(\\d{2})").find(incremental) ?: return true
        val (yy, mm, dd) = m.destructured
        return (2000 + yy.toInt()) * 10000 + mm.toInt() * 100 + dd.toInt() >= MIN_DATE
    }
}

/**
 * Live preview: shows the frame being edited on the real Glyph Matrix, following edits as they happen. It only uses the
 * app display path, so it never touches Glyph Toys, and it gives the matrix back when preview stops, the editor closes or
 * the app has been in the background for [BACKGROUND_RELEASE_MS] with nobody editing from a PC.
 */
class PreviewController(
    private val link: MatrixLink,
    private val hub: SyncHub,
    private val scheduler: Scheduler,
    private val supported: Boolean,
    private val log: (String) -> Unit = {},
) {
    data class Status(
        val supported: Boolean,
        val active: Boolean,
        val designId: String?,
        val frameId: String?,
        val message: String?,
        /** True while the whole animation is playing on the matrix (instead of one frame). */
        val playing: Boolean = false,
    )

    private val lock = Any()
    private var designId: String? = null
    private var frameId: String? = null
    private var lease: MatrixLink.Lease? = null
    private var subscription: AutoCloseable? = null
    private var renderTimer: Cancellable? = null
    private var releaseTimer: Cancellable? = null
    private var message: String? = null
    private var playing = false
    private val player = FramePlayer(scheduler, { pixels -> link.showApp(pixels) }, { log("Preview frame failed: $it") })

    fun status(): Status = synchronized(lock) { statusLocked() }

    private fun statusLocked() =
        Status(supported, designId != null, designId, frameId, if (supported) message else UNSUPPORTED_MESSAGE, playing && designId != null)

    /** Start (or switch to) previewing [designId], showing [frameId] (the first frame when null). */
    fun start(designId: String, frameId: String?): Status = synchronized(lock) {
        if (!supported) return statusLocked()
        if (hub.snapshot(designId) == null) {
            message = "That design no longer exists."
            return statusLocked()
        }
        if (this.designId != designId) {
            subscription?.close()
            subscription = hub.subscribe(designId, object : SyncHub.Subscriber {
                // Runs inside the hub's lock: only schedule here.
                override fun onUpdate(update: SyncHub.Update) = scheduleRender()
                override fun onDeleted(designId: String) { scheduler.schedule(0) { stop() } }
            })
        }
        this.designId = designId
        this.frameId = frameId
        message = null
        if (lease == null) lease = link.acquire { renderNow() }
        else renderNow()
        statusLocked()
    }

    fun setFrame(frameId: String?): Status = synchronized(lock) {
        if (designId != null) { this.frameId = frameId; renderNow() }
        statusLocked()
    }

    /**
     * Play the whole animation on the matrix (same frame timing and loop mode as the design), or go back to showing the
     * selected frame. Ignored when no preview is active.
     */
    fun setPlaying(on: Boolean): Status = synchronized(lock) {
        if (designId == null) return statusLocked()
        playing = on
        if (!on) player.stop()
        renderNow()
        statusLocked()
    }

    /** Stop previewing and give the matrix back. Safe to call when nothing is active. */
    fun stop(): Status = synchronized(lock) {
        renderTimer?.cancel(); renderTimer = null
        releaseTimer?.cancel(); releaseTimer = null
        player.stop(); playing = false
        subscription?.close(); subscription = null
        val wasActive = lease != null
        if (wasActive) link.releaseApp()
        lease?.close(); lease = null
        designId = null
        frameId = null
        statusLocked()
    }

    /** The app left the foreground. Let go of the matrix after a while unless a PC is still editing. */
    fun onAppBackgrounded(hasRemoteSession: Boolean) = synchronized(lock) {
        releaseTimer?.cancel(); releaseTimer = null
        if (designId == null || hasRemoteSession) return@synchronized
        releaseTimer = scheduler.schedule(BACKGROUND_RELEASE_MS) { synchronized(lock) { releaseTimer = null; stop() } }
    }

    fun onAppForegrounded() = synchronized(lock) {
        releaseTimer?.cancel(); releaseTimer = null
    }

    // ---- rendering ---------------------------------------------------------------------------------------------

    /** Edits arrive many times a second; draw at most every ~33 ms (30 updates/s). */
    private fun scheduleRender() {
        synchronized(lock) {
            if (renderTimer != null || designId == null) return
            renderTimer = scheduler.schedule(RENDER_INTERVAL_MS) { synchronized(lock) { renderTimer = null; renderNow() } }
        }
    }

    private fun renderNow() {
        val id = designId ?: return
        val design = hub.snapshot(id)?.design ?: return
        if (!link.isReady) return // the lease's ready callback draws once the matrix is connected
        if (playing) {
            player.play(Baker.bake(design)) // restarts from the first frame, with any edits included
            return
        }
        val frame = design.frames.firstOrNull { it.id == frameId } ?: design.frames.firstOrNull() ?: return
        val ok = link.showApp(Baker.bakeFrame(frame).pixels)
        message = if (ok) null else "The phone did not accept the preview frame."
        if (!ok) log("Preview frame refused")
    }

    companion object {
        const val RENDER_INTERVAL_MS = 33L
        const val BACKGROUND_RELEASE_MS = 10_000L
        const val UNSUPPORTED_MESSAGE =
            "Live preview needs a newer Nothing OS (build 20250801 or later). Drawing and saving still work."
    }
}
