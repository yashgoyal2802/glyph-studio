package com.yash.glyphstudio.design

import com.yash.glyphstudio.generated.SharedConstants
import org.json.JSONObject

sealed interface Layer {
    val id: String
    val type: String
}

/** 625 brightness bytes (0-255, read with `toInt() and 0xFF`), row-major. */
class PixelsLayer(override val id: String, val data: ByteArray) : Layer {
    override val type: String = SharedConstants.LAYER_TYPE_PIXELS
}

/** A layer type this version does not understand; kept verbatim so it survives load/save. */
class UnknownLayer(override val id: String, override val type: String, val raw: JSONObject) : Layer

data class Frame(val id: String, val durationMs: Int, val layers: List<Layer>)

data class Design(
    val format: Int,
    val id: String,
    val name: String,
    val created: Long,
    val modified: Long,
    val loop: String,
    val frames: List<Frame>,
)

sealed interface ParseResult {
    data class Ok(val design: Design) : ParseResult
    data class Error(val message: String) : ParseResult
}

sealed interface FrameParse {
    data class Ok(val frame: Frame) : FrameParse
    data class Error(val message: String) : FrameParse
}

sealed interface MigrateResult {
    data class Ok(val doc: JSONObject) : MigrateResult
    data class Error(val message: String) : MigrateResult
}

/** Migrations keyed by the version they upgrade FROM (vN -> vN+1). */
typealias Migrations = Map<Int, (JSONObject) -> JSONObject>
