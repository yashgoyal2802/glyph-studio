package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.PixelsLayer
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OpJsonTest {
    private fun roundTrip(op: Op): Op = OpJson.fromJson(JSONObject(OpJson.toJson(op).toString()))
    private fun bad(json: String, containing: String) {
        try { OpJson.fromJson(JSONObject(json)); fail("expected failure for $json") } catch (e: OpException) {
            assertTrue(e.message, e.message!!.contains(containing))
        }
    }

    @Test fun everyOpSurvivesTheWire() {
        val sp = roundTrip(Op.SetPixels("f", "l", intArrayOf(1, 2, 3), intArrayOf(10, 20, 255))) as Op.SetPixels
        assertEquals("f", sp.frameId); assertEquals("l", sp.layerId)
        assertArrayEquals(intArrayOf(1, 2, 3), sp.indices); assertArrayEquals(intArrayOf(10, 20, 255), sp.values)

        val frame = DesignCodec.createFrame(250)
        val af = roundTrip(Op.AddFrame(frame, "after")) as Op.AddFrame
        assertEquals("after", af.afterFrameId); assertEquals(frame.id, af.frame.id); assertEquals(250, af.frame.durationMs)
        assertEquals(625, (af.frame.layers[0] as PixelsLayer).data.size)
        assertNull((roundTrip(Op.AddFrame(frame, null)) as Op.AddFrame).afterFrameId)

        assertEquals("f", (roundTrip(Op.DeleteFrame("f")) as Op.DeleteFrame).frameId)
        val mv = roundTrip(Op.MoveFrame("a", null)) as Op.MoveFrame
        assertEquals("a", mv.frameId); assertNull(mv.afterFrameId)
        assertEquals("b", (roundTrip(Op.MoveFrame("a", "b")) as Op.MoveFrame).afterFrameId)
        val sd = roundTrip(Op.SetDuration("f", 125)) as Op.SetDuration
        assertEquals(125, sd.durationMs)
        assertEquals("bounce", (roundTrip(Op.SetLoop("bounce")) as Op.SetLoop).loop)
        assertEquals("N", (roundTrip(Op.Rename("N")) as Op.Rename).name)
    }

    @Test fun malformedOpsGiveClearErrors() {
        bad("{}", "op type")
        bad("""{"t":"explode"}""", "Unknown op type")
        bad("""{"t":"rename"}""", "'name'")
        bad("""{"t":"rename","name":5}""", "'name'")
        bad("""{"t":"setDuration","frameId":"f","durationMs":"fast"}""", "'durationMs'")
        bad("""{"t":"setDuration","frameId":"f","durationMs":1.5}""", "integer")
        bad("""{"t":"setPixels","frameId":"f","layerId":"l","indices":"x","values":[]}""", "'indices'")
        bad("""{"t":"setPixels","frameId":"f","layerId":"l","indices":[1.5],"values":[1]}""", "integers")
        bad("""{"t":"addFrame","frame":{"id":"x","layers":[]}}""", "no layers")
        bad("""{"t":"addFrame"}""", "invalid")
    }
}
