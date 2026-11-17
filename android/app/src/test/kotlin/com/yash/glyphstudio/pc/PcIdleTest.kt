package com.yash.glyphstudio.pc

import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.server.ServerDeps
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.SyncHub
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.WebSocket
import java.util.concurrent.CompletionStage
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** The 30-minute idle stop, with a fake clock so the tests do not wait. */
class PcIdleTest {
    @get:Rule val tmp = TemporaryFolder()
    private var now = 1_000_000L
    private var pc: PcEditing? = null
    private val events = ArrayList<String>()
    private val http = HttpClient.newHttpClient()
    private lateinit var repo: DesignRepository

    @After fun tearDown() { pc?.stop() }

    private fun controller(): PcEditing {
        repo = DesignRepository(tmp.root)
        val deps = ServerDeps(repo, SyncHub(repo, FakeScheduler()), { null })
        return PcEditing(
            deps, addressProvider = { "127.0.0.1" }, preferredPort = 0,
            host = object : PcEditingHost {
                override fun onStarted() { events.add("started") }
                override fun onStopped() { events.add("stopped") }
            },
            idleTimeoutMs = THIRTY_MIN, clock = { now }, checkEveryMs = 0,
        ).also { pc = it }
    }

    private fun pairCookie(url: String, code: String): String {
        val r = http.send(
            HttpRequest.newBuilder(URI("$url/pair")).POST(HttpRequest.BodyPublishers.ofString("{\"code\":\"$code\"}")).build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        return r.headers().firstValue("Set-Cookie").get().substringBefore(';')
    }

    private fun apiStatus(url: String, cookie: String) =
        http.send(HttpRequest.newBuilder(URI("$url/api/designs")).header("Cookie", cookie).GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode()

    private fun status(c: PcEditing) = (c.start() as PcEditing.StartResult.Started).status

    @Test fun stopsAfterThirtyMinutesWithNoBrowser() {
        val c = controller()
        status(c)
        now += THIRTY_MIN - 1
        assertFalse(c.checkIdle())
        assertTrue(c.status().on)
        now += 1
        assertTrue(c.checkIdle())
        assertFalse(c.status().on)
        assertEquals(listOf("started", "stopped"), events) // the notification is removed through onStopped
    }

    @Test fun usingTheEditorRestartsTheClock() {
        val c = controller()
        val s = status(c)
        val cookie = pairCookie(s.url!!, s.code!!)
        now += THIRTY_MIN - 1000
        assertEquals(200, apiStatus(s.url!!, cookie)) // a request counts as use
        now += THIRTY_MIN - 1000
        assertFalse("clock restarted by the request", c.checkIdle())
        now += 1000
        assertTrue(c.checkIdle())
    }

    @Test fun anOpenEditorConnectionKeepsItOnAndClosingItStartsTheClock() {
        val c = controller()
        val s = status(c)
        val cookie = pairCookie(s.url!!, s.code!!)
        val design = repo.create("Idle test")
        val opened = CountDownLatch(1)
        val closed = CountDownLatch(1)
        val ws = http.newWebSocketBuilder().header("Cookie", cookie)
            .buildAsync(URI("ws://${s.url!!.removePrefix("http://")}/ws/designs/${design.id}?client=t"), object : WebSocket.Listener {
                override fun onOpen(webSocket: WebSocket) { opened.countDown(); webSocket.request(1) }
                override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? { webSocket.request(1); return null }
                override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? { closed.countDown(); return null }
            }).get(5, TimeUnit.SECONDS)
        assertTrue(opened.await(5, TimeUnit.SECONDS))
        Thread.sleep(300) // let the server register the connection

        now += THIRTY_MIN * 3
        assertFalse("a connected editor is never cut off", c.checkIdle())
        assertTrue(c.status().on)

        ws.sendClose(WebSocket.NORMAL_CLOSURE, "bye").get(5, TimeUnit.SECONDS)
        Thread.sleep(400) // the server notices the close
        now += THIRTY_MIN - 1
        assertFalse(c.checkIdle())
        now += 1
        assertTrue(c.checkIdle())
    }

    @Test fun theEditorLinkAnswersPingsAndIsClosedWhenPcEditingIsTurnedOff() {
        val c = controller()
        val s = status(c)
        val cookie = pairCookie(s.url!!, s.code!!)
        val design = repo.create("Ping test")
        val pong = CountDownLatch(1)
        val closed = CountDownLatch(1)
        val ws = http.newWebSocketBuilder().header("Cookie", cookie)
            .buildAsync(URI("ws://${s.url!!.removePrefix("http://")}/ws/designs/${design.id}?client=t"), object : WebSocket.Listener {
                override fun onOpen(webSocket: WebSocket) { webSocket.request(5) }
                override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? {
                    if (data.contains("\"pong\"")) pong.countDown()
                    webSocket.request(1)
                    return null
                }
                override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? { closed.countDown(); return null }
                override fun onError(webSocket: WebSocket, error: Throwable) { closed.countDown() }
            }).get(5, TimeUnit.SECONDS)
        ws.sendText("{\"type\":\"ping\"}", true).get(5, TimeUnit.SECONDS)
        assertTrue("the phone must answer a ping", pong.await(5, TimeUnit.SECONDS))
        c.stop()
        assertTrue("turning PC editing off must close open editor connections", closed.await(5, TimeUnit.SECONDS))
    }

    @Test fun checkingWhileOffDoesNothing() {
        val c = controller()
        assertFalse(c.checkIdle())
        status(c)
        c.stop()
        assertFalse(c.checkIdle())
        assertEquals(listOf("started", "stopped"), events)
    }

    private companion object { const val THIRTY_MIN = 30L * 60 * 1000 }
}
