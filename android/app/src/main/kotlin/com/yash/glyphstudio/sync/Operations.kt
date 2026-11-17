package com.yash.glyphstudio.sync

import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.Frame
import com.yash.glyphstudio.design.PixelsLayer
import com.yash.glyphstudio.generated.SharedConstants as C

/**
 * Small edit operations sent by editors (phone WebView or PC browser) and applied by the phone in arrival order
 * (design.md decision 5). Pixel operations only touch the listed positions, so strokes from two clients merge.
 */
sealed interface Op {
    /** Set brightness [values] at cell [indices] (row-major) of a pixels layer. Cells without an LED are ignored. */
    class SetPixels(val frameId: String, val layerId: String, val indices: IntArray, val values: IntArray) : Op

    /** Insert [frame] after [afterFrameId] (null = at the very start). */
    class AddFrame(val frame: Frame, val afterFrameId: String?) : Op

    /** Remove a frame. The last remaining frame cannot be deleted. */
    class DeleteFrame(val frameId: String) : Op

    /** Move a frame to just after [afterFrameId] (null = to the start). */
    class MoveFrame(val frameId: String, val afterFrameId: String?) : Op

    class SetDuration(val frameId: String, val durationMs: Int) : Op
    class SetLoop(val loop: String) : Op
    class Rename(val name: String) : Op
}

/** An operation that cannot be applied (unknown frame, bad value...). The design is left unchanged. */
class OpException(message: String) : Exception(message)

object Operations {
    /** Returns the design with [op] applied, or throws [OpException]. Never mutates [design]. */
    fun apply(design: Design, op: Op): Design = when (op) {
        is Op.SetPixels -> setPixels(design, op)
        is Op.AddFrame -> addFrame(design, op)
        is Op.DeleteFrame -> {
            if (design.frames.size <= 1) throw OpException("A design needs at least one frame")
            val idx = indexOf(design, op.frameId)
            design.copy(frames = design.frames.filterIndexed { i, _ -> i != idx })
        }
        is Op.MoveFrame -> moveFrame(design, op)
        is Op.SetDuration -> {
            val idx = indexOf(design, op.frameId)
            val f = design.frames[idx].copy(durationMs = DesignCodec.clampDuration(op.durationMs.toDouble()))
            design.copy(frames = design.frames.toMutableList().also { it[idx] = f })
        }
        is Op.SetLoop -> {
            if (op.loop !in C.LOOP_MODES) throw OpException("Unknown loop mode: ${op.loop}")
            design.copy(loop = op.loop)
        }
        is Op.Rename -> design.copy(name = op.name)
    }

    private fun indexOf(design: Design, frameId: String): Int {
        val i = design.frames.indexOfFirst { it.id == frameId }
        if (i < 0) throw OpException("Unknown frame: $frameId")
        return i
    }

    private fun setPixels(design: Design, op: Op.SetPixels): Design {
        if (op.indices.size != op.values.size) throw OpException("indices and values differ in length")
        val fi = indexOf(design, op.frameId)
        val frame = design.frames[fi]
        val li = frame.layers.indexOfFirst { it.id == op.layerId }
        if (li < 0) throw OpException("Unknown layer: ${op.layerId}")
        val layer = frame.layers[li] as? PixelsLayer ?: throw OpException("Layer ${op.layerId} is not a pixels layer")
        for (k in op.indices.indices) {
            if (op.indices[k] !in 0 until C.MATRIX_CELLS) throw OpException("Cell index out of range: ${op.indices[k]}")
            if (op.values[k] !in 0..255) throw OpException("Brightness out of range: ${op.values[k]}")
        }
        val data = layer.data.copyOf()
        for (k in op.indices.indices) {
            val cell = op.indices[k]
            if (C.LED_MASK[cell]) data[cell] = op.values[k].toByte() // no LED there: ignored, stays 0
        }
        val layers = frame.layers.toMutableList().also { it[li] = PixelsLayer(layer.id, data) }
        return design.copy(frames = design.frames.toMutableList().also { it[fi] = frame.copy(layers = layers) })
    }

    private fun addFrame(design: Design, op: Op.AddFrame): Design {
        if (design.frames.any { it.id == op.frame.id }) throw OpException("Frame id already exists: ${op.frame.id}")
        if (op.frame.layers.isEmpty()) throw OpException("A frame needs at least one layer")
        val clean = op.frame.copy(
            durationMs = DesignCodec.clampDuration(op.frame.durationMs.toDouble()),
            layers = op.frame.layers.map { if (it is PixelsLayer) PixelsLayer(it.id, DesignCodec.applyMask(it.data.copyOf())) else it },
        )
        val at = if (op.afterFrameId == null) 0 else indexOf(design, op.afterFrameId) + 1
        return design.copy(frames = design.frames.toMutableList().also { it.add(at, clean) })
    }

    private fun moveFrame(design: Design, op: Op.MoveFrame): Design {
        val from = indexOf(design, op.frameId)
        if (op.afterFrameId == op.frameId) return design
        val frames = design.frames.toMutableList()
        val moving = frames.removeAt(from)
        val at = if (op.afterFrameId == null) 0 else frames.indexOfFirst { it.id == op.afterFrameId }.also {
            if (it < 0) throw OpException("Unknown frame: ${op.afterFrameId}")
        } + 1
        frames.add(at, moving)
        return design.copy(frames = frames)
    }
}
