package com.yash.glyphstudio

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowInsets
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.window.OnBackInvokedDispatcher
import kotlin.concurrent.thread

/** Full-screen host for the web editor, which is served by the app's own loopback server. */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private val app get() = application as GlyphApp

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            addJavascriptInterface(com.yash.glyphstudio.share.ShareBridge(this@MainActivity), "GlyphAndroid")
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_NO_CACHE
            }
            webViewClient = object : WebViewClient() {
                // The editor never leaves the local server; block everything else.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.host != "127.0.0.1"
            }
            webChromeClient = object : WebChromeClient() {
                // "Choose a file" buttons in the page (picture import) are ignored by a WebView unless the app opens the picker.
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileChooser?.onReceiveValue(null) // a previous chooser that never finished
                    fileChooser = callback
                    return try {
                        startActivityForResult(pickerIntent(params), REQUEST_FILE)
                        true
                    } catch (e: ActivityNotFoundException) {
                        fileChooser = null
                        callback.onReceiveValue(null)
                        false
                    }
                }

                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.println(
                        if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.ERROR else Log.INFO,
                        GlyphApp.TAG, "web: ${m.message()} (${m.sourceId()}:${m.lineNumber()})",
                    )
                    return true
                }
            }
        }
        // Android 15+ draws edge-to-edge. Padding a WebView does not shrink its page, so the padding goes on a
        // container that the WebView fills; this keeps the editor clear of the status and navigation bars.
        val container = FrameLayout(this).apply {
            addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                WindowInsets.CONSUMED
            }
        }
        setContentView(container)

        onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
            // The page gets first say: an open dialog or a selection closes before the screen does.
            webView.evaluateJavascript("(function(){return !!(window.glyphBack && window.glyphBack())})()") { handled ->
                if (handled != "true") { if (webView.canGoBack()) webView.goBack() else finish() }
            }
        }

        // Starting the server touches sockets, so do it off the main thread.
        thread(name = "start-editor-server") {
            val url = try { app.localServer.entryUrl() } catch (e: Exception) {
                Log.e(GlyphApp.TAG, "Could not start the local server", e); return@thread
            }
            runOnUiThread { webView.loadUrl(url) }
        }
    }

    /**
     * Photos use the system photo picker (nicest for the gallery). But that picker only lists gallery items, so a GIF
     * saved in Downloads never appears there. When the page asks for GIFs only, open the real file browser instead, which
     * can reach Downloads and every other folder, and let it show every picture type we can read.
     */
    private fun pickerIntent(params: WebChromeClient.FileChooserParams): Intent {
        val accepted = params.acceptTypes.map { it.trim() }.filter { it.isNotEmpty() }
        // Design files (.glyph.json) are not pictures, and often have no useful type, so show every file for them.
        if (accepted.any { it.contains("json") }) {
            return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download"))
            }
        }
        val wantsFileBrowser = accepted == listOf("image/gif")
        if (!wantsFileBrowser) return params.createIntent()
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/gif", "image/png", "image/jpeg", "image/webp"))
            // Start in Downloads, where saved GIFs usually are.
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download"))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_FILE) {
            fileChooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileChooser = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onStart() {
        super.onStart()
        app.preview.onAppForegrounded()
    }

    override fun onStop() {
        super.onStop()
        app.hub.flushAll() // never leave edits only in memory when the app goes to the background
        app.preview.onAppBackgrounded(hasRemoteSession = false) // gives the matrix back after 10 s (PC editing comes later)
    }

    override fun onDestroy() {
        fileChooser?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }

    private companion object { const val REQUEST_FILE = 4711 }
}
