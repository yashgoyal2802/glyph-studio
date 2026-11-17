package com.yash.glyphstudio.playback

import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.Frame
import com.yash.glyphstudio.design.PixelsLayer
import com.yash.glyphstudio.design.UnknownLayer
import com.yash.glyphstudio.generated.SharedConstants as C
import com.yash.glyphstudio.sync.FakeScheduler
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FramePlayerTest {
    /** A 625-cell frame whose first LED cell holds [marker], so shown frames can be told apart. */
    private val led = C.LED_MASK.indexOfFirst { it }
    private fun frame(marker: Int, ms: Int) = BakedFrame(IntArray(C.MATRIX_CELLS).also { it[led] = marker }, ms)
    private fun anim(loop: String, vararg ms: Int) = BakedAnimation(ms.mapIndexed { i, d -> frame(i + 1, d) }, loop)

    private class Rig {
        val sched = FakeScheduler()
        val shown = mutableListOf<Int>()
        val errors = mutableListOf<Throwable>()
        val ledCell = C.LED_MASK.indexOfFirst { it }
        val player = FramePlayer(sched, { shown.add(it[ledCell]) }, { errors.add(it) })
        fun next(): Long? {
            val t = sched.tasks.firstOrNull { !it.cancelled } ?: return null
            t.cancelled = true
            t.run()
            return t.delayMs
        }
        fun pendingDelay(): Long? = sched.tasks.firstOrNull { !it.cancelled }?.delayMs
    }

    @Test fun loopShowsEachFrameForItsOwnDurationAndRestarts() {
        val r = Rig()
        r.player.play(anim("loop", 100, 300))
        assertEquals(listOf(1), r.shown) // first frame immediately
        assertEquals(100L, r.pendingDelay())
        r.next(); assertEquals(listOf(1, 2), r.shown); assertEquals(300L, r.pendingDelay())
        r.next(); assertEquals(listOf(1, 2, 1), r.shown); assertEquals(100L, r.pendingDelay())
        repeat(5) { r.next() }
        assertEquals(listOf(1, 2, 1, 2, 1, 2, 1, 2), r.shown)
        assertTrue(r.player.isPlaying)
    }

    @Test fun bounceGoesForwardThenBackward() {
        val r = Rig()
        r.player.play(anim("bounce", 50, 50, 50))
        repeat(6) { r.next() }
        assertEquals(listOf(1, 2, 3, 2, 1, 2, 3), r.shown)
    }

    @Test fun onceStopsOnTheLastFrame() {
        val r = Rig()
        r.player.play(anim("once", 40, 40, 40))
        r.next(); r.next()
        assertEquals(listOf(1, 2, 3), r.shown)
        assertEquals(null, r.pendingDelay()) // nothing left scheduled
        assertFalse(r.player.isPlaying)
        assertEquals(null, r.next())
        assertEquals(listOf(1, 2, 3), r.shown)
    }

    @Test fun aSinglePictureIsShownOnceWithoutATimer() {
        for (mode in C.LOOP_MODES) {
            val r = Rig()
            r.player.play(anim(mode, 100))
            assertEquals(listOf(1), r.shown)
            assertEquals("no timer for a still image in $mode", null, r.pendingDelay())
        }
    }

    @Test fun stopCancelsTheTimerAndALateTaskDoesNothing() {
        val r = Rig()
        r.player.play(anim("loop", 100, 100))
        val late = r.sched.tasks.first { !it.cancelled }
        r.player.stop()
        assertFalse(r.player.isPlaying)
        assertEquals(null, r.pendingDelay())
        late.run() // a task that was already queued when stop() was called
        assertEquals(listOf(1), r.shown)
    }

    @Test fun playingANewAnimationReplacesTheOldOneFromItsFirstFrame() {
        val r = Rig()
        r.player.play(anim("loop", 100, 100, 100))
        r.next()
        val oldTask = r.sched.tasks.last { !it.cancelled }
        r.player.play(BakedAnimation(listOf(frame(9, 70), frame(8, 70)), "loop"))
        assertEquals(listOf(1, 2, 9), r.shown)
        oldTask.run() // stale
        assertEquals(listOf(1, 2, 9), r.shown)
        r.next()
        assertEquals(listOf(1, 2, 9, 8), r.shown)
    }

    @Test fun anEmptyAnimationPlaysNothing() {
        val r = Rig()
        r.player.play(BakedAnimation(emptyList(), "loop"))
        assertTrue(r.shown.isEmpty())
        assertFalse(r.player.isPlaying)
    }

    @Test fun aFailingSinkIsReportedButTheAnimationKeepsGoing() {
        val sched = FakeScheduler()
        val shown = mutableListOf<Int>()
        val errors = mutableListOf<Throwable>()
        var calls = 0
        val p = FramePlayer(sched, { px -> calls++; if (calls == 2) error("matrix busy") else shown.add(px[led]) }, { errors.add(it) })
        p.play(anim("loop", 10, 10, 10))
        repeat(3) { sched.tasks.first { !it.cancelled }.let { t -> t.cancelled = true; t.run() } }
        assertEquals(1, errors.size)
        assertEquals(listOf(1, 3, 1), shown) // frame 2 failed, 3 and 1 still shown
    }

    // ---- baking ----
    @Test fun bakingTurnsBytesIntoUnsignedValuesAndCarriesTimingAndLoop() {
        val bytes = ByteArray(C.MATRIX_CELLS).also { it[led] = 255.toByte(); it[led + 1] = 7 }
        val d = DesignCodec.createDesign().let {
            it.copy(loop = "bounce", frames = listOf(Frame("a", 250, listOf(PixelsLayer("l", bytes)))))
        }
        val baked = Baker.bake(d)
        assertEquals("bounce", baked.loop)
        assertEquals(250, baked.frames[0].durationMs)
        assertEquals(255, baked.frames[0].pixels[led]) // not -1
        assertEquals(7, baked.frames[0].pixels[led + 1])
        assertEquals(C.MATRIX_CELLS, baked.frames[0].pixels.size)
    }

    @Test fun bakingCombinesLayersByBrightestValueAndIgnoresUnknownLayers() {
        val a = ByteArray(C.MATRIX_CELLS).also { it[led] = 50; it[led + 1] = 200.toByte() }
        val b = ByteArray(C.MATRIX_CELLS).also { it[led] = 180.toByte(); it[led + 1] = 10 }
        val unknown = UnknownLayer("t", "text", JSONObject().put("id", "t").put("type", "text"))
        val f = Frame("f", 100, listOf(PixelsLayer("a", a), PixelsLayer("b", b), unknown))
        val out = Baker.bakeFrame(f).pixels
        assertEquals(180, out[led])
        assertEquals(200, out[led + 1])
    }

    @Test fun anEmptySlotShowsAVisibleRingOnLedCellsOnly() {
        val e = Baker.emptySlot()
        val lit = e.frames[0].pixels.withIndex().filter { it.value > 0 }
        assertTrue(lit.size > 10)
        assertTrue(lit.all { C.LED_MASK[it.index] })
    }
}
