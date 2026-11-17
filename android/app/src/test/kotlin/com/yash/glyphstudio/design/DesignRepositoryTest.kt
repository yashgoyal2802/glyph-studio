package com.yash.glyphstudio.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class DesignRepositoryTest {
    @get:Rule val tmp = TemporaryFolder()

    private var now = 1_000L
    private fun repo(dir: File = tmp.root, logs: MutableList<String>? = null) =
        DesignRepository(dir, clock = { now += 10; now }, log = { logs?.add(it) })

    @Test fun createAndGet() {
        val r = repo()
        val d = r.create("Pacman")
        assertEquals("Pacman", r.get(d.id)?.name)
        assertEquals(1, r.get(d.id)?.frames?.size)
        assertTrue(File(tmp.root, d.id + DesignRepository.SUFFIX).exists())
    }

    @Test fun rename() {
        val r = repo()
        val d = r.create("A")
        assertEquals("B", r.rename(d.id, "B")?.name)
        assertEquals("B", r.get(d.id)?.name)
        assertNull(r.rename("does-not-exist", "x"))
    }

    @Test fun duplicateCopiesFramesWithNewIdAndName() {
        val r = repo()
        val src = r.create("Pacman")
        val withTwoFrames = r.save(src.copy(frames = src.frames + DesignCodec.createFrame(250)))
        val copy = r.duplicate(src.id)!!
        assertEquals("Pacman copy", copy.name)
        assertNotEquals(src.id, copy.id)
        assertEquals(withTwoFrames.frames.size, copy.frames.size)
        assertEquals(250, copy.frames[1].durationMs)
        assertEquals(2, r.list().size)
        assertNull(r.duplicate("nope"))
    }

    @Test fun deleteRemovesDesignAndFile() {
        val r = repo()
        val d = r.create("x")
        assertTrue(r.delete(d.id))
        assertNull(r.get(d.id))
        assertFalse(File(tmp.root, d.id + DesignRepository.SUFFIX).exists())
        assertFalse(r.delete(d.id))
        assertTrue(r.list().isEmpty())
    }

    @Test fun listIsNewestModifiedFirst() {
        val r = repo()
        val a = r.create("A")
        val b = r.create("B")
        val c = r.create("C")
        assertEquals(listOf(c.id, b.id, a.id), r.list().map { it.id })
        r.rename(a.id, "A2") // editing the oldest moves it to the top
        assertEquals(listOf(a.id, c.id, b.id), r.list().map { it.id })
    }

    @Test fun summaryHasNameAndFrameCount() {
        val r = repo()
        val d = r.create("Walk")
        r.save(d.copy(frames = d.frames + DesignCodec.createFrame() + DesignCodec.createFrame()))
        val s = r.list().single()
        assertEquals("Walk", s.name)
        assertEquals(3, s.frameCount)
    }

    @Test fun survivesRestart() {
        val first = repo()
        val d = first.create("Keep me")
        first.save(d.copy(loop = "bounce"))
        val second = repo() // new instance, same folder = app restart
        val back = second.get(d.id)
        assertNotNull(back)
        assertEquals("Keep me", back!!.name)
        assertEquals("bounce", back.loop)
        assertEquals(listOf(d.id), second.list().map { it.id })
    }

    @Test fun corruptFileIsSkippedNotFatal() {
        val good = repo().create("good")
        File(tmp.root, "broken" + DesignRepository.SUFFIX).writeText("{ not valid")
        val logs = mutableListOf<String>()
        val r = repo(logs = logs)
        assertEquals(listOf(good.id), r.list().map { it.id })
        assertTrue(logs.any { it.contains("broken") })
    }

    @Test fun savesLeaveNoTempFilesAndCleanUpLeftovers() {
        val r = repo()
        val d = r.create("x")
        r.save(d.copy(name = "y"))
        assertTrue(tmp.root.listFiles { f -> f.name.endsWith(".tmp") }!!.isEmpty())
        File(tmp.root, "ghost.glyph.json.tmp").writeText("half written")
        repo() // restart removes the interrupted-save leftover
        assertFalse(File(tmp.root, "ghost.glyph.json.tmp").exists())
        assertEquals("y", repo().get(d.id)?.name)
    }

    @Test fun rejectsUnsafeIds() {
        val r = repo()
        val bad = DesignCodec.createDesign().copy(id = "../escape")
        assertTrue(runCatching { r.save(bad) }.isFailure)
        assertFalse(r.delete("../escape"))
        assertFalse(DesignRepository.isValidId("a/b"))
        assertFalse(DesignRepository.isValidId(""))
        assertTrue(DesignRepository.isValidId("00000000-0000-4000-8000-000000000001"))
    }

    @Test fun listenersAreNotified() {
        val r = repo()
        val saved = mutableListOf<String>()
        val deleted = mutableListOf<String>()
        r.addListener(object : DesignRepository.Listener {
            override fun onSaved(design: Design) { saved.add(design.name) }
            override fun onDeleted(id: String) { deleted.add(id) }
        })
        val d = r.create("n1")
        r.rename(d.id, "n2")
        r.delete(d.id)
        assertEquals(listOf("n1", "n2"), saved)
        assertEquals(listOf(d.id), deleted)
    }

    @Test fun historyRoundTripsForTheSameFingerprint() {
        val r = repo()
        val d = r.create("a")
        val fp = DesignRepository.fingerprint(d)
        assertTrue(r.saveHistory(d.id, fp, """{"undo":[],"redo":[]}"""))
        assertEquals("""{"undo":[],"redo":[]}""", r.loadHistory(d.id, fp))
        // a new repository on the same folder (app restart) still finds it, and designs are not confused with history files
        val again = repo()
        assertEquals(1, again.list().size)
        assertEquals("""{"undo":[],"redo":[]}""", again.loadHistory(d.id, fp))
    }

    @Test fun staleHistoryIsDiscarded() {
        val r = repo()
        val d = r.create("a")
        r.saveHistory(d.id, DesignRepository.fingerprint(d), """{"undo":[1],"redo":[]}""")
        val changed = r.rename(d.id, "b")!!
        assertNull(r.loadHistory(d.id, DesignRepository.fingerprint(changed)))
        assertNull(r.loadHistory(d.id, DesignRepository.fingerprint(d))) // deleted, not just skipped
    }

    @Test fun fingerprintIgnoresTheModifiedTimeOnly() {
        val d = repo().create("a")
        assertEquals(DesignRepository.fingerprint(d), DesignRepository.fingerprint(d.copy(modified = 99_999)))
        assertNotEquals(DesignRepository.fingerprint(d), DesignRepository.fingerprint(d.copy(name = "other")))
    }

    @Test fun historyIsRemovedWithTheDesignAndLimitedInSize() {
        val r = repo()
        val d = r.create("a")
        val fp = DesignRepository.fingerprint(d)
        assertFalse(r.saveHistory("nope", fp, "{}"))
        assertTrue(r.saveHistory(d.id, fp, "{}"))
        assertFalse(r.saveHistory(d.id, fp, "x".repeat(DesignRepository.MAX_HISTORY_CHARS + 1)))
        assertNull(r.loadHistory(d.id, fp)) // the oversize attempt also dropped the older one
        assertTrue(r.saveHistory(d.id, fp, "{}"))
        r.delete(d.id)
        assertFalse(File(tmp.root, d.id + DesignRepository.HISTORY_SUFFIX).exists())
    }
}
