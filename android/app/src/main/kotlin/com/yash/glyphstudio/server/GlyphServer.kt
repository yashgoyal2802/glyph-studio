package com.yash.glyphstudio.server

import io.ktor.server.cio.CIO
import io.ktor.server.cio.CIOApplicationEngine
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import kotlinx.coroutines.runBlocking

/** Lifecycle of one embedded HTTP/WebSocket server bound to [host]. Use port 0 to let the system pick a free port. */
class GlyphServer(
    private val deps: ServerDeps,
    private val auth: Authenticator,
    private val host: String = "127.0.0.1",
    private val requestedPort: Int = 0,
) {
    private var server: EmbeddedServer<CIOApplicationEngine, CIOApplicationEngine.Configuration>? = null

    /** Starts listening and returns the port actually in use. */
    @Synchronized
    fun start(): Int {
        check(server == null) { "Server already started" }
        val s = embeddedServer(CIO, host = host, port = requestedPort) { glyphModule(deps, auth) }
        s.start(wait = false)
        server = s
        return runBlocking { s.engine.resolvedConnectors().first().port }
    }

    @Synchronized
    fun stop() {
        server?.stop(gracePeriodMillis = 300, timeoutMillis = 1500)
        server = null
    }

    val isRunning: Boolean get() = server != null
}
