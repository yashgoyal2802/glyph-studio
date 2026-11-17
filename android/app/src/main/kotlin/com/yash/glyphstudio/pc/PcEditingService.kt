package com.yash.glyphstudio.pc

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.IBinder
import android.os.PowerManager
import com.yash.glyphstudio.GlyphApp
import com.yash.glyphstudio.MainActivity
import com.yash.glyphstudio.R

/**
 * Keeps the app alive while PC editing is on and shows the persistent notification (so it is never running unnoticed).
 * The notification has a "Turn off" action, and tapping it opens the app.
 */
class PcEditingService : Service() {
    // While PC editing is on the phone must keep answering the browser even with the screen off: without these the Wi-Fi
    // radio and the CPU doze, the browser hears nothing for a few seconds and the editor reports the phone as gone.
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    private fun holdLocks() {
        if (wifiLock == null) {
            wifiLock = getSystemService(WifiManager::class.java)
                ?.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "glyphstudio:pc-editing")
                ?.apply { setReferenceCounted(false); acquire() }
        }
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "glyphstudio:pc-editing")
                ?.apply { setReferenceCounted(false); acquire() }
        }
    }

    private fun releaseLocks() {
        wifiLock?.takeIf { it.isHeld }?.release()
        wakeLock?.takeIf { it.isHeld }?.release()
        wifiLock = null
        wakeLock = null
    }

    override fun onDestroy() {
        releaseLocks() // PC editing is off: stop keeping the radio and CPU awake
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            (application as GlyphApp).pcEditing.stop()
            stopSelf()
            return START_NOT_STICKY
        }
        holdLocks()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "PC editing", NotificationManager.IMPORTANCE_LOW))
        val url = (application as GlyphApp).pcEditing.status().url
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(
            this, 1, Intent(this, PcEditingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_pc_editing)
            .setContentTitle("PC editing is on")
            .setContentText(url ?: "Waiting for a Wi-Fi address")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Turn off", stop).build())
            .build()
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        return START_NOT_STICKY
    }

    companion object {
        const val ACTION_STOP = "com.yash.glyphstudio.pc.STOP"
        private const val CHANNEL = "pc_editing"
        private const val NOTIFICATION_ID = 41

        fun start(context: Context) {
            context.startForegroundService(Intent(context, PcEditingService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PcEditingService::class.java))
        }
    }
}
