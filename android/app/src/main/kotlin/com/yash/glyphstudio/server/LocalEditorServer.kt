package com.yash.glyphstudio.server

/**
 * The server for the in-app WebView: loopback only, protected by a secret generated for each app process
 * (design.md decision 2). The PC-facing server (paired access over Wi-Fi) is separate.
 */
class LocalEditorServer(private val deps: ServerDeps) {
    private val token = Tokens.newToken()
    private val server = GlyphServer(deps, TokenAuthenticator(token), host = "127.0.0.1", requestedPort = 0)
    private var port = 0

    /** Starts the server on first use and returns the URL the WebView should open. */
    @Synchronized
    fun entryUrl(): String {
        if (!server.isRunning) port = server.start()
        return "http://127.0.0.1:$port/?token=$token"
    }

    @Synchronized
    fun stop() = server.stop()
}
