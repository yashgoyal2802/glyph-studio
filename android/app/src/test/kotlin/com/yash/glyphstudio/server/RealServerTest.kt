package com.yash.glyphstudio.server

import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.SyncHub
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

/** Starts the real CIO server on a real socket (not the in-process test host) and talks to it like the WebView will. */
class RealServerTest {
    @get:Rule val tmp = TemporaryFolder()
    private var server: GlyphServer? = null
    private val token = Tokens.newToken()
    private val http = HttpClient.newHttpClient()

    @After fun tearDown() { server?.stop() }

    private fun start(): Int {
        val repo = DesignRepository(tmp.root)
        val deps = ServerDeps(repo, SyncHub(repo, FakeScheduler()), { p -> if (p == "index.html") "<html>real</html>".byteInputStream() else null })
        return GlyphServer(deps, TokenAuthenticator(token)).also { server = it }.start()
    }

    private fun get(port: Int, path: String, bearer: String? = null): HttpResponse<String> {
        val req = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path")).GET().apply { if (bearer != null) header("Authorization", "Bearer $bearer") }.build()
        return http.send(req, HttpResponse.BodyHandlers.ofString())
    }

    @Test fun realServerEnforcesTheTokenAndServesTheEntryPage() {
        val port = start()
        assertTrue("a free port was chosen", port in 1..65535)
        assertEquals(401, get(port, "/").statusCode())
        assertEquals(401, get(port, "/api/designs").statusCode())
        assertEquals(401, get(port, "/?token=wrong").statusCode())

        val entry = get(port, "/?token=$token")
        assertEquals(200, entry.statusCode())
        assertEquals("<html>real</html>", entry.body())
        val cookie = entry.headers().firstValue("Set-Cookie").orElse("")
        assertTrue(cookie, cookie.startsWith("gs_session=$token"))

        assertEquals(200, get(port, "/api/designs", bearer = token).statusCode())
        assertEquals(401, get(port, "/api/designs?token=$token").statusCode())
    }

    @Test fun listensOnLoopbackOnly() {
        val port = start()
        val nonLoopback = java.net.NetworkInterface.getNetworkInterfaces().toList()
            .flatMap { it.inetAddresses.toList() }.firstOrNull { !it.isLoopbackAddress && it is java.net.Inet4Address }
        if (nonLoopback != null) {
            val refused = runCatching { java.net.Socket().use { it.connect(java.net.InetSocketAddress(nonLoopback, port), 800) } }.isFailure
            assertTrue("server must not be reachable via ${nonLoopback.hostAddress}", refused)
        }
    }

    @Test fun stopsCleanlyAndFreesThePort() {
        val port = start()
        assertEquals(401, get(port, "/").statusCode())
        server!!.stop()
        assertTrue(runCatching { get(port, "/") }.isFailure)
    }
}
