package com.yash.glyphstudio.server

import android.content.res.AssetManager
import io.ktor.http.ContentType
import io.ktor.http.withCharset
import java.io.IOException
import java.io.InputStream

/** Where the bundled web editor files come from (the app's assets in production, a map in tests). */
fun interface AssetSource {
    /** The file at [path] (relative, e.g. "assets/app.js"), or null. */
    fun open(path: String): InputStream?
}

class AndroidAssetSource(private val assets: AssetManager, private val root: String = "editor") : AssetSource {
    override fun open(path: String): InputStream? = try { assets.open("$root/$path") } catch (_: IOException) { null }
}

object Mime {
    fun forPath(path: String): ContentType = when (path.substringAfterLast('.', "").lowercase()) {
        "html" -> ContentType.Text.Html.withCharset(Charsets.UTF_8)
        "js", "mjs" -> ContentType.Text.JavaScript.withCharset(Charsets.UTF_8)
        "css" -> ContentType.Text.CSS.withCharset(Charsets.UTF_8)
        "json" -> ContentType.Application.Json
        "svg" -> ContentType.Image.SVG
        "png" -> ContentType.Image.PNG
        "jpg", "jpeg" -> ContentType.Image.JPEG
        "gif" -> ContentType.Image.GIF
        "webp" -> ContentType("image", "webp")
        "ico" -> ContentType("image", "x-icon")
        "woff2" -> ContentType("font", "woff2")
        "wasm" -> ContentType("application", "wasm")
        else -> ContentType.Application.OctetStream
    }

    /** Only plain relative paths: no "..", no backslashes, no empty or dot segments. */
    fun isSafePath(path: String): Boolean =
        path.isNotEmpty() && !path.contains('\\') && !path.contains('\u0000') && path.split('/').none { it.isEmpty() || it == "." || it == ".." }
}
