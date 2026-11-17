package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.FrameParse
import org.json.JSONArray
import org.json.JSONObject

/** JSON wire format of [Op] (used by the REST and WebSocket APIs). Mirrored by the editor's TypeScript client. */
object OpJson {
    private fun str(o: JSONObject, key: String): String = o.opt(key) as? String ?: throw OpException("Missing or invalid '$key'")
    private fun optStr(o: JSONObject, key: String): String? =
        if (!o.has(key) || o.isNull(key)) null else o.opt(key) as? String ?: throw OpException("Invalid '$key'")
    private fun int(o: JSONObject, key: String): Int {
        val n = o.opt(key) as? Number ?: throw OpException("Missing or invalid '$key'")
        val d = n.toDouble()
        if (d != Math.floor(d) || d < Int.MIN_VALUE || d > Int.MAX_VALUE) throw OpException("'$key' must be an integer")
        return d.toInt()
    }
    private fun ints(o: JSONObject, key: String): IntArray {
        val a = o.optJSONArray(key) ?: throw OpException("Missing or invalid '$key'")
        return IntArray(a.length()) { i ->
            val n = a.opt(i) as? Number ?: throw OpException("'$key' must contain only numbers")
            val d = n.toDouble()
            if (d != Math.floor(d)) throw OpException("'$key' must contain only integers")
            d.toInt()
        }
    }

    /** Throws [OpException] for anything malformed. */
    fun fromJson(o: JSONObject): Op = when (val t = o.opt("t") as? String ?: throw OpException("Missing op type 't'")) {
        "setPixels" -> Op.SetPixels(str(o, "frameId"), str(o, "layerId"), ints(o, "indices"), ints(o, "values"))
        "addFrame" -> {
            val frame = when (val r = DesignCodec.parseFrame(o.optJSONObject("frame"), "Frame")) {
                is FrameParse.Ok -> r.frame
                is FrameParse.Error -> throw OpException(r.message)
            }
            Op.AddFrame(frame, optStr(o, "afterFrameId"))
        }
        "deleteFrame" -> Op.DeleteFrame(str(o, "frameId"))
        "moveFrame" -> Op.MoveFrame(str(o, "frameId"), optStr(o, "afterFrameId"))
        "setDuration" -> Op.SetDuration(str(o, "frameId"), int(o, "durationMs"))
        "setLoop" -> Op.SetLoop(str(o, "loop"))
        "rename" -> Op.Rename(str(o, "name"))
        else -> throw OpException("Unknown op type: $t")
    }

    fun toJson(op: Op): JSONObject = when (op) {
        is Op.SetPixels -> JSONObject().put("t", "setPixels").put("frameId", op.frameId).put("layerId", op.layerId)
            .put("indices", JSONArray(op.indices.toList())).put("values", JSONArray(op.values.toList()))
        is Op.AddFrame -> JSONObject().put("t", "addFrame").put("frame", DesignCodec.serializeFrame(op.frame))
            .put("afterFrameId", op.afterFrameId ?: JSONObject.NULL)
        is Op.DeleteFrame -> JSONObject().put("t", "deleteFrame").put("frameId", op.frameId)
        is Op.MoveFrame -> JSONObject().put("t", "moveFrame").put("frameId", op.frameId).put("afterFrameId", op.afterFrameId ?: JSONObject.NULL)
        is Op.SetDuration -> JSONObject().put("t", "setDuration").put("frameId", op.frameId).put("durationMs", op.durationMs)
        is Op.SetLoop -> JSONObject().put("t", "setLoop").put("loop", op.loop)
        is Op.Rename -> JSONObject().put("t", "rename").put("name", op.name)
    }
}
