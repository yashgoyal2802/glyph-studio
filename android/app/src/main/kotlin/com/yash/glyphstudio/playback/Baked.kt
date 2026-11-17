package com.yash.glyphstudio.playback

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.Frame
import com.yash.glyphstudio.design.PixelsLayer
import com.yash.glyphstudio.generated.SharedConstants as C

/** One frame ready to send to the matrix: [pixels] are 625 brightness values (0-255), row-major. */
class BakedFrame(val pixels: IntArray, val durationMs: Int)

class BakedAnimation(val frames: List<BakedFrame>, val loop: String) {
    val isEmpty get() = frames.isEmpty()
}

/**
 * Flattens a design into frames the matrix can show directly. Phase 1 designs only have pixels layers, which are
 * combined by taking the brightest value per cell; other layer types are ignored until the phases that add them.
 */
object Baker {
    fun bakeFrame(frame: Frame): BakedFrame {
        val out = IntArray(C.MATRIX_CELLS)
        for (layer in frame.layers) {
            if (layer !is PixelsLayer) continue
            for (i in 0 until C.MATRIX_CELLS) {
                val v = layer.data[i].toInt() and 0xFF
                if (v > out[i]) out[i] = v
            }
        }
        return BakedFrame(out, frame.durationMs)
    }

    fun bake(design: Design): BakedAnimation = BakedAnimation(design.frames.map(::bakeFrame), design.loop)

    /** What an empty slot shows: a small ring, so it is clear the toy is working but has no design yet. */
    fun emptySlot(): BakedAnimation {
        val px = IntArray(C.MATRIX_CELLS)
        for (y in 0 until C.MATRIX_SIZE) for (x in 0 until C.MATRIX_SIZE) {
            val d2 = (x - 12) * (x - 12) + (y - 12) * (y - 12)
            if (d2 in 20..30 && C.LED_MASK[y * C.MATRIX_SIZE + x]) px[y * C.MATRIX_SIZE + x] = 120
        }
        return BakedAnimation(listOf(BakedFrame(px, 1000)), "loop")
    }
}
