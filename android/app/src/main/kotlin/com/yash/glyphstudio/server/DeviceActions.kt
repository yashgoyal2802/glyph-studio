package com.yash.glyphstudio.server

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Things only the phone itself can do on the editor's behalf (the editor runs in a web page). */
interface DeviceActions {
    /** Open Nothing's "Manage Glyph Toys" screen so the user can switch the Toy slots on. False if it is unavailable. */
    fun openToyManager(): Boolean
}

class AndroidDeviceActions(private val context: Context) : DeviceActions {
    override fun openToyManager(): Boolean = try {
        context.startActivity(
            Intent().apply {
                component = ComponentName("com.nothing.thirdparty", "com.nothing.thirdparty.matrix.toys.manager.ToysManagerActivity")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }
}
