package com.yash.glyphstudio

import android.app.Application
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.matrix.GlyphMatrixDevice
import com.yash.glyphstudio.matrix.MatrixLink
import com.yash.glyphstudio.matrix.PreviewController
import com.yash.glyphstudio.matrix.SystemSupport
import com.yash.glyphstudio.pc.PcEditing
import com.yash.glyphstudio.pc.PcEditingHost
import com.yash.glyphstudio.pc.PcEditingService
import com.yash.glyphstudio.server.AndroidAssetSource
import com.yash.glyphstudio.server.AndroidDeviceActions
import com.yash.glyphstudio.server.LocalEditorServer
import com.yash.glyphstudio.server.ServerDeps
import com.yash.glyphstudio.slots.SlotStore
import com.yash.glyphstudio.sync.ExecutorScheduler
import com.yash.glyphstudio.sync.Scheduler
import com.yash.glyphstudio.sync.SyncHub
import java.io.File

/** Owns the long-lived pieces so they survive Activity recreation: storage, the sync hub, the toy slots and the server. */
class GlyphApp : Application() {
    val repository: DesignRepository by lazy {
        DesignRepository(File(filesDir, "designs"), log = { Log.w(TAG, it) })
    }
    val settings: com.yash.glyphstudio.design.SettingsStore by lazy {
        com.yash.glyphstudio.design.SettingsStore(File(filesDir, "settings.json"), log = { Log.w(TAG, it) })
    }
    val hub: SyncHub by lazy { SyncHub(repository, ExecutorScheduler()) }

    /** One thread for everything that plays frames or refreshes slots, so frames reach the matrix in order. */
    val playbackScheduler: Scheduler by lazy { ExecutorScheduler() }

    val matrixLink: MatrixLink by lazy { MatrixLink(GlyphMatrixDevice(this), log = { Log.w(TAG, it) }) }

    val slots: SlotStore by lazy {
        SlotStore(File(filesDir, "slots.json"), repository, hub, playbackScheduler, log = { Log.w(TAG, it) })
    }

    val preview: PreviewController by lazy {
        PreviewController(
            matrixLink, hub, playbackScheduler,
            supported = SystemSupport.supportsAppMatrix(Build.VERSION.INCREMENTAL),
            log = { Log.w(TAG, it) },
        )
    }

    /** What both servers share. The in-app server adds the phone-only controls on top (see [localServer]). */
    private val baseDeps: ServerDeps by lazy {
        ServerDeps(repository, hub, AndroidAssetSource(assets), slots = slots, preview = preview, settings = settings)
    }

    /** PC editing: a Wi-Fi server for a paired browser, off until the user turns it on. */
    val pcEditing: PcEditing by lazy {
        PcEditing(
            baseDeps,
            host = object : PcEditingHost {
                override fun onStarted() = PcEditingService.start(this@GlyphApp)
                override fun onStopped() = PcEditingService.stop(this@GlyphApp)
            },
        )
    }

    val localServer: LocalEditorServer by lazy {
        LocalEditorServer(baseDeps.withLocalControls(AndroidDeviceActions(this), pcEditing))
    }

    override fun onCreate() {
        super.onCreate()
        restoreToySlots()
    }

    /**
     * An earlier build could switch toy slots off at the Android level. Put every slot back to its default (on) so a toy
     * can never be left silently disabled. Harmless when nothing was changed.
     */
    private fun restoreToySlots() {
        for (n in 1..SlotStore.COUNT) {
            try {
                packageManager.setComponentEnabledSetting(
                    ComponentName(this, "com.yash.glyphstudio.toys.ToySlot${n}Service"),
                    PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
                    PackageManager.DONT_KILL_APP,
                )
            } catch (e: Exception) {
                Log.w(TAG, "Could not restore toy slot $n: $e")
            }
        }
    }

    companion object { const val TAG = "GlyphStudio" }
}
