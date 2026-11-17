package com.yash.glyphstudio.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeMatrixDevice : MatrixDevice {
    var connects = 0
    var disconnects = 0
    var onConnected: (() -> Unit)? = null
    var onDisconnected: (() -> Unit)? = null
    val toy = mutableListOf<Int>()
    val app = mutableListOf<Int>()
    var closeApps = 0
    var turnOffs = 0
    var failNext = false
    override fun connect(onConnected: () -> Unit, onDisconnected: () -> Unit) { connects++; this.onConnected = onConnected; this.onDisconnected = onDisconnected }
    override fun disconnect() { disconnects++ }
    private fun maybeFail() { if (failNext) { failNext = false; error("not supported") } }
    // Frames are recorded as their brightest value, which identifies the single lit cell the tests draw.
    override fun toyFrame(pixels: IntArray) { maybeFail(); toy.add(pixels.max()) }
    override fun appFrame(pixels: IntArray) { maybeFail(); app.add(pixels.max()) }
    override fun closeApp() { closeApps++ }
    override fun turnOff() { turnOffs++ }
}

class MatrixLinkTest {
    private fun px(v: Int) = IntArray(625).also { it[0] = v }

    @Test fun theFirstLeaseOpensTheConnectionAndIsToldWhenItIsReady() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        var ready = 0
        link.acquire { ready++ }
        assertEquals(1, d.connects)
        assertEquals(0, ready) // not yet: the system service has not answered
        assertFalse(link.isReady)
        d.onConnected!!()
        assertEquals(1, ready)
        assertTrue(link.isReady)
    }

    @Test fun aSecondUserSharesTheConnectionAndIsReadyAtOnce() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        link.acquire {}; d.onConnected!!()
        var ready = 0
        link.acquire { ready++ }
        assertEquals(1, d.connects) // no second connection
        assertEquals(1, ready)
    }

    @Test fun twoUsersWaitingTogetherAreBothToldWhenReady() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        var a = 0; var b = 0
        link.acquire { a++ }; link.acquire { b++ }
        assertEquals(1, d.connects)
        d.onConnected!!()
        assertEquals(listOf(1, 1), listOf(a, b))
    }

    @Test fun theConnectionClosesOnlyWhenTheLastUserLeaves() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        val toy = link.acquire {}; val preview = link.acquire {}
        d.onConnected!!()
        toy.close()
        assertEquals(0, d.disconnects) // the preview still needs it
        assertTrue(link.isReady)
        preview.close()
        assertEquals(1, d.disconnects)
        assertFalse(link.isReady)
    }

    @Test fun closingALeaseTwiceIsHarmless() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        val a = link.acquire {}; val b = link.acquire {}
        d.onConnected!!()
        a.close(); a.close(); a.close()
        assertEquals(0, d.disconnects)
        b.close()
        assertEquals(1, d.disconnects)
    }

    @Test fun aLeaseClosedBeforeTheMatrixIsReadyIsNeverCalled() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        var called = 0
        val lease = link.acquire { called++ }
        lease.close()
        assertEquals(1, d.disconnects)
        d.onConnected?.invoke()
        assertEquals(0, called)
    }

    @Test fun reconnectsOnTheNextLeaseAfterEveryoneLeft() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        link.acquire {}.also { d.onConnected!!(); it.close() }
        var ready = 0
        link.acquire { ready++ }
        assertEquals(2, d.connects)
        assertEquals(0, ready)
        d.onConnected!!()
        assertEquals(1, ready)
    }

    @Test fun framesGoToTheRightPathAndAreRefusedWhenNotConnected() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        assertFalse(link.showToy(px(1)))
        assertFalse(link.showApp(px(2)))
        link.acquire {}; d.onConnected!!()
        assertTrue(link.showToy(px(3)))
        assertTrue(link.showApp(px(4)))
        assertTrue(link.releaseApp()); assertTrue(link.turnOff())
        assertEquals(listOf(3), d.toy)
        assertEquals(listOf(4), d.app)
        assertEquals(1, d.closeApps); assertEquals(1, d.turnOffs)
    }

    @Test fun aFailingDeviceCallIsReportedAsFalseNotThrown() {
        val logs = mutableListOf<String>()
        val d = FakeMatrixDevice(); val link = MatrixLink(d, log = { logs.add(it) })
        link.acquire {}; d.onConnected!!()
        d.failNext = true
        assertFalse(link.showApp(px(1)))
        assertTrue(logs.any { it.contains("not supported") })
        assertTrue(link.showApp(px(2))) // recovers
    }

    @Test fun losingTheServiceMarksItNotReady() {
        val d = FakeMatrixDevice(); val link = MatrixLink(d)
        link.acquire {}; d.onConnected!!()
        d.onDisconnected!!()
        assertFalse(link.isReady)
        assertFalse(link.showToy(px(1)))
    }
}
