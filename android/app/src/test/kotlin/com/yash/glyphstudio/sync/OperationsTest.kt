package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.Frame
import com.yash.glyphstudio.design.PixelsLayer
import com.yash.glyphstudio.design.UnknownLayer
import com.yash.glyphstudio.generated.SharedConstants as C
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OperationsTest {
    private val led = C.LED_MASK.indexOfFirst { it }
    private val noLed = C.LED_MASK.indexOfFirst { !it }

    private fun design(frames: Int = 3): Design {
        val d = DesignCodec.createDesign("t")
        return d.copy(frames = List(frames) { i -> DesignCodec.createFrame().copy(id = "f${i + 1}") })
    }

    private fun ids(d: Design) = d.frames.map { it.id }
    private fun px(d: Design, frame: String) = (d.frames.first { it.id == frame }.layers[0] as PixelsLayer).data
    private fun layerId(d: Design, frame: String) = d.frames.first { it.id == frame }.layers[0].id
    private fun rejects(d: Design, op: Op, containing: String) {
        try { Operations.apply(d, op); fail("expected rejection containing '$containing'") } catch (e: OpException) {
            assertTrue(e.message, e.message!!.contains(containing))
        }
    }

    @Test fun setPixelsChangesOnlyListedCellsAndLeavesInputUntouched() {
        val d = design()
        val before = px(d, "f2").copyOf()
        val out = Operations.apply(d, Op.SetPixels("f2", layerId(d, "f2"), intArrayOf(led, led + 1), intArrayOf(255, 40)))
        assertEquals(255, px(out, "f2")[led].toInt() and 0xFF)
        assertEquals(40, px(out, "f2")[led + 1].toInt() and 0xFF)
        assertTrue(px(d, "f2").contentEquals(before)) // original design not mutated
        assertTrue(px(out, "f1").all { it.toInt() == 0 }) // other frames untouched
    }

    @Test fun setPixelsIgnoresCellsWithoutLed() {
        val d = design()
        val out = Operations.apply(d, Op.SetPixels("f1", layerId(d, "f1"), intArrayOf(noLed), intArrayOf(255)))
        assertEquals(0, px(out, "f1")[noLed].toInt())
    }

    @Test fun setPixelsValidatesInput() {
        val d = design()
        val l = layerId(d, "f1")
        rejects(d, Op.SetPixels("nope", l, intArrayOf(led), intArrayOf(1)), "Unknown frame")
        rejects(d, Op.SetPixels("f1", "nope", intArrayOf(led), intArrayOf(1)), "Unknown layer")
        rejects(d, Op.SetPixels("f1", l, intArrayOf(625), intArrayOf(1)), "out of range")
        rejects(d, Op.SetPixels("f1", l, intArrayOf(-1), intArrayOf(1)), "out of range")
        rejects(d, Op.SetPixels("f1", l, intArrayOf(led), intArrayOf(256)), "Brightness")
        rejects(d, Op.SetPixels("f1", l, intArrayOf(led), intArrayOf(-1)), "Brightness")
        rejects(d, Op.SetPixels("f1", l, intArrayOf(led, led + 1), intArrayOf(1)), "length")
    }

    @Test fun setPixelsRejectsNonPixelsLayer() {
        val raw = JSONObject().put("id", "t1").put("type", "text")
        val d = design(1).let { it.copy(frames = listOf(it.frames[0].copy(layers = it.frames[0].layers + UnknownLayer("t1", "text", raw)))) }
        rejects(d, Op.SetPixels("f1", "t1", intArrayOf(led), intArrayOf(1)), "not a pixels layer")
    }

    @Test fun addFrameInsertsAfterTheGivenFrame() {
        val d = design()
        val nf = DesignCodec.createFrame(250).copy(id = "new")
        assertEquals(listOf("f1", "f2", "new", "f3"), ids(Operations.apply(d, Op.AddFrame(nf, "f2"))))
        assertEquals(listOf("new", "f1", "f2", "f3"), ids(Operations.apply(d, Op.AddFrame(nf, null))))
        assertEquals(250, Operations.apply(d, Op.AddFrame(nf, "f3")).frames.last().durationMs)
    }

    @Test fun addFrameValidatesAndCleans() {
        val d = design()
        rejects(d, Op.AddFrame(DesignCodec.createFrame().copy(id = "f1"), "f2"), "already exists")
        rejects(d, Op.AddFrame(DesignCodec.createFrame().copy(id = "x"), "ghost"), "Unknown frame")
        rejects(d, Op.AddFrame(Frame("x", 100, emptyList()), "f1"), "at least one layer")
        val dirty = ByteArray(C.MATRIX_CELLS).also { it[noLed] = 99.toByte() }
        val f = Frame("x", 5, listOf(PixelsLayer("lx", dirty)))
        val out = Operations.apply(d, Op.AddFrame(f, "f1")).frames[1]
        assertEquals(16, out.durationMs) // clamped
        assertEquals(0, (out.layers[0] as PixelsLayer).data[noLed].toInt()) // masked cell cleaned
    }

    @Test fun deleteFrame() {
        val d = design()
        assertEquals(listOf("f1", "f3"), ids(Operations.apply(d, Op.DeleteFrame("f2"))))
        rejects(d, Op.DeleteFrame("ghost"), "Unknown frame")
        rejects(design(1), Op.DeleteFrame("f1"), "at least one frame")
    }

    @Test fun moveFrame() {
        val d = design(4)
        assertEquals(listOf("f2", "f3", "f1", "f4"), ids(Operations.apply(d, Op.MoveFrame("f1", "f3"))))
        assertEquals(listOf("f4", "f1", "f2", "f3"), ids(Operations.apply(d, Op.MoveFrame("f4", null))))
        assertEquals(listOf("f1", "f2", "f3", "f4"), ids(Operations.apply(d, Op.MoveFrame("f2", "f2")))) // no-op
        rejects(d, Op.MoveFrame("ghost", "f1"), "Unknown frame")
        rejects(d, Op.MoveFrame("f1", "ghost"), "Unknown frame")
    }

    @Test fun setDurationClamps() {
        val d = design()
        assertEquals(125, Operations.apply(d, Op.SetDuration("f1", 125)).frames[0].durationMs)
        assertEquals(16, Operations.apply(d, Op.SetDuration("f1", 3)).frames[0].durationMs)
        assertEquals(60000, Operations.apply(d, Op.SetDuration("f1", 1_000_000)).frames[0].durationMs)
        assertEquals(100, Operations.apply(d, Op.SetDuration("f2", 5000)).frames[0].durationMs) // others unchanged
        rejects(d, Op.SetDuration("ghost", 100), "Unknown frame")
    }

    @Test fun setLoopAndRename() {
        val d = design()
        assertEquals("bounce", Operations.apply(d, Op.SetLoop("bounce")).loop)
        rejects(d, Op.SetLoop("sideways"), "Unknown loop mode")
        assertEquals("New", Operations.apply(d, Op.Rename("New")).name)
    }

    @Test fun framesNotTouchedAreSharedNotCopied() {
        val d = design()
        val out = Operations.apply(d, Op.SetDuration("f1", 200))
        assertSame(d.frames[2], out.frames[2])
    }
}
