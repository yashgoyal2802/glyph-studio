package com.yash.glyphstudio.matrix

import android.content.ComponentName
import android.content.Context
import com.nothing.ketchum.Glyph
import com.nothing.ketchum.GlyphMatrixManager

/** The real Phone (3) Glyph Matrix, through Nothing's SDK. */
class GlyphMatrixDevice(private val context: Context) : MatrixDevice {
    private var manager: GlyphMatrixManager? = null

    override fun connect(onConnected: () -> Unit, onDisconnected: () -> Unit) {
        val m = GlyphMatrixManager.getInstance(context.applicationContext)
        manager = m
        m.init(object : GlyphMatrixManager.Callback {
            override fun onServiceConnected(name: ComponentName?) {
                m.register(Glyph.DEVICE_23112)
                onConnected()
            }

            override fun onServiceDisconnected(name: ComponentName?) = onDisconnected()
        })
    }

    override fun disconnect() {
        try { manager?.unInit() } catch (_: Exception) {}
        manager = null
    }

    override fun toyFrame(pixels: IntArray) { manager?.setMatrixFrame(pixels) }
    override fun appFrame(pixels: IntArray) { manager?.setAppMatrixFrame(pixels) }
    override fun closeApp() { manager?.closeAppMatrix() }
    override fun turnOff() { manager?.turnOff() }
}
