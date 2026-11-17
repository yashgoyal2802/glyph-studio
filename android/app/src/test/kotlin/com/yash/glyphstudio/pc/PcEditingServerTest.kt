package com.yash.glyphstudio.pc

import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.server.ServerDeps
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.SyncHub
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.net.CookieManager
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.WebSocket
import java.util.concurrent.CompletionStage
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The PC-editing server on a real socket, driven like a browser would: pairing page, wrong codes, the 5-strike rule,
 * refusing unpaired requests, and the admin controls that must exist only for the in-app screen. The loopback address
 * stands in for the Wi-Fi address (the code does not care which one it is given).
 */
class PcEditingServerTest {
    @get:Rule val tmp = TemporaryFolder()
    private var pc: PcEditing? = null
    private val events = ArrayList<String>()

    @After fun tearDown() { pc?.stop() }

    private fun deps(): ServerDeps {
        val repo = DesignRepository(tmp.root)
        return ServerDeps(repo, SyncHub(repo, FakeScheduler()), { p -> if (p == "index.html") "<html>editor</html>".byteInputStream() else null })
    }

    private fun controller(address: String? = "127.0.0.1"): PcEditing =
        PcEditing(deps(), addressProvider = { address }, preferredPort = 0, host = object : PcEditingHost {
            override fun onStarted() { events.add("started") }
            override fun onStopped() { events.add("stopped") }
        }).also { pc = it }

    private fun browser() = HttpClient.newBuilder().cookieHandler(CookieManager()).build()

    private fun HttpClient.get(url: String, path: String): HttpResponse<String> =
        send(HttpRequest.newBuilder(URI(url + path)).GET().build(), HttpResponse.BodyHandlers.ofString())

    private fun HttpClient.pair(url: String, code: String): HttpResponse<String> =
        send(
            HttpRequest.newBuilder(URI("$url/pair")).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"code\":\"$code\"}")).build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun started(c: PcEditing): PcEditing.Status = (c.start() as PcEditing.StartResult.Started).status

    private fun wrong(code: String) = if (code == "000000") "111111" else "000000"

    @Test fun turningOnShowsAnAddressAndACode() {
        val s = started(controller())
        assertTrue(s.on)
        assertTrue(s.url!!, Regex("http://127\\.0\\.0\\.1:[0-9]+").matches(s.url!!))
        assertTrue(Regex("[0-9]{6}").matches(s.code!!))
        assertEquals(listOf("started"), events)
    }

    @Test fun withoutWifiItDoesNotStartTheServer() {
        val c = controller(address = null)
        assertEquals(PcEditing.StartResult.NoWifi, c.start())
        assertFalse(c.status().on)
        assertNull(c.status().url)
        assertTrue(events.isEmpty())
    }

    @Test fun anUnpairedBrowserSeesOnlyThePairingPageAndNoData() {
        val s = started(controller())
        val b = browser()
        val page = b.get(s.url!!, "/")
        assertEquals(200, page.statusCode())
        assertTrue(page.body().contains("Pairing code"))
        assertFalse("the editor must not be served before pairing", page.body().contains("editor</html>"))
        for (path in listOf("/api/designs", "/api/export", "/api/slots", "/index.html", "/api/pc/status")) {
            assertEquals(path, 401, b.get(s.url!!, path).statusCode())
        }
    }

    @Test fun theRightCodePairsTheBrowserAndOpensTheEditor() {
        val s = started(controller())
        val b = browser()
        val r = b.pair(s.url!!, s.code!!)
        assertEquals(200, r.statusCode())
        assertTrue(r.headers().allValues("Set-Cookie").any { it.startsWith("gs_pc=") && it.contains("HttpOnly") })
        assertEquals("<html>editor</html>", b.get(s.url!!, "/").body())
        assertEquals(200, b.get(s.url!!, "/api/designs").statusCode())
        assertEquals(1, pc!!.status().paired)
    }

    @Test fun fiveWrongCodesChangeTheCodeSoTheOldOneIsUseless() {
        val c = controller()
        val s = started(c)
        val b = browser()
        for (i in 1..4) {
            val r = b.pair(s.url!!, wrong(s.code!!))
            assertEquals(401, r.statusCode())
            assertTrue(r.body(), r.body().contains("\"attemptsLeft\":${5 - i}"))
        }
        val fifth = b.pair(s.url!!, wrong(s.code!!))
        assertEquals(401, fifth.statusCode())
        assertTrue(fifth.body().contains("\"codeChanged\":true"))
        val fresh = c.status().code!!
        if (fresh != s.code) assertEquals("the old code must no longer work", 401, b.pair(s.url!!, s.code!!).statusCode())
        assertEquals(200, b.pair(s.url!!, fresh).statusCode())
    }

    @Test fun aWrongCookieIsRefused() {
        val s = started(controller())
        val req = HttpRequest.newBuilder(URI(s.url + "/api/designs")).header("Cookie", "gs_pc=forged").GET().build()
        assertEquals(401, HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).statusCode())
    }

    @Test fun theBrowserCannotControlPcEditingOrThePhone() {
        val s = started(controller())
        val b = browser()
        b.pair(s.url!!, s.code!!)
        for (path in listOf("/api/pc/status", "/api/device/open-toy-manager")) {
            assertEquals(path, 404, b.get(s.url!!, path).statusCode())
        }
        val stop = b.send(HttpRequest.newBuilder(URI(s.url + "/api/pc/stop")).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString())
        assertEquals(404, stop.statusCode())
        assertTrue("still running", pc!!.status().on)
    }

    @Test fun disconnectAllSignsTheBrowserOutAndNeedsANewCode() {
        val c = controller()
        val s = started(c)
        val b = browser()
        b.pair(s.url!!, s.code!!)
        assertEquals(200, b.get(s.url!!, "/api/designs").statusCode())
        c.disconnectAll()
        assertEquals(401, b.get(s.url!!, "/api/designs").statusCode())
        assertEquals(0, c.status().paired)
        assertTrue(c.status().on)
    }

    @Test fun disconnectAllAlsoClosesLiveEditingConnections() {
        val design = DesignRepository(tmp.root).create("Live")
        val s = started(controller())
        val b = browser()
        b.pair(s.url!!, s.code!!)
        val token = (b.cookieHandler().get() as CookieManager).cookieStore.cookies.first { it.name == PcAuthenticator.COOKIE }.value
        val opened = CountDownLatch(1)
        val closed = CountDownLatch(1)
        var closeCode = -1
        val ws = b.newWebSocketBuilder().header("Cookie", "${PcAuthenticator.COOKIE}=$token")
            .buildAsync(URI(s.url!!.replace("http://", "ws://") + "/ws/designs/${design.id}"), object : WebSocket.Listener {
                override fun onOpen(webSocket: WebSocket) { opened.countDown(); webSocket.request(10) }
                override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? { webSocket.request(1); return null }
                override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? { closeCode = statusCode; closed.countDown(); return null }
            }).get(5, TimeUnit.SECONDS)
        assertTrue("the connection opens while paired", opened.await(5, TimeUnit.SECONDS))
        assertFalse("and stays open", closed.await(2, TimeUnit.SECONDS))
        pc!!.disconnectAll()
        assertTrue("signing every computer out closes the open connection", closed.await(6, TimeUnit.SECONDS))
        assertEquals(1008, closeCode)
        ws.abort()
    }

    @Test fun turningOffStopsTheServerAndForgetsEverything() {
        val c = controller()
        val s = started(c)
        val b = browser()
        b.pair(s.url!!, s.code!!)
        c.stop()
        assertFalse(c.status().on)
        assertNull(c.status().code)
        assertEquals(listOf("started", "stopped"), events)
        val refused = runCatching { b.get(s.url!!, "/api/designs") }.isFailure
        assertTrue("the port must be closed", refused)
        // Turning it on again needs a new pairing.
        val again = started(c)
        assertNotNull(again.code)
        assertEquals(401, browser().get(again.url!!, "/api/designs").statusCode())
    }

    @Test fun startingTwiceKeepsTheSameSession() {
        val c = controller()
        val a = started(c)
        val b = started(c)
        assertEquals(a, b)
        assertEquals(listOf("started"), events)
    }
}
