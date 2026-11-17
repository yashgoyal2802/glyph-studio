package com.yash.glyphstudio.slots

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.generated.SharedConstants as C
import com.yash.glyphstudio.playback.BakedAnimation
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.Op
import com.yash.glyphstudio.sync.SyncHub
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SlotStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    private val led = C.LED_MASK.indexOfFirst { it }
    private lateinit var repo: DesignRepository
    private lateinit var hub: SyncHub
    private val refresh = FakeScheduler() // the slot store's own short delay
    private fun slotsFile() = File(tmp.root, "slots.json")

    private fun store(logs: MutableList<String>? = null): SlotStore {
        repo = DesignRepository(File(tmp.root, "designs"))
        hub = SyncHub(repo, FakeScheduler())
        return SlotStore(slotsFile(), repo, hub, refresh, log = { logs?.add(it) })
    }

    private fun draw(d: Design, value: Int) =
        hub.apply(d.id, Op.SetPixels(d.frames[0].id, d.frames[0].layers[0].id, intArrayOf(led), intArrayOf(value)), "pc")

    @Test fun startsEmpty() {
        val s = store()
        assertEquals(List(5) { null }, s.info().map { it.designId })
        for (n in 1..5) { assertNull(s.assignment(n)); assertNull(s.animation(n)) }
    }

    @Test fun assignReplaceAndClear() {
        val s = store()
        val a = repo.create("A"); val b = repo.create("B")
        assertTrue(s.assign(2, a.id))
        assertEquals(a.id, s.assignment(2))
        assertEquals("A", s.info()[1].designName)
        assertTrue(s.assign(2, b.id)) // replace
        assertEquals(b.id, s.assignment(2))
        s.clear(2)
        assertNull(s.assignment(2))
        assertNull(s.info()[1].designName)
    }

    @Test fun oneDesignCanSitInSeveralSlots() {
        val s = store()
        val a = repo.create("A")
        s.assign(1, a.id); s.assign(4, a.id)
        assertEquals(listOf(a.id, null, null, a.id, null), s.info().map { it.designId })
    }

    @Test fun rejectsBadSlotsAndUnknownDesigns() {
        val s = store()
        val a = repo.create("A")
        for (bad in listOf(0, 6, -1)) {
            try { s.assign(bad, a.id); fail("slot $bad should be rejected") } catch (_: IllegalArgumentException) {}
            try { s.assignment(bad); fail() } catch (_: IllegalArgumentException) {}
        }
        assertFalse(s.assign(1, "no-such-design"))
        assertNull(s.assignment(1))
    }

    @Test fun assignmentsSurviveARestart() {
        val first = store()
        val a = repo.create("A"); val b = repo.create("B")
        first.assign(1, a.id); first.assign(5, b.id)
        val second = store() // same files = app restart
        assertEquals(a.id, second.assignment(1))
        assertEquals(b.id, second.assignment(5))
        assertNull(second.assignment(3))
    }

    @Test fun aSlotWhoseDesignVanishedWhileTheAppWasClosedIsCleared() {
        val first = store()
        val a = repo.create("A")
        first.assign(3, a.id)
        File(tmp.root, "designs/${a.id}.glyph.json").delete()
        val logs = mutableListOf<String>()
        val second = store(logs)
        assertNull(second.assignment(3))
        assertTrue(logs.any { it.contains("Slot 3") })
    }

    @Test fun aCorruptSlotsFileMeansEmptySlotsNotACrash() {
        tmp.root.mkdirs()
        slotsFile().writeText("{ nonsense")
        val logs = mutableListOf<String>()
        val s = store(logs)
        assertEquals(List(5) { null }, s.info().map { it.designId })
        assertTrue(logs.isNotEmpty())
    }

    @Test fun deletingADesignEmptiesEverySlotThatUsedItAndTellsWatchers() {
        val s = store()
        val a = repo.create("A"); val keep = repo.create("Keep")
        s.assign(1, a.id); s.assign(3, a.id); s.assign(2, keep.id)
        val seen = mutableListOf<BakedAnimation?>()
        s.observe(3) { seen.add(it) }
        assertNotNull(seen.last())
        repo.delete(a.id)
        assertNull(s.assignment(1)); assertNull(s.assignment(3))
        assertEquals(keep.id, s.assignment(2))
        assertNull(seen.last()) // the toy is told to show the empty-slot picture
        assertNull(store().assignment(1)) // and it stays cleared after a restart
    }

    @Test fun animationIncludesEditsThatAreNotOnDiskYet() {
        val s = store()
        val a = repo.create("A")
        s.assign(1, a.id)
        draw(a, 200)
        assertEquals(200, s.animation(1)!!.frames[0].pixels[led])
        assertEquals(0, repo.get(a.id)!!.frames[0].layers[0].let { (it as com.yash.glyphstudio.design.PixelsLayer).data[led].toInt() })
    }

    @Test fun watchersGetTheCurrentPictureAtOnceAndEveryLaterEdit() {
        val s = store()
        val a = repo.create("A")
        s.assign(1, a.id)
        val seen = mutableListOf<Int>()
        s.observe(1) { anim -> seen.add(anim!!.frames[0].pixels[led]) }
        assertEquals(listOf(0), seen) // initial call
        draw(a, 100)
        refresh.runAll()
        draw(a, 255)
        refresh.runAll()
        assertEquals(listOf(0, 100, 255), seen)
    }

    @Test fun manyQuickEditsBecomeOneRefresh() {
        val s = store()
        val a = repo.create("A")
        s.assign(1, a.id)
        var calls = 0
        s.observe(1) { calls++ }
        repeat(20) { draw(a, it + 1) }
        assertEquals(1, refresh.pending())
        refresh.runAll()
        assertEquals(2, calls) // initial + one refresh
        assertEquals(20, s.animation(1)!!.frames[0].pixels[led])
    }

    @Test fun reassigningTellsTheWatcherAboutTheNewDesign() {
        val s = store()
        val a = repo.create("A"); val b = repo.create("B")
        draw(a, 11); draw(b, 22)
        s.assign(1, a.id)
        val seen = mutableListOf<Int?>()
        s.observe(1) { seen.add(it?.frames?.get(0)?.pixels?.get(led)) }
        s.assign(1, b.id)
        s.clear(1)
        assertEquals(listOf(11, 22, null), seen)
        draw(b, 33) // no longer this slot's design: nothing to refresh
        refresh.runAll()
        assertEquals(listOf(11, 22, null), seen)
    }

    @Test fun closingAWatcherStopsNotificationsAndHubSubscription() {
        val s = store()
        val a = repo.create("A")
        s.assign(1, a.id)
        var calls = 0
        val sub = s.observe(1) { calls++ }
        sub.close()
        draw(a, 5)
        refresh.runAll()
        assertEquals(1, calls) // only the initial call
    }

    @Test fun otherSlotsWatchersAreNotDisturbed() {
        val s = store()
        val a = repo.create("A"); val b = repo.create("B")
        s.assign(1, a.id); s.assign(2, b.id)
        var calls2 = 0
        s.observe(2) { calls2++ }
        draw(a, 9)
        refresh.runAll()
        assertEquals(1, calls2)
    }
}
