package com.yash.glyphstudio.design

import com.yash.glyphstudio.generated.SharedConstants as C
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class DesignCodecTest {
    private val cornerIndex = C.LED_MASK.indexOfFirst { !it }
    private val ledIndex = C.LED_MASK.indexOfFirst { it }

    private fun ok(r: ParseResult): Design = (r as? ParseResult.Ok)?.design ?: error("expected Ok but got $r")
    private fun errorOf(r: ParseResult): String = (r as? ParseResult.Error)?.message ?: error("expected Error but got $r")
    private fun roundTrip(d: Design): JSONObject = DesignCodec.serialize(d)
    private fun pixelsOf(json: JSONObject, frame: Int = 0, layer: Int = 0): ByteArray =
        Base64.getDecoder().decode(json.getJSONArray("frames").getJSONObject(frame).getJSONArray("layers").getJSONObject(layer).getString("data"))

    // ---- versioned design document ----
    @Test fun newDesignHasDefaults() {
        val d = DesignCodec.createDesign("Pacman")
        assertEquals(C.FORMAT_VERSION, d.format)
        assertTrue(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(d.id))
        assertEquals("loop", d.loop)
        assertEquals(1, d.frames.size)
        assertNotEquals(d.id, DesignCodec.createDesign().id)
    }

    @Test fun rejectsDesignWithoutFrames() {
        val doc = roundTrip(DesignCodec.createDesign()).put("frames", JSONArray())
        assertTrue(errorOf(DesignCodec.parse(doc)).contains("at least one frame"))
    }

    @Test fun roundTripsValidDesign() {
        val d = DesignCodec.createDesign("x")
        val back = ok(DesignCodec.parse(roundTrip(d).toString()))
        assertEquals(d.id, back.id)
        assertEquals(d.name, back.name)
        assertEquals(d.frames.size, back.frames.size)
        assertEquals(d.frames[0].id, back.frames[0].id)
    }

    @Test fun rejectsMalformedInput() {
        assertTrue(DesignCodec.parse("not json") is ParseResult.Error)
        assertTrue(DesignCodec.parse(JSONObject()) is ParseResult.Error)
        assertTrue(DesignCodec.parse(roundTrip(DesignCodec.createDesign()).put("anim", JSONObject().put("loop", "sideways"))) is ParseResult.Error)
        assertTrue(DesignCodec.parse(roundTrip(DesignCodec.createDesign()).put("matrix", JSONObject().put("w", 13).put("h", 13))) is ParseResult.Error)
    }

    // ---- frames contain typed layers ----
    @Test fun newFrameHasOneAllZeroPixelsLayer() {
        val f = DesignCodec.createFrame()
        assertEquals(1, f.layers.size)
        val l = f.layers[0] as PixelsLayer
        assertEquals("pixels", l.type)
        assertEquals(C.MATRIX_CELLS, l.data.size)
        assertTrue(l.data.all { it.toInt() == 0 })
    }

    @Test fun preservesUnknownLayerType() {
        val doc = roundTrip(DesignCodec.createDesign())
        val unknown = JSONObject().put("id", "u1").put("type", "text").put("font", "tiny").put("string", "HI").put("extra", JSONObject().put("a", 1))
        doc.getJSONArray("frames").getJSONObject(0).getJSONArray("layers").put(unknown)
        val loaded = ok(DesignCodec.parse(doc.toString()))
        val saved = DesignCodec.serialize(loaded).getJSONArray("frames").getJSONObject(0).getJSONArray("layers").getJSONObject(1)
        assertEquals("u1", saved.getString("id"))
        assertEquals("text", saved.getString("type"))
        assertEquals("tiny", saved.getString("font"))
        assertEquals("HI", saved.getString("string"))
        assertEquals(1, saved.getJSONObject("extra").getInt("a"))
    }

    @Test fun rejectsInvalidPixelData() {
        fun withData(data: String): ParseResult {
            val doc = roundTrip(DesignCodec.createDesign())
            doc.getJSONArray("frames").getJSONObject(0).getJSONArray("layers").getJSONObject(0).put("data", data)
            return DesignCodec.parse(doc)
        }
        assertTrue(withData("not-base64!!") is ParseResult.Error)
        assertTrue(withData(Base64.getEncoder().encodeToString("short".toByteArray())) is ParseResult.Error)
    }

    // ---- circular matrix mask ----
    @Test fun savesZeroOutsideMask() {
        val px = ByteArray(C.MATRIX_CELLS)
        px[cornerIndex] = 200.toByte()
        px[ledIndex] = 77
        val d = DesignCodec.createDesign().let { it.copy(frames = listOf(it.frames[0].copy(layers = listOf(PixelsLayer("l", px))))) }
        val out = pixelsOf(roundTrip(d))
        assertEquals(0, out[cornerIndex].toInt())
        assertEquals(77, out[ledIndex].toInt())
    }

    @Test fun zeroesMaskedValuesOnLoad() {
        val doc = roundTrip(DesignCodec.createDesign())
        val px = ByteArray(C.MATRIX_CELLS).also { it[cornerIndex] = 255.toByte() }
        doc.getJSONArray("frames").getJSONObject(0).getJSONArray("layers").getJSONObject(0).put("data", Base64.getEncoder().encodeToString(px))
        val loaded = ok(DesignCodec.parse(doc))
        assertEquals(0, (loaded.frames[0].layers[0] as PixelsLayer).data[cornerIndex].toInt())
    }

    @Test fun maskHasExactly489Leds() {
        assertEquals(489, C.LED_MASK.count { it })
        assertEquals(C.LED_COUNT, C.LED_MASK.count { it })
    }

    // ---- frame duration bounds ----
    @Test fun clampsDurations() {
        assertEquals(16, DesignCodec.clampDuration(5.0))
        assertEquals(60000, DesignCodec.clampDuration(999_999.0))
        assertEquals(16, DesignCodec.clampDuration(16.0))
        assertEquals(60000, DesignCodec.clampDuration(60000.0))
        assertEquals(100, DesignCodec.clampDuration(Double.NaN))
        val doc = roundTrip(DesignCodec.createDesign())
        doc.getJSONArray("frames").getJSONObject(0).put("durationMs", 5)
        assertEquals(16, ok(DesignCodec.parse(doc)).frames[0].durationMs)
    }

    // ---- loop modes ----
    private fun seq(mode: String, count: Int, n: Int) = List(n) { frameIndexAt(it, count, mode) + 1 }

    @Test fun bounceOrdering() = assertEquals(listOf(1, 2, 3, 2, 1, 2, 3), seq("bounce", 3, 7))
    @Test fun loopRestarts() = assertEquals(listOf(1, 2, 3, 1, 2, 3, 1), seq("loop", 3, 7))
    @Test fun onceStopsOnLast() {
        assertEquals(listOf(1, 2, 3, 3, 3, 3), seq("once", 3, 6))
        assertFalse(isFinished(1, 3, "once"))
        assertTrue(isFinished(2, 3, "once"))
        assertFalse(isFinished(99, 3, "loop"))
    }
    @Test fun singleFrameStableInEveryMode() {
        for (m in C.LOOP_MODES) assertEquals(listOf(1, 1, 1, 1), seq(m, 1, 4))
    }

    // ---- forward migration ----
    @Test fun rejectsNewerMajorVersion() {
        val doc = roundTrip(DesignCodec.createDesign()).put("format", C.FORMAT_VERSION + 1)
        val msg = errorOf(DesignCodec.parse(doc))
        assertTrue(msg, Regex("newer format.*Update the app").containsMatchIn(msg))
    }

    @Test fun rejectsMissingVersion() {
        val doc = roundTrip(DesignCodec.createDesign())
        doc.remove("format")
        assertTrue(DesignCodec.parse(doc) is ParseResult.Error)
    }

    @Test fun migratesOlderVersionWithoutLosingData() {
        val v0 = roundTrip(DesignCodec.createDesign("old")).put("format", 0).put("title", "old")
        v0.remove("name")
        val migrations: Migrations = mapOf(0 to { doc -> JSONObject(doc.toString()).put("name", doc.getString("title")) })
        val d = ok(DesignCodec.parse(v0, migrations))
        assertEquals("old", d.name)
        assertEquals(C.FORMAT_VERSION, d.format)
        assertEquals(1, d.frames.size)
    }

    @Test fun failsClearlyWhenMigrationStepMissing() {
        val doc = roundTrip(DesignCodec.createDesign()).put("format", 0)
        assertTrue(DesignCodec.migrate(doc, emptyMap()) is MigrateResult.Error)
    }

    @Test fun pixelRoundTripKeepsBrightnessValues() {
        val px = ByteArray(C.MATRIX_CELLS).also { it[ledIndex] = 255.toByte(); it[ledIndex + 1] = 1 }
        val d = DesignCodec.createDesign().let { it.copy(frames = listOf(it.frames[0].copy(layers = listOf(PixelsLayer("l", px))))) }
        val out = pixelsOf(roundTrip(d))
        assertArrayEquals(DesignCodec.applyMask(px.copyOf()), out)
    }
}
