package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignRepository
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

fun interface Cancellable { fun cancel() }

interface Scheduler {
    fun schedule(delayMs: Long, task: () -> Unit): Cancellable
}

class ExecutorScheduler(private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()) : Scheduler {
    override fun schedule(delayMs: Long, task: () -> Unit): Cancellable {
        val f = executor.schedule(task, delayMs, TimeUnit.MILLISECONDS)
        return Cancellable { f.cancel(false) }
    }
}

sealed interface ApplyResult {
    data class Applied(val revision: Long) : ApplyResult
    data class Rejected(val reason: String) : ApplyResult
}

data class Snapshot(val design: Design, val revision: Long)

/**
 * Applies operations to designs in arrival order, persists them (debounced), and tells everyone who has the
 * design open what changed. The phone is the single source of truth (design.md decision 5).
 *
 * Subscribers are called while the hub's lock is held so every subscriber sees updates in revision order;
 * they must therefore return quickly (enqueue the update and send it elsewhere).
 */
class SyncHub(
    private val repo: DesignRepository,
    private val scheduler: Scheduler,
    private val persistDelayMs: Long = 500,
) {
    data class Update(val designId: String, val revision: Long, val op: Op, val origin: String)

    interface Subscriber {
        fun onUpdate(update: Update)
        fun onDeleted(designId: String) {}

        /** The design, up to and including [revision], has been written to disk. */
        fun onSaved(designId: String, revision: Long) {}
    }

    private class Working(var design: Design, var revision: Long = 0, var timer: Cancellable? = null, var dirty: Boolean = false)

    private val lock = Any()
    private val working = HashMap<String, Working>()
    private val subscribers = HashMap<String, MutableList<Subscriber>>()
    private val persisting = ThreadLocal<Boolean>()

    private val repoListener = object : DesignRepository.Listener {
        override fun onSaved(design: Design) {
            if (persisting.get() == true) return // our own debounced save
            // Someone saved this design behind the hub's back (import, rename in the library): drop the cached copy.
            synchronized(lock) { working.remove(design.id) }
        }

        override fun onDeleted(id: String) {
            synchronized(lock) {
                working.remove(id)?.timer?.cancel()
                subscribers.remove(id)?.forEach { it.onDeleted(id) }
            }
        }
    }

    init { repo.addListener(repoListener) }

    /** Current content (including edits not yet written to disk) and revision, or null for an unknown id. */
    fun snapshot(designId: String): Snapshot? = synchronized(lock) { load(designId)?.let { Snapshot(it.design, it.revision) } }

    fun apply(designId: String, op: Op, origin: String): ApplyResult = synchronized(lock) {
        val w = load(designId) ?: return ApplyResult.Rejected("Unknown design: $designId")
        val next = try { Operations.apply(w.design, op) } catch (e: OpException) { return ApplyResult.Rejected(e.message ?: "Rejected") }
        w.design = next
        w.revision++
        w.dirty = true
        if (w.timer == null) w.timer = scheduler.schedule(persistDelayMs) { flush(designId) }
        val update = Update(designId, w.revision, op, origin)
        subscribers[designId]?.toList()?.forEach { it.onUpdate(update) }
        ApplyResult.Applied(w.revision)
    }

    fun subscribe(designId: String, subscriber: Subscriber): AutoCloseable {
        synchronized(lock) { subscribers.getOrPut(designId) { mutableListOf() }.add(subscriber) }
        return AutoCloseable { synchronized(lock) { subscribers[designId]?.remove(subscriber) } }
    }

    /** Write any unsaved edits of [designId] to disk now. */
    fun flush(designId: String) = synchronized(lock) {
        val w = working[designId] ?: return@synchronized
        w.timer?.cancel()
        w.timer = null
        if (!w.dirty) return@synchronized
        persisting.set(true)
        try {
            val stored = repo.save(w.design)
            w.design = w.design.copy(modified = stored.modified)
            w.dirty = false
            subscribers[designId]?.toList()?.forEach { it.onSaved(designId, w.revision) }
        } finally {
            persisting.remove()
        }
    }

    fun flushAll() = synchronized(lock) { working.keys.toList() }.forEach { flush(it) }

    private fun load(id: String): Working? {
        working[id]?.let { return it }
        val d = repo.get(id) ?: return null
        return Working(d).also { working[id] = it }
    }
}
