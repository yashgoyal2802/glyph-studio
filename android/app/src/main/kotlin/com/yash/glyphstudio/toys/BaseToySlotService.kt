package com.yash.glyphstudio.toys

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.yash.glyphstudio.GlyphApp
import com.yash.glyphstudio.playback.Baker
import com.yash.glyphstudio.playback.FramePlayer

/**
 * A Glyph Toy that plays whatever design is assigned to one slot. The system binds the service when the user selects
 * the toy with the Glyph Button and unbinds it when they switch away (or the phone's toy timeout runs out).
 * While bound it follows the slot: assigning another design, editing the design or deleting it changes what is shown.
 */
abstract class BaseToySlotService(private val slot: Int) : Service() {
    private var lease: AutoCloseable? = null
    private var watch: AutoCloseable? = null
    private var player: FramePlayer? = null

    override fun onBind(intent: Intent?): IBinder? {
        val app = application as GlyphApp
        Log.i(TAG, "toy $slot: bound")
        val p = FramePlayer(app.playbackScheduler, { px -> app.matrixLink.showToy(px) }, { Log.w(TAG, "toy $slot: frame failed", it) })
        player = p
        lease = app.matrixLink.acquire {
            // The matrix is connected. Show the slot now and keep following it.
            watch?.close()
            watch = app.slots.observe(slot) { animation -> p.play(animation ?: Baker.emptySlot()) }
        }
        return null
    }

    override fun onUnbind(intent: Intent?): Boolean {
        val app = application as GlyphApp
        Log.i(TAG, "toy $slot: unbound")
        watch?.close(); watch = null
        player?.stop(); player = null
        app.matrixLink.turnOff()
        lease?.close(); lease = null
        return false
    }

    private companion object { const val TAG = GlyphApp.TAG }
}

class ToySlot1Service : BaseToySlotService(1)
class ToySlot2Service : BaseToySlotService(2)
class ToySlot3Service : BaseToySlotService(3)
class ToySlot4Service : BaseToySlotService(4)
class ToySlot5Service : BaseToySlotService(5)
