package com.yash.glyphstudio.slots

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.playback.Baker
import com.yash.glyphstudio.playback.BakedAnimation
import com.yash.glyphstudio.sync.Cancellable
import com.yash.glyphstudio.sync.Scheduler
import com.yash.glyphstudio.sync.SyncHub
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * The five Glyph Toy slots ("Toy 1".."Toy 5"). Each slot points at one design (or is empty); one design may sit in
 * several slots. The store keeps the choice on disk, drops a slot when its design is deleted, and tells anyone watching a
 * slot (a running toy) whenever what it should show changes, including edits that have not been saved to disk yet.
 */
class SlotStore(
    private val file: File,
    private val repo: DesignRepository,
    private val hub: SyncHub,
    private val scheduler: Scheduler,
    private val log: (String) -> Unit = {},
) {
    data class Info(val slot: Int, val designId: String?, val designName: String?)

    private val lock = Any()
    private val assigned = arrayOfNulls<String>(COUNT)
    private val baked = arrayOfNulls<BakedAnimation>(COUNT)
    private val observers = HashMap<Int, MutableList<(BakedAnimation?) -> Unit>>()
    private val hubSubscriptions = HashMap<String, AutoCloseable>() // design id -> subscription
    private val pendingRefresh = HashMap<String, Cancellable>()

    private val repoListener = object : DesignRepository.Listener {
        override fun onDeleted(id: String) {
            val affected = synchronized(lock) {
                val slots = (1..COUNT).filter { assigned[it - 1] == id } // slot numbers as users see them (1..5)
                slots.forEach { assigned[it - 1] = null; baked[it - 1] = null }
                if (slots.isNotEmpty()) save()
                dropSubscriptionIfUnused(id)
                slots
            }
            affected.forEach { notifySlot(it) }
        }
    }

    init {
        load()
        repo.addListener(repoListener)
    }

    /** Slot numbers are 1..[COUNT], as users see them. */
    private fun idx(slot: Int): Int {
        require(slot in 1..COUNT) { "Slot must be 1..$COUNT" }
        return slot - 1
    }

    fun assignment(slot: Int): String? = synchronized(lock) { assigned[idx(slot)] }

    fun info(): List<Info> = synchronized(lock) {
        (1..COUNT).map { s -> assigned[s - 1].let { id -> Info(s, id, id?.let { repo.get(it)?.name }) } }
    }

    /** Put [designId] in [slot]. False if the design does not exist. */
    fun assign(slot: Int, designId: String): Boolean {
        val i = idx(slot)
        if (repo.get(designId) == null) return false
        synchronized(lock) {
            val old = assigned[i]
            assigned[i] = designId
            baked[i] = null
            save()
            if (observers[slot].orEmpty().isNotEmpty()) subscribeToHub(designId)
            old?.let { dropSubscriptionIfUnused(it) }
        }
        notifySlot(slot)
        return true
    }

    fun clear(slot: Int) {
        val i = idx(slot)
        synchronized(lock) {
            val old = assigned[i]
            assigned[i] = null
            baked[i] = null
            save()
            old?.let { dropSubscriptionIfUnused(it) }
        }
        notifySlot(slot)
    }

    /** What the slot should show right now (including unsaved edits), or null when it is empty. */
    fun animation(slot: Int): BakedAnimation? {
        val i = idx(slot)
        synchronized(lock) {
            baked[i]?.let { return it }
            val id = assigned[i] ?: return null
            val design = hub.snapshot(id)?.design ?: return null
            return Baker.bake(design).also { baked[i] = it }
        }
    }

    /**
     * Watch [slot]. [listener] is called straight away with the current animation (null = empty slot), then again
     * whenever the assignment or the design's content changes. Close the result to stop.
     */
    fun observe(slot: Int, listener: (BakedAnimation?) -> Unit): AutoCloseable {
        idx(slot)
        synchronized(lock) {
            observers.getOrPut(slot) { mutableListOf() }.add(listener)
            assigned[slot - 1]?.let { subscribeToHub(it) }
        }
        listener(animation(slot))
        return AutoCloseable {
            synchronized(lock) {
                observers[slot]?.remove(listener)
                assigned[slot - 1]?.let { dropSubscriptionIfUnused(it) }
            }
        }
    }

    // ---- internals -------------------------------------------------------------------------------------------

    private fun hasObservers(designId: String) =
        (1..COUNT).any { assigned[it - 1] == designId && observers[it].orEmpty().isNotEmpty() }

    private fun subscribeToHub(designId: String) {
        if (hubSubscriptions.containsKey(designId)) return
        hubSubscriptions[designId] = hub.subscribe(designId, object : SyncHub.Subscriber {
            // Called inside the hub's lock, so only schedule work here and do it later.
            override fun onUpdate(update: SyncHub.Update) = scheduleRefresh(designId)
        })
    }

    private fun dropSubscriptionIfUnused(designId: String) {
        if (!hasObservers(designId)) hubSubscriptions.remove(designId)?.close()
    }

    /** Several quick edits (a stroke is many events) become one refresh a moment later. */
    private fun scheduleRefresh(designId: String) {
        synchronized(lock) {
            if (pendingRefresh.containsKey(designId)) return
            pendingRefresh[designId] = scheduler.schedule(REFRESH_DELAY_MS) {
                val slots = synchronized(lock) {
                    pendingRefresh.remove(designId)
                    (1..COUNT).filter { assigned[it - 1] == designId }.also { s -> s.forEach { baked[it - 1] = null } }
                }
                slots.forEach { notifySlot(it) }
            }
        }
    }

    private fun notifySlot(slot: Int) {
        val listeners = synchronized(lock) { observers[slot].orEmpty().toList() }
        if (listeners.isEmpty()) return
        val anim = animation(slot)
        listeners.forEach { it(anim) }
    }

    private fun load() {
        if (!file.exists()) return
        try {
            val arr = JSONObject(file.readText()).getJSONArray("slots")
            for (i in 0 until minOf(arr.length(), COUNT)) {
                val id = arr.opt(i) as? String
                if (id == null) continue
                if (repo.get(id) != null) assigned[i] = id else log("Slot ${i + 1} pointed at a missing design; cleared")
            }
        } catch (e: JSONException) {
            log("Could not read slots file; starting with empty slots: ${e.message}")
        }
    }

    private fun save() {
        val arr = JSONArray()
        assigned.forEach { arr.put(it ?: JSONObject.NULL) }
        val tmp = File(file.parentFile, file.name + ".tmp")
        file.parentFile?.mkdirs()
        tmp.writeText(JSONObject().put("slots", arr).toString())
        try {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        const val COUNT = 5
        const val REFRESH_DELAY_MS = 30L
    }
}
