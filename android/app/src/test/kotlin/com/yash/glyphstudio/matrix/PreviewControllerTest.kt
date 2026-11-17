package com.yash.glyphstudio.matrix

import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.generated.SharedConstants as C
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.Op
import com.yash.glyphstudio.sync.SyncHub
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class PreviewControllerTest {
    @get:Rule val tmp = TemporaryFolder()

    private val led = C.LED_MASK.indexOfFirst { it }
    private val device = FakeMatrixDevice()
    private val sched = FakeScheduler()
    private lateinit var repo: DesignRepository
    private lateinit var hub: SyncHub

    private fun controller(supported: Boolean = true): PreviewController {
        repo = DesignRepository(File(tmp.root, "d"))
        hub = SyncHub(repo, FakeScheduler())
        return PreviewController(MatrixLink(device), hub, sched, supported)
    }

    private fun draw(d: Design, value: Int, frame: Int = 0) =
        hub.apply(d.id, Op.SetPixels(d.frames[frame].id, d.frames[frame].layers[0].id, intArrayOf(led), intArrayOf(value)), "pc")

    private fun twoFrames(): Design {
        val d = repo.create("p")
        val second = com.yash.glyphstudio.design.DesignCodec.createFrame()
        hub.apply(d.id, Op.AddFrame(second, d.frames[0].id), "pc")
        return hub.snapshot(d.id)!!.design
    }

    // ---- system support ----
    @Test fun systemSupportReadsTheBuildDate() {
        assertTrue(PreviewController.run { SystemSupport.supportsAppMatrix("2609242115") })
        assertTrue(SystemSupport.supportsAppMatrix("2508010000")) // exactly the minimum
        assertFalse(SystemSupport.supportsAppMatrix("2507312359"))
        assertFalse(SystemSupport.supportsAppMatrix("2412010000"))
        assertTrue(SystemSupport.supportsAppMatrix("")) // unknown format: assume yes, let the matrix refuse if not
        assertTrue(SystemSupport.supportsAppMatrix("abc123"))
    }

    @Test fun unsupportedPhonesNeverOpenTheMatrix() {
        val c = controller(supported = false)
        val d = repo.create("x")
        val s = c.start(d.id, null)
        assertFalse(s.supported); assertFalse(s.active)
        assertTrue(s.message!!.contains("20250801"))
        assertEquals(0, device.connects)
        assertEquals(PreviewController.UNSUPPORTED_MESSAGE, c.status().message)
    }

    // ---- showing frames ----
    @Test fun startConnectsThenShowsTheCurrentFrameOnceReady() {
        val c = controller()
        val d = repo.create("x")
        draw(d, 150)
        val s = c.start(d.id, null)
        assertTrue(s.active); assertEquals(d.id, s.designId)
        assertEquals(1, device.connects)
        assertTrue(device.app.isEmpty()) // matrix not ready yet
        device.onConnected!!()
        assertEquals(listOf(150), device.app) // includes the edit that is not saved to disk yet
    }

    @Test fun editsAreMirroredAndManyQuickEditsBecomeOneUpdate() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        device.app.clear()
        repeat(30) { draw(d, it + 1) }
        assertEquals(1, sched.pending()) // coalesced into a single render
        assertEquals(PreviewController.RENDER_INTERVAL_MS, sched.tasks.first { !it.cancelled }.delayMs)
        sched.runAll()
        assertEquals(listOf(30), device.app)
        draw(d, 99); sched.runAll()
        assertEquals(listOf(30, 99), device.app)
    }

    @Test fun showsTheFrameTheEditorIsOnAndFollowsFrameChanges() {
        val c = controller()
        val d = twoFrames()
        draw(d, 10, frame = 0); draw(d, 20, frame = 1)
        c.start(d.id, d.frames[1].id); device.onConnected!!()
        assertEquals(20, device.app.last())
        c.setFrame(d.frames[0].id)
        assertEquals(10, device.app.last())
        draw(d, 11, frame = 1) // an edit on a frame that is not shown must not change what is shown
        sched.runAll()
        assertEquals(10, device.app.last())
        c.setFrame("no-such-frame") // falls back to the first frame
        assertEquals(10, device.app.last())
    }

    @Test fun startingAnotherDesignSwitchesToIt() {
        val c = controller()
        val a = repo.create("A"); val b = repo.create("B")
        draw(a, 1); draw(b, 2)
        c.start(a.id, null); device.onConnected!!()
        c.start(b.id, null)
        assertEquals(2, device.app.last())
        assertEquals(1, device.connects) // same connection
        device.app.clear()
        draw(a, 7); sched.runAll() // the old design no longer drives the matrix
        assertTrue(device.app.isEmpty())
        draw(b, 8); sched.runAll()
        assertEquals(listOf(8), device.app)
    }

    @Test fun anUnknownDesignIsRefusedWithAMessage() {
        val c = controller()
        val s = c.start("no-such-design", null)
        assertFalse(s.active)
        assertNotNull(s.message)
        assertEquals(0, device.connects)
    }

    // ---- releasing the matrix ----
    @Test fun stopGivesTheMatrixBackAndLaterTasksDoNothing() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        draw(d, 5) // schedules a render
        val s = c.stop()
        assertFalse(s.active)
        assertEquals(1, device.closeApps)
        assertEquals(1, device.disconnects)
        device.app.clear()
        sched.runAll()
        assertTrue(device.app.isEmpty())
        draw(d, 6); sched.runAll()
        assertTrue(device.app.isEmpty()) // no longer subscribed
    }

    @Test fun stopWhenNothingIsActiveIsHarmless() {
        val c = controller()
        assertFalse(c.stop().active)
        assertEquals(0, device.closeApps)
    }

    @Test fun leavingTheAppReleasesTheMatrixAfterTenSecondsUnlessComingBack() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        c.onAppBackgrounded(hasRemoteSession = false)
        assertEquals(10_000L, sched.tasks.first { !it.cancelled }.delayMs)
        c.onAppForegrounded() // came back in time
        sched.runAll()
        assertTrue(c.status().active)
        c.onAppBackgrounded(hasRemoteSession = false)
        sched.runAll() // ten seconds pass
        assertFalse(c.status().active)
        assertEquals(1, device.closeApps)
    }

    @Test fun aConnectedPcKeepsThePreviewAliveInTheBackground() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        c.onAppBackgrounded(hasRemoteSession = true)
        sched.runAll()
        assertTrue(c.status().active)
    }

    @Test fun backgroundingWithoutAPreviewSchedulesNothing() {
        val c = controller()
        c.onAppBackgrounded(hasRemoteSession = false)
        assertEquals(0, sched.pending())
    }

    @Test fun deletingTheDesignStopsThePreview() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        repo.delete(d.id)
        sched.runAll()
        assertFalse(c.status().active)
        assertEquals(1, device.closeApps)
    }

    @Test fun aRefusedFrameIsReportedInTheStatus() {
        val c = controller()
        val d = repo.create("x")
        c.start(d.id, null); device.onConnected!!()
        device.failNext = true
        draw(d, 3); sched.runAll()
        assertNotNull(c.status().message)
        draw(d, 4); sched.runAll()
        assertNull(c.status().message) // recovers
    }

    // ---- playing the whole animation on the matrix ----
    private fun nextTask(): Long? {
        val t = sched.tasks.firstOrNull { !it.cancelled } ?: return null
        t.cancelled = true
        t.run()
        return t.delayMs
    }

    /** Two frames lit with 10 and 20, shown for 100 ms and 300 ms. */
    private fun animated(): Design {
        val d = twoFrames()
        draw(d, 10, frame = 0); draw(d, 20, frame = 1)
        hub.apply(d.id, Op.SetDuration(d.frames[0].id, 100), "pc")
        hub.apply(d.id, Op.SetDuration(d.frames[1].id, 300), "pc")
        return hub.snapshot(d.id)!!.design
    }

    @Test fun playingShowsTheAnimationWithItsOwnFrameTiming() {
        val c = controller()
        val d = animated()
        c.start(d.id, d.frames[0].id); device.onConnected!!()
        sched.runAll() // flush the renders the edits scheduled
        device.app.clear()
        val s = c.setPlaying(true)
        assertTrue(s.playing)
        assertEquals(listOf(10), device.app) // first frame straight away
        val first = sched.tasks.first { !it.cancelled }
        assertEquals(100L, first.delayMs)
        nextTask()
        assertEquals(listOf(10, 20), device.app)
        assertEquals(300L, sched.tasks.first { !it.cancelled }.delayMs)
        nextTask()
        assertEquals(listOf(10, 20, 10), device.app) // loops
    }

    @Test fun stoppingPlaybackGoesBackToTheSelectedFrame() {
        val c = controller()
        val d = animated()
        c.start(d.id, d.frames[1].id); device.onConnected!!()
        sched.runAll()
        c.setPlaying(true)
        nextTask()
        device.app.clear()
        val s = c.setPlaying(false)
        assertFalse(s.playing)
        assertEquals(listOf(20), device.app) // the selected frame (frame 2), not wherever the animation was
        assertEquals(0, sched.pending())
    }

    @Test fun stoppingThePreviewAlsoStopsPlayback() {
        val c = controller()
        val d = animated()
        c.start(d.id, null); device.onConnected!!()
        sched.runAll()
        c.setPlaying(true)
        c.stop()
        device.app.clear()
        sched.runAll()
        assertTrue(device.app.isEmpty())
        assertFalse(c.status().playing)
        assertEquals(1, device.closeApps)
    }

    @Test fun playbackIsIgnoredWithoutAnActivePreview() {
        val c = controller()
        val s = c.setPlaying(true)
        assertFalse(s.playing); assertFalse(s.active)
        assertEquals(0, device.connects)
    }

    @Test fun playbackStartedBeforeTheMatrixIsReadyBeginsWhenItConnects() {
        val c = controller()
        val d = animated()
        c.start(d.id, null)
        c.setPlaying(true) // matrix still connecting
        assertTrue(device.app.isEmpty())
        device.onConnected!!()
        assertEquals(10, device.app.last())
        assertTrue(c.status().playing)
    }

    @Test fun editsWhilePlayingRestartTheAnimationWithTheNewContent() {
        val c = controller()
        val d = animated()
        c.start(d.id, null); device.onConnected!!()
        sched.runAll()
        c.setPlaying(true)
        draw(d, 99, frame = 0) // someone edits frame 1 from another device
        sched.runAll()
        assertEquals(99, device.app.last())
    }

    @Test fun onceModeEndsOnItsLastFrame() {
        val c = controller()
        val d = animated()
        hub.apply(d.id, Op.SetLoop("once"), "pc")
        c.start(d.id, null); device.onConnected!!()
        sched.runAll()
        device.app.clear()
        c.setPlaying(true)
        nextTask(); nextTask()
        assertEquals(listOf(10, 20), device.app)
        assertEquals(0, sched.pending()) // finished: no timer left
    }
}
