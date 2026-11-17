package com.yash.glyphstudio.design

import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Stores designs as one JSON file each (`<id>.glyph.json`) in [dir]. Writes are atomic (temp file + move), so a
 * crash mid-save never leaves a half-written design. All designs are also kept in memory for fast listing.
 */
class DesignRepository(
    private val dir: File,
    private val clock: () -> Long = System::currentTimeMillis,
    private val log: (String) -> Unit = {},
) {
    /** [thumb] is the first frame's pixels (base64, 625 bytes) so the library can draw a preview without loading designs. */
    data class Summary(val id: String, val name: String, val frameCount: Int, val modified: Long, val thumb: String = "")

    interface Listener {
        fun onSaved(design: Design) {}
        fun onDeleted(id: String) {}
    }

    private val lock = Any()
    private val designs = LinkedHashMap<String, Design>()
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<Listener>()

    init {
        dir.mkdirs()
        // Leftover temp files from an interrupted save are safe to drop: the real file was never replaced.
        dir.listFiles { f -> f.name.endsWith(".tmp") }?.forEach { it.delete() }
        dir.listFiles { f -> f.name.endsWith(SUFFIX) }?.forEach { file ->
            when (val r = DesignCodec.parse(file.readText())) {
                is ParseResult.Ok -> designs[r.design.id] = r.design
                is ParseResult.Error -> log("Skipping unreadable design ${file.name}: ${r.message}")
            }
        }
    }

    fun addListener(l: Listener) { listeners.add(l) }
    fun removeListener(l: Listener) { listeners.remove(l) }

    /** Newest modified first. */
    fun list(): List<Summary> = synchronized(lock) {
        designs.values.map { summaryOf(it) }.sortedByDescending { it.modified }
    }

    fun summaryOf(d: Design): Summary {
        val first = d.frames.firstOrNull()?.layers?.filterIsInstance<PixelsLayer>()?.firstOrNull()
        val thumb = first?.let { java.util.Base64.getEncoder().encodeToString(it.data) } ?: ""
        return Summary(d.id, d.name, d.frames.size, d.modified, thumb)
    }

    fun get(id: String): Design? = synchronized(lock) { designs[id] }

    fun create(name: String = "Untitled"): Design = save(DesignCodec.createDesign(name, clock()))

    /** Persists [design], stamping its modified time, and returns the stored copy. */
    fun save(design: Design): Design {
        require(isValidId(design.id)) { "Invalid design id" }
        val stored = design.copy(modified = clock())
        synchronized(lock) {
            writeAtomically(fileFor(stored.id), DesignCodec.serialize(stored).toString())
            designs[stored.id] = stored
        }
        listeners.forEach { it.onSaved(stored) }
        return stored
    }

    fun rename(id: String, name: String): Design? = get(id)?.let { save(it.copy(name = name)) }

    fun duplicate(id: String): Design? {
        val src = get(id) ?: return null
        val now = clock()
        return save(src.copy(id = java.util.UUID.randomUUID().toString(), name = "${src.name} copy", created = now))
    }

    fun delete(id: String): Boolean {
        if (!isValidId(id)) return false
        val existed = synchronized(lock) {
            val had = designs.remove(id) != null
            fileFor(id).delete()
            historyFile(id).delete()
            had
        }
        if (existed) listeners.forEach { it.onDeleted(id) }
        return existed
    }

    private fun fileFor(id: String) = File(dir, id + SUFFIX)
    private fun historyFile(id: String) = File(dir, id + HISTORY_SUFFIX)

    // ---- undo history ------------------------------------------------------------------------------------------
    // The editor's undo/redo stacks are kept next to the design so they survive closing it. The file starts with a
    // fingerprint of the design the history belongs to; a history is only ever handed back for exactly that design.

    /**
     * Keep [body] (the editor's history, JSON text) for [id], recorded against [fingerprint] of the design as it is now.
     * False when the design is unknown or the history is too large (nothing is kept, and any older history is dropped).
     */
    fun saveHistory(id: String, fingerprint: String, body: String): Boolean {
        if (!isValidId(id)) return false
        if (body.length > MAX_HISTORY_CHARS || synchronized(lock) { designs[id] } == null) {
            deleteHistory(id)
            return false
        }
        synchronized(lock) { writeAtomically(historyFile(id), fingerprint + "\n" + body) }
        return true
    }

    /** The stored history when it was recorded for exactly [fingerprint]; otherwise it is stale, gets deleted, and null is returned. */
    fun loadHistory(id: String, fingerprint: String): String? {
        if (!isValidId(id)) return null
        return synchronized(lock) {
            val f = historyFile(id)
            if (!f.exists()) return@synchronized null
            val text = f.readText()
            val nl = text.indexOf('\n')
            if (nl < 0 || text.substring(0, nl) != fingerprint) { f.delete(); null } else text.substring(nl + 1)
        }
    }

    fun deleteHistory(id: String) {
        if (isValidId(id)) synchronized(lock) { historyFile(id).delete() }
    }

    private fun writeAtomically(target: File, text: String) {
        val tmp = File(dir, target.name + ".tmp")
        tmp.writeText(text)
        try {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        const val SUFFIX = ".glyph.json"
        const val HISTORY_SUFFIX = ".history.json"
        /** A history file larger than this is not kept (the editor trims its history to fit well below this). */
        const val MAX_HISTORY_CHARS = 2_000_000

        /** Identifies a design's content (everything but its modified time) so stored history can tell whether the design has changed since. */
        fun fingerprint(d: Design): String {
            val text = DesignCodec.serialize(d.copy(modified = 0)).toString()
            return java.security.MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
        }
        private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")

        /** Ids come from files and the network; only safe file-name characters are allowed (no path tricks). */
        fun isValidId(id: String) = ID.matches(id)
    }
}
