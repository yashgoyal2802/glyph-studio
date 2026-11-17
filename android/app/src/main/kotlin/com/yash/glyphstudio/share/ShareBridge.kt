package com.yash.glyphstudio.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.JavascriptInterface
import java.io.File

/**
 * What the web editor can ask of the phone for exporting: "share this file". The page only ever gets this one door, and
 * it can only hand over text that becomes a file in our own cache. The WebView loads nothing but our own local server.
 */
class ShareBridge(private val activity: Activity) {
    /** Asks Android to allow notifications (needed to show the "PC editing is on" notice). Does nothing if already allowed. */
    @JavascriptInterface
    fun requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < 33) return
        if (activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) return
        activity.runOnUiThread { activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 4712) }
    }

    @JavascriptInterface
    fun shareFile(fileName: String, mimeType: String, text: String): Boolean {
        if (text.length > ShareFiles.MAX_BYTES) return false
        return try {
            val name = ShareFiles.safeName(fileName)
            val dir = File(activity.cacheDir, ShareFiles.DIR_NAME).apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() } // earlier shares are no longer needed
            File(dir, name).writeText(text)
            val uri = Uri.parse("content://${ShareFiles.AUTHORITY}/${Uri.encode(name)}")
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mimeType.ifBlank { "application/json" }
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, name)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.runOnUiThread { activity.startActivity(Intent.createChooser(send, "Share design file")) }
            true
        } catch (e: Exception) {
            Log.w("GlyphStudio", "Could not share $fileName", e)
            false
        }
    }
}
