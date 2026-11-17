package com.yash.glyphstudio.share

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * Lets the apps a design is shared to (Drive, Files, Gmail...) read the exported file, and only that: read-only, only
 * files in our "shared" cache folder, and only through a one-time permission granted with the share.
 */
class ShareProvider : ContentProvider() {
    private fun dir() = File(context!!.cacheDir, ShareFiles.DIR_NAME)

    override fun onCreate() = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
        val file = ShareFiles.resolve(dir(), uri.lastPathSegment) ?: return null
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns).apply {
            addRow(columns.map { if (it == OpenableColumns.DISPLAY_NAME) file.name else if (it == OpenableColumns.SIZE) file.length() else null }.toTypedArray())
        }
    }

    override fun getType(uri: Uri): String = "application/json"

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("Read-only")
        val file = ShareFiles.resolve(dir(), uri.lastPathSegment) ?: throw FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
