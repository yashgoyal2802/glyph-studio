package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.design.PixelsLayer
import com.yash.glyphstudio.generated.SharedConstants as C
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

class FakeScheduler : Scheduler {
    class Task(val delayMs: Long, val run: () -> Unit) { var cancelled = false }
    val tasks = mutableListOf<Task>()
    override fun schedule(delayMs: Long, task: () -> Unit): Cancellable {
        val t = Task(delayMs, task)
        tasks.add(t)
        return Cancellable { t.cancelled = true }
    }
    fun pending() = tasks.count { !it.cancelled }
    fun runAll() { tasks.filter { !it.cancelled }.forEach { it.cancelled = true; it.run() } }
}

class SyncHubTest {
    @get:Rule val tmp = TemporaryFolder()

    private val ledCells = C.LED_MASK.indices.filter { C.LED_MASK[it] }
    private fun repo() = DesignRepository(tmp.root)
    private fun px(d: Design) = (d.frames[0].layers[0] as PixelsLayer).data
    private fun v(d: Design, i: Int) = px(d)[i].toInt() and 0xFF

    private fun setPx(d: Design, vararg cells: Pair<Int, Int>) =
        Op.SetPixels(d.frames[0].id, d.frames[0].layers[0].id, cells.map { it.first }.toIntArray(), cells.map { it.second }.toIntArray())

    @Test fun appliesOpsAndReturnsIncreasingRevisions() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        assertEquals(ApplyResult.Applied(1), hub.apply(d.id, setPx(d, ledCells[0] to 255), "phone"))
        assertEquals(ApplyResult.Applied(2), hub.apply(d.id, Op.Rename("b"), "pc"))
        val snap = hub.snapshot(d.id)!!
        assertEquals(2L, snap.revision)
        assertEquals("b", snap.design.name)
        assertEquals(255, v(snap.design, ledCells[0]))
    }

    @Test fun rejectedOpsLeaveDesignAndRevisionUntouched() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        assertTrue(hub.apply(d.id, Op.DeleteFrame("ghost"), "pc") is ApplyResult.Rejected)
        assertTrue(hub.apply("no-such-design", Op.Rename("x"), "pc") is ApplyResult.Rejected)
        assertEquals(0L, hub.snapshot(d.id)!!.revision)
        assertNull(hub.snapshot("no-such-design"))
    }

    @Test fun concurrentPixelOpsFromTwoClientsAreBothKept() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        val phoneCells = ledCells.filterIndexed { i, _ -> i % 2 == 0 }
        val pcCells = ledCells.filterIndexed { i, _ -> i % 2 == 1 }
        val start = CountDownLatch(1)
        fun client(name: String, cells: List<Int>, value: Int) = thread {
            start.await()
            cells.forEach { hub.apply(d.id, setPx(d, it to value), name) }
        }
        val a = client("phone", phoneCells, 200)
        val b = client("pc", pcCells, 90)
        start.countDown(); a.join(); b.join()
        val out = hub.snapshot(d.id)!!
        assertTrue("every phone stroke survives", phoneCells.all { v(out.design, it) == 200 })
        assertTrue("every pc stroke survives", pcCells.all { v(out.design, it) == 90 })
        assertEquals(ledCells.size.toLong(), out.revision)
    }

    @Test fun sameCellFromTwoClientsLastArrivalWins() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        hub.apply(d.id, setPx(d, ledCells[5] to 10), "phone")
        hub.apply(d.id, setPx(d, ledCells[5] to 20), "pc")
        assertEquals(20, v(hub.snapshot(d.id)!!.design, ledCells[5]))
    }

    @Test fun subscribersSeeEveryUpdateInOrderWithOrigin() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        val got = CopyOnWriteArrayList<SyncHub.Update>()
        hub.subscribe(d.id, object : SyncHub.Subscriber { override fun onUpdate(update: SyncHub.Update) { got.add(update) } })
        hub.apply(d.id, Op.Rename("x"), "phone")
        hub.apply(d.id, Op.SetLoop("bounce"), "pc")
        assertEquals(listOf(1L, 2L), got.map { it.revision })
        assertEquals(listOf("phone", "pc"), got.map { it.origin })
        assertTrue(got[1].op is Op.SetLoop)
        assertEquals(d.id, got[0].designId)
    }

    @Test fun concurrentUpdatesAreDeliveredInRevisionOrder() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        val got = CopyOnWriteArrayList<Long>()
        hub.subscribe(d.id, object : SyncHub.Subscriber { override fun onUpdate(update: SyncHub.Update) { got.add(update.revision) } })
        val start = CountDownLatch(1)
        val threads = (1..4).map { t -> thread { start.await(); repeat(50) { hub.apply(d.id, Op.Rename("n$t-$it"), "c$t") } } }
        start.countDown(); threads.forEach { it.join() }
        assertEquals((1L..200L).toList(), got.toList())
    }

    @Test fun unsubscribedAndOtherDesignSubscribersGetNothing() {
        val r = repo(); val d = r.create("a"); val other = r.create("b")
        val hub = SyncHub(r, FakeScheduler())
        val got = CopyOnWriteArrayList<String>()
        val sub = hub.subscribe(d.id, object : SyncHub.Subscriber { override fun onUpdate(update: SyncHub.Update) { got.add("d") } })
        hub.subscribe(other.id, object : SyncHub.Subscriber { override fun onUpdate(update: SyncHub.Update) { got.add("other") } })
        hub.apply(d.id, Op.Rename("x"), "pc")
        sub.close()
        hub.apply(d.id, Op.Rename("y"), "pc")
        assertEquals(listOf("d"), got.toList())
    }

    @Test fun persistsOnceAfterTheDelayNotOnEveryOp() {
        val r = repo(); val d = r.create("a")
        val sched = FakeScheduler()
        val hub = SyncHub(r, sched, persistDelayMs = 500)
        repeat(5) { hub.apply(d.id, Op.Rename("name$it"), "pc") }
        assertEquals(1, sched.pending())
        assertEquals(500L, sched.tasks.first().delayMs)
        assertEquals("a", repo().get(d.id)!!.name) // not on disk yet
        sched.runAll()
        assertEquals("name4", repo().get(d.id)!!.name) // restart sees the final state
        assertEquals(0, sched.pending())
        hub.apply(d.id, Op.Rename("later"), "pc")
        assertEquals(1, sched.pending()) // a new change schedules a new save
    }

    @Test fun subscribersAreToldWhenTheDesignReachesTheDisk() {
        val r = repo(); val d = r.create("a")
        val sched = FakeScheduler()
        val hub = SyncHub(r, sched)
        val saved = CopyOnWriteArrayList<Long>()
        hub.subscribe(d.id, object : SyncHub.Subscriber {
            override fun onUpdate(update: SyncHub.Update) {}
            override fun onSaved(designId: String, revision: Long) { saved.add(revision) }
        })
        hub.apply(d.id, Op.Rename("x"), "pc")
        hub.apply(d.id, Op.Rename("y"), "pc")
        assertTrue(saved.isEmpty()) // not yet: the save is delayed
        sched.runAll()
        assertEquals(listOf(2L), saved) // one save covers both edits, and says which revision it includes
        hub.apply(d.id, Op.Rename("z"), "pc")
        hub.flush(d.id)
        assertEquals(listOf(2L, 3L), saved)
        hub.flush(d.id) // nothing new to write: no repeat notification
        assertEquals(listOf(2L, 3L), saved)
    }

    @Test fun flushWritesImmediatelyAndCancelsTheTimer() {
        val r = repo(); val d = r.create("a")
        val sched = FakeScheduler()
        val hub = SyncHub(r, sched)
        hub.apply(d.id, setPx(d, ledCells[3] to 77), "pc")
        hub.flush(d.id)
        assertEquals(77, v(repo().get(d.id)!!, ledCells[3]))
        assertEquals(0, sched.pending())
    }

    @Test fun snapshotShowsUnsavedEditsWhileRepositoryStillHasOldData() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        hub.apply(d.id, Op.Rename("unsaved"), "pc")
        assertEquals("unsaved", hub.snapshot(d.id)!!.design.name)
        assertEquals("a", r.get(d.id)!!.name)
    }

    @Test fun deletingADesignDropsItNotifiesAndStopsFutureWrites() {
        val r = repo(); val d = r.create("a")
        val sched = FakeScheduler()
        val hub = SyncHub(r, sched)
        val deleted = CopyOnWriteArrayList<String>()
        hub.subscribe(d.id, object : SyncHub.Subscriber {
            override fun onUpdate(update: SyncHub.Update) {}
            override fun onDeleted(designId: String) { deleted.add(designId) }
        })
        hub.apply(d.id, Op.Rename("x"), "pc")
        r.delete(d.id)
        sched.runAll() // the pending save must not resurrect the design
        assertEquals(listOf(d.id), deleted.toList())
        assertNull(hub.snapshot(d.id))
        assertFalse(repo().list().any { it.id == d.id })
        assertTrue(hub.apply(d.id, Op.Rename("y"), "pc") is ApplyResult.Rejected)
    }

    @Test fun savesMadeOutsideTheHubAreNotOverwrittenByStaleCache() {
        val r = repo(); val d = r.create("a")
        val hub = SyncHub(r, FakeScheduler())
        hub.apply(d.id, setPx(d, ledCells[0] to 1), "pc")
        hub.flush(d.id)
        r.rename(d.id, "renamed in library") // outside the hub
        assertEquals("renamed in library", hub.snapshot(d.id)!!.design.name)
    }
}
