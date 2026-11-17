package com.yash.glyphstudio.design

import com.yash.glyphstudio.generated.SharedConstants as C
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Base64
import java.util.UUID
import kotlin.math.floor
import kotlin.math.roundToInt

/** Same rules as editor/src/format/design.ts; keep the two in step (see shared/ and the cross-language test). */
object DesignCodec {
    /** Migrations from older formats. Empty until the format changes. */
    val MIGRATIONS: Migrations = emptyMap()

    fun clampDuration(ms: Double): Int {
        if (!ms.isFinite()) return C.DEFAULT_FRAME_DURATION_MS
        return ms.roundToInt().coerceIn(C.MIN_FRAME_DURATION_MS, C.MAX_FRAME_DURATION_MS)
    }

    fun emptyPixels(): ByteArray = ByteArray(C.MATRIX_CELLS)

    /** Zero every position that has no physical LED. Mutates and returns the array. */
    fun applyMask(p: ByteArray): ByteArray {
        for (i in 0 until C.MATRIX_CELLS) if (!C.LED_MASK[i]) p[i] = 0
        return p
    }

    private fun decodePixels(text: String): ByteArray? {
        val bytes = try { Base64.getDecoder().decode(text) } catch (_: IllegalArgumentException) { return null }
        return if (bytes.size == C.MATRIX_CELLS) bytes else null
    }

    private fun encodePixels(p: ByteArray): String = Base64.getEncoder().encodeToString(p)

    fun createFrame(durationMs: Int = C.DEFAULT_FRAME_DURATION_MS): Frame =
        Frame(UUID.randomUUID().toString(), clampDuration(durationMs.toDouble()), listOf(PixelsLayer(UUID.randomUUID().toString(), emptyPixels())))

    fun createDesign(name: String = "Untitled", now: Long = System.currentTimeMillis()): Design =
        Design(C.FORMAT_VERSION, UUID.randomUUID().toString(), name, now, now, C.DEFAULT_LOOP_MODE, listOf(createFrame()))

    private fun asInt(v: Any?): Int? = (v as? Number)?.let { n -> val d = n.toDouble(); if (d == floor(d) && d >= 0) d.toInt() else null }

    /** Bring an older document up to the current version, or explain why it cannot be opened. */
    fun migrate(doc: JSONObject, migrations: Migrations = MIGRATIONS, target: Int = C.FORMAT_VERSION): MigrateResult {
        var version = asInt(doc.opt("format")) ?: return MigrateResult.Error("Not a design: missing format version.")
        if (version > target) {
            return MigrateResult.Error("This design uses a newer format (v$version) than this app supports (v$target). Update the app to open it.")
        }
        var cur = doc
        while (version < target) {
            val step = migrations[version] ?: return MigrateResult.Error("No migration from format v$version.")
            cur = step(cur).put("format", version + 1)
            version++
        }
        return MigrateResult.Ok(cur)
    }

    fun parse(json: String, migrations: Migrations = MIGRATIONS): ParseResult {
        val obj = try { JSONObject(json) } catch (_: JSONException) { return ParseResult.Error("Not a design: invalid JSON.") }
        return parse(obj, migrations)
    }

    private fun err(m: String) = ParseResult.Error(m)

    /** Validate and normalise an untrusted document (file import, server data). */
    fun parse(input: JSONObject, migrations: Migrations = MIGRATIONS): ParseResult {
        val d = when (val m = migrate(input, migrations)) {
            is MigrateResult.Error -> return err(m.message)
            is MigrateResult.Ok -> m.doc
        }
        val id = (d.opt("id") as? String)?.takeIf { it.isNotEmpty() } ?: return err("Design has no id.")
        val name = d.opt("name") as? String ?: return err("Design has no name.")
        val matrix = d.optJSONObject("matrix")
        if (asInt(matrix?.opt("w")) != C.MATRIX_SIZE || asInt(matrix?.opt("h")) != C.MATRIX_SIZE) {
            return err("Design matrix must be ${C.MATRIX_SIZE}x${C.MATRIX_SIZE}.")
        }
        val loop = d.optJSONObject("anim")?.opt("loop") as? String
        if (loop == null || loop !in C.LOOP_MODES) return err("Unknown loop mode: $loop.")
        val framesJson = d.optJSONArray("frames")
        if (framesJson == null || framesJson.length() == 0) return err("Design must contain at least one frame.")

        val frames = ArrayList<Frame>()
        for (i in 0 until framesJson.length()) {
            when (val r = parseFrame(framesJson.optJSONObject(i), "Frame ${i + 1}")) {
                is FrameParse.Error -> return err(r.message)
                is FrameParse.Ok -> frames.add(r.frame)
            }
        }
        return ParseResult.Ok(
            Design(C.FORMAT_VERSION, id, name, (d.opt("created") as? Number)?.toLong() ?: 0L, (d.opt("modified") as? Number)?.toLong() ?: 0L, loop, frames),
        )
    }

    /** Validate and normalise one frame (also used for the "add frame" operation). [label] names it in errors. */
    fun parseFrame(f: JSONObject?, label: String = "Frame"): FrameParse {
        val fid = f?.opt("id") as? String ?: return FrameParse.Error("$label is invalid.")
        val layersJson = f.optJSONArray("layers")
        if (layersJson == null || layersJson.length() == 0) return FrameParse.Error("$label has no layers.")
        val layers = ArrayList<Layer>()
        for (j in 0 until layersJson.length()) {
            val l = layersJson.optJSONObject(j)
            val lid = l?.opt("id") as? String
            val type = l?.opt("type") as? String
            if (l == null || lid == null || type == null) return FrameParse.Error("$label has an invalid layer.")
            if (type == C.LAYER_TYPE_PIXELS) {
                val px = (l.opt("data") as? String)?.let { decodePixels(it) } ?: return FrameParse.Error("$label has invalid pixel data.")
                layers.add(PixelsLayer(lid, applyMask(px)))
            } else {
                layers.add(UnknownLayer(lid, type, JSONObject(l.toString()))) // unknown type: preserved untouched
            }
        }
        val dur = (f.opt("durationMs") as? Number)?.toDouble() ?: Double.NaN
        return FrameParse.Ok(Frame(fid, clampDuration(dur), layers))
    }

    fun serializeFrame(f: Frame): JSONObject {
        val layers = JSONArray()
        for (l in f.layers) {
            layers.put(
                when (l) {
                    is PixelsLayer -> JSONObject().put("id", l.id).put("type", C.LAYER_TYPE_PIXELS).put("data", encodePixels(applyMask(l.data.copyOf())))
                    is UnknownLayer -> JSONObject(l.raw.toString())
                },
            )
        }
        return JSONObject().put("id", f.id).put("durationMs", clampDuration(f.durationMs.toDouble())).put("layers", layers)
    }

    /** The JSON document to store/export: masked pixels zeroed, durations clamped, unknown layers untouched. */
    fun serialize(design: Design): JSONObject {
        val frames = JSONArray()
        for (f in design.frames) frames.put(serializeFrame(f))
        return JSONObject()
            .put("format", C.FORMAT_VERSION)
            .put("id", design.id)
            .put("name", design.name)
            .put("created", design.created)
            .put("modified", design.modified)
            .put("matrix", JSONObject().put("w", C.MATRIX_SIZE).put("h", C.MATRIX_SIZE))
            .put("anim", JSONObject().put("loop", design.loop))
            .put("frames", frames)
    }
}
