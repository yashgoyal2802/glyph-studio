package com.yash.glyphstudio.share

import java.io.File

/** Naming and lookup rules for files the app hands to the Android share sheet. Pure logic, so it can be tested. */
object ShareFiles {
    const val AUTHORITY = "com.yash.glyphstudio.share"
    const val DIR_NAME = "shared"
    const val MAX_BYTES = 32 * 1024 * 1024

    /** A file name that is safe to store and show: letters, digits, dot, dash, underscore and space only. */
    fun safeName(name: String): String {
        val cleaned = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().trimStart('.').take(80).trim()
        return cleaned.ifBlank { "design.glyph.json" }
    }

    /**
     * The file for [name] inside [dir], or null when there is none or the name tries to reach outside the folder.
     * (Other apps ask the provider for files by name, so every request is treated as untrusted.)
     */
    fun resolve(dir: File, name: String?): File? {
        if (name.isNullOrEmpty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') || name.contains('\u0000')) return null
        val file = File(dir, name)
        return try {
            if (file.canonicalFile.parentFile == dir.canonicalFile && file.isFile) file else null
        } catch (_: java.io.IOException) {
            null
        }
    }
}
