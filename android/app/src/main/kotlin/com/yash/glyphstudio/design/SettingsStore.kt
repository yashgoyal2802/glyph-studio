package com.yash.glyphstudio.design

import org.json.JSONException
import org.json.JSONObject
import java.io.File

/**
 * A few on/off preferences kept on the phone (`settings.json`). The editor cannot keep these in the browser's own storage:
 * the app's WebView gets a new address on every launch, so anything stored there would be forgotten.
 * Only the known keys are accepted, and only booleans.
 */
class SettingsStore(private val file: File, private val log: (String) -> Unit = {}) {
    private val lock = Any()
    private val values = LinkedHashMap<String, Boolean>()

    init {
        try {
            if (file.exists()) {
                val o = JSONObject(file.readText())
                for (key in KEYS) if (o.has(key) && o.opt(key) is Boolean) values[key] = o.getBoolean(key)
            }
        } catch (e: JSONException) {
            log("Ignoring unreadable settings file: ${e.message}")
        }
    }

    /** Every known setting with its current value (false until it has been set). */
    fun all(): Map<String, Boolean> = synchronized(lock) { KEYS.associateWith { values[it] ?: false } }

    /** Apply the known boolean entries of [patch]; anything else is ignored. Returns every setting afterwards. */
    fun update(patch: JSONObject): Map<String, Boolean> = synchronized(lock) {
        var changed = false
        for (key in KEYS) if (patch.has(key) && patch.opt(key) is Boolean) {
            values[key] = patch.getBoolean(key)
            changed = true
        }
        if (changed) {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(JSONObject(values as Map<*, *>).toString())
            if (!tmp.renameTo(file)) { file.writeText(tmp.readText()); tmp.delete() }
        }
        all()
    }

    companion object {
        /** firstRunDone: the introduction has been shown. autoClose: close the tray after choosing a tool. */
        val KEYS = listOf("firstRunDone", "autoClose", "trayHintDone")
    }
}
