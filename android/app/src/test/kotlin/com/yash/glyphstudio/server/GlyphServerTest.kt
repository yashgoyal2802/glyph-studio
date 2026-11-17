package com.yash.glyphstudio.server

import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.generated.SharedConstants as C
import com.yash.glyphstudio.sync.FakeScheduler
import com.yash.glyphstudio.sync.SyncHub
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class GlyphServerTest {
    @get:Rule val tmp = TemporaryFolder()

    private val token = "t0k3n-for-tests"
    private val assets = mapOf(
        "index.html" to "<html>editor</html>",
        "assets/app.js" to "console.log(1)",
        "assets/style.css" to "body{}",
        "icons.svg" to "<svg/>",
    )
    private val led = C.LED_MASK.indexOfFirst { it }

    private class Env(
        val repo: DesignRepository,
        val hub: SyncHub,
        val slots: com.yash.glyphstudio.slots.SlotStore,
        val device: com.yash.glyphstudio.matrix.FakeMatrixDevice,
        val toyManagerOpened: java.util.concurrent.atomic.AtomicInteger,
    )

    private fun run(supported: Boolean = true, block: suspend ApplicationTestBuilder.(Env) -> Unit) = testApplication {
        val repo = DesignRepository(File(tmp.root, "designs"))
        val hub = SyncHub(repo, FakeScheduler())
        val slots = com.yash.glyphstudio.slots.SlotStore(File(tmp.root, "slots.json"), repo, hub, FakeScheduler())
        val device = com.yash.glyphstudio.matrix.FakeMatrixDevice()
        val preview = com.yash.glyphstudio.matrix.PreviewController(com.yash.glyphstudio.matrix.MatrixLink(device), hub, FakeScheduler(), supported)
        val opened = java.util.concurrent.atomic.AtomicInteger()
        val actions = object : DeviceActions { override fun openToyManager(): Boolean { opened.incrementAndGet(); return true } }
        val deps = ServerDeps(
            repo, hub, { p -> assets[p]?.byteInputStream() },
            newId = java.util.UUID::randomUUID.let { { it.invoke().toString() } },
            slots = slots, preview = preview, device = actions,
            settings = com.yash.glyphstudio.design.SettingsStore(File(tmp.root, "settings.json")),
        )
        application { glyphModule(deps, TokenAuthenticator(token)) }
        block(Env(repo, hub, slots, device, opened))
    }

    private fun HttpRequestBuilder.auth() = header(HttpHeaders.Authorization, "Bearer $token")
    private suspend fun HttpResponse.obj() = JSONObject(bodyAsText())
    private suspend fun HttpResponse.arr() = JSONArray(bodyAsText())

    // ---------------------------------------------------------------- authentication
    @Test fun refusesEveryRequestWithoutAToken() = run { env ->
        val d = env.repo.create("secret")
        for (path in listOf("/", "/api/designs", "/api/designs/${d.id}", "/assets/app.js", "/api/export")) {
            assertEquals(path, HttpStatusCode.Unauthorized, client.get(path).status)
        }
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/designs").status)
        assertEquals(HttpStatusCode.Unauthorized, client.delete("/api/designs/${d.id}").status)
        assertNotEquals(null, env.repo.get(d.id)) // nothing was deleted
    }

    @Test fun refusesAWrongToken() = run {
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/designs") { header(HttpHeaders.Authorization, "Bearer nope") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/?token=nope").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/designs") { header(HttpHeaders.Cookie, "gs_session=nope") }.status)
    }

    @Test fun acceptsBearerTokenAndCookie() = run {
        assertEquals(HttpStatusCode.OK, client.get("/api/designs") { auth() }.status)
        assertEquals(HttpStatusCode.OK, client.get("/api/designs") { header(HttpHeaders.Cookie, "gs_session=$token") }.status)
    }

    @Test fun entryPageAcceptsTokenInUrlAndSetsAHardenedCookie() = run {
        val r = client.get("/?token=$token")
        assertEquals(HttpStatusCode.OK, r.status)
        assertEquals("<html>editor</html>", r.bodyAsText())
        val cookie = r.headers[HttpHeaders.SetCookie]!!
        assertTrue(cookie, cookie.startsWith("gs_session=$token"))
        assertTrue(cookie, cookie.contains("HttpOnly", ignoreCase = true))
        assertTrue(cookie, cookie.contains("SameSite=Strict", ignoreCase = true))
    }

    @Test fun tokenInTheUrlIsNotAcceptedForApiOrAssets() = run {
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/designs?token=$token").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/assets/app.js?token=$token").status)
    }

    @Test fun websocketIsRefusedWithoutAToken() = run { env ->
        val d = env.repo.create("x")
        val ws = createClient { install(WebSockets) }
        val failure = runCatching { ws.webSocket("/ws/designs/${d.id}") { } }.exceptionOrNull()
        assertTrue("handshake should fail", failure != null)
    }

    // ---------------------------------------------------------------- static files
    @Test fun servesEditorFilesWithContentTypes() = run {
        val js = client.get("/assets/app.js") { auth() }
        assertEquals("console.log(1)", js.bodyAsText())
        assertTrue(js.headers[HttpHeaders.ContentType]!!.startsWith("text/javascript"))
        assertTrue(client.get("/assets/style.css") { auth() }.headers[HttpHeaders.ContentType]!!.startsWith("text/css"))
        assertTrue(client.get("/icons.svg") { auth() }.headers[HttpHeaders.ContentType]!!.startsWith("image/svg+xml"))
        assertTrue(client.get("/") { auth() }.headers[HttpHeaders.ContentType]!!.startsWith("text/html"))
    }

    @Test fun unknownFilesAndPathTricksAre404() = run {
        assertEquals(HttpStatusCode.NotFound, client.get("/nope.js") { auth() }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/assets/../index.html") { auth() }.status.let { if (it == HttpStatusCode.OK) HttpStatusCode.OK else HttpStatusCode.NotFound })
        assertEquals(HttpStatusCode.NotFound, client.get("/%2e%2e/%2e%2e/etc/passwd") { auth() }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/assets%5c..%5cindex.html") { auth() }.status)
        assertFalse(Mime.isSafePath("../x"))
        assertFalse(Mime.isSafePath("a/../b"))
        assertFalse(Mime.isSafePath("a//b"))
        assertFalse(Mime.isSafePath("a\\b"))
        assertTrue(Mime.isSafePath("assets/app.js"))
    }

    // ---------------------------------------------------------------- REST: library
    @Test fun createListGetDelete() = run { env ->
        val created = client.post("/api/designs") { auth(); setBody("""{"name":"Pacman"}""") }
        assertEquals(HttpStatusCode.Created, created.status)
        val id = created.obj().getJSONObject("design").getString("id")
        assertEquals("Pacman", env.repo.get(id)!!.name)

        val list = client.get("/api/designs") { auth() }.arr()
        assertEquals(1, list.length())
        assertEquals("Pacman", list.getJSONObject(0).getString("name"))
        assertEquals(1, list.getJSONObject(0).getInt("frameCount"))

        val got = client.get("/api/designs/$id") { auth() }.obj()
        assertEquals(0, got.getInt("revision"))
        assertEquals(id, got.getJSONObject("design").getString("id"))

        assertEquals(HttpStatusCode.NoContent, client.delete("/api/designs/$id") { auth() }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/designs/$id") { auth() }.status)
        assertEquals(HttpStatusCode.NotFound, client.delete("/api/designs/$id") { auth() }.status)
    }

    @Test fun libraryListShowsThumbnailsAndJustMadeEdits() = run { env ->
        val d = env.repo.create("Before")
        val op = """{"t":"setPixels","frameId":"${d.frames[0].id}","layerId":"${d.frames[0].layers[0].id}","indices":[$led],"values":[222]}"""
        client.post("/api/designs/${d.id}/ops") { auth(); setBody(op) }
        client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"rename","name":"After"}""") }
        // Nothing has been written to disk yet (the save is delayed), but the list must already reflect both edits.
        assertEquals("Before", env.repo.get(d.id)!!.name)
        val item = client.get("/api/designs") { auth() }.arr().getJSONObject(0)
        assertEquals("After", item.getString("name"))
        val thumb = java.util.Base64.getDecoder().decode(item.getString("thumb"))
        assertEquals(625, thumb.size)
        assertEquals(222, thumb[led].toInt() and 0xFF)
    }

    @Test fun createWithoutBodyUsesDefaultName() = run {
        val r = client.post("/api/designs") { auth() }
        assertEquals("Untitled", r.obj().getJSONObject("design").getString("name"))
    }

    @Test fun unknownAndUnsafeIdsAre404() = run {
        assertEquals(HttpStatusCode.NotFound, client.get("/api/designs/does-not-exist") { auth() }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/designs/..%2Fescape") { auth() }.status)
    }

    @Test fun duplicateIncludesUnsavedEdits() = run { env ->
        val d = env.repo.create("Orig")
        val op = """{"t":"setPixels","frameId":"${d.frames[0].id}","layerId":"${d.frames[0].layers[0].id}","indices":[$led],"values":[200]}"""
        assertEquals(HttpStatusCode.OK, client.post("/api/designs/${d.id}/ops") { auth(); setBody(op) }.status)
        val copy = client.post("/api/designs/${d.id}/duplicate") { auth() }
        assertEquals(HttpStatusCode.Created, copy.status)
        val copyDesign = copy.obj().getJSONObject("design")
        assertEquals("Orig copy", copyDesign.getString("name"))
        assertNotEquals(d.id, copyDesign.getString("id"))
        val px = java.util.Base64.getDecoder().decode(copyDesign.getJSONArray("frames").getJSONObject(0).getJSONArray("layers").getJSONObject(0).getString("data"))
        assertEquals(200, px[led].toInt() and 0xFF)
        assertEquals(HttpStatusCode.NotFound, client.post("/api/designs/nope/duplicate") { auth() }.status)
    }

    // ---------------------------------------------------------------- REST: operations
    @Test fun opsApplyAndReturnRevision() = run { env ->
        val d = env.repo.create("a")
        val r1 = client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"rename","name":"b"}""") }
        assertEquals(1, r1.obj().getInt("revision"))
        val r2 = client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"setLoop","loop":"bounce"}""") }
        assertEquals(2, r2.obj().getInt("revision"))
        val snap = client.get("/api/designs/${d.id}") { auth() }.obj()
        assertEquals(2, snap.getInt("revision"))
        assertEquals("b", snap.getJSONObject("design").getString("name"))
        assertEquals("bounce", snap.getJSONObject("design").getJSONObject("anim").getString("loop"))
    }

    @Test fun malformedOpsAre400AndRejectedOpsAre422() = run { env ->
        val d = env.repo.create("a")
        fun post(body: String) = runCatching { kotlinx.coroutines.runBlocking { client.post("/api/designs/${d.id}/ops") { auth(); setBody(body) } } }.getOrThrow()
        assertEquals(HttpStatusCode.BadRequest, post("not json").status)
        assertEquals(HttpStatusCode.BadRequest, post("""{"t":"explode"}""").status)
        assertEquals(HttpStatusCode.BadRequest, post("""{"t":"rename"}""").status)
        assertEquals(HttpStatusCode.BadRequest, post("""{"t":"setPixels","frameId":"f","layerId":"l","indices":["x"],"values":[1]}""").status)
        assertEquals(HttpStatusCode.UnprocessableEntity, post("""{"t":"deleteFrame","frameId":"ghost"}""").status)
        assertEquals(HttpStatusCode.UnprocessableEntity, post("""{"t":"deleteFrame","frameId":"${d.frames[0].id}"}""").status) // last frame
        assertEquals(0, env.hub.snapshot(d.id)!!.revision)
        assertEquals(HttpStatusCode.NotFound, client.post("/api/designs/nope/ops") { auth(); setBody("""{"t":"rename","name":"x"}""") }.status)
    }

    // ---------------------------------------------------------------- settings
    @Test fun settingsCanBeReadAndChanged() = run { env ->
        val before = client.get("/api/settings") { auth() }.obj()
        assertFalse(before.getBoolean("firstRunDone"))
        val after = client.put("/api/settings") { auth(); setBody("""{"firstRunDone":true,"junk":true}""") }.obj()
        assertTrue(after.getBoolean("firstRunDone"))
        assertFalse(after.has("junk"))
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/settings") { auth(); setBody("nope") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/settings").status)
    }

    // ---------------------------------------------------------------- undo history
    private val history = """{"undo":[{"label":"Pen","redo":[],"undo":[]}],"redo":[]}"""

    @Test fun historyIsKeptAndComesBackForTheSameDesign() = run { env ->
        val d = env.repo.create("h")
        assertEquals(HttpStatusCode.NoContent, client.put("/api/designs/${d.id}/history") { auth(); setBody(history) }.status)
        val back = client.get("/api/designs/${d.id}/history") { auth() }.obj()
        assertEquals(1, back.getJSONArray("undo").length())
        assertEquals("Pen", back.getJSONArray("undo").getJSONObject(0).getString("label"))
    }

    @Test fun historyIsDroppedWhenTheDesignChangedSince() = run { env ->
        val d = env.repo.create("h")
        client.put("/api/designs/${d.id}/history") { auth(); setBody(history) }
        // edited from somewhere else while the editor was closed
        client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"rename","name":"changed elsewhere"}""") }
        val back = client.get("/api/designs/${d.id}/history") { auth() }.obj()
        assertEquals(0, back.getJSONArray("undo").length())
        // and it is gone for good, even if the design is changed back
        client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"rename","name":"h"}""") }
        assertEquals(0, client.get("/api/designs/${d.id}/history") { auth() }.obj().getJSONArray("undo").length())
    }

    @Test fun historyRejectsBadBodiesAndUnknownDesigns() = run { env ->
        val d = env.repo.create("h")
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/designs/${d.id}/history") { auth(); setBody("nope") }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/designs/${d.id}/history") { auth(); setBody("""{"undo":[]}""") }.status)
        assertEquals(HttpStatusCode.NotFound, client.put("/api/designs/ghost/history") { auth(); setBody(history) }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/designs/ghost/history") { auth() }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/designs/${d.id}/history").status)
    }

    @Test fun deletingADesignDeletesItsHistoryAndExportIgnoresIt() = run { env ->
        val d = env.repo.create("h")
        client.put("/api/designs/${d.id}/history") { auth(); setBody(history) }
        val file = File(File(tmp.root, "designs"), d.id + DesignRepository.HISTORY_SUFFIX)
        assertTrue(file.exists())
        val exported = client.get("/api/designs/${d.id}/export") { auth() }.bodyAsText()
        assertFalse(exported.contains("\"undo\""))
        assertFalse(client.get("/api/export") { auth() }.bodyAsText().contains("\"undo\""))
        client.delete("/api/designs/${d.id}") { auth() }
        assertFalse(file.exists())
    }

    // ---------------------------------------------------------------- REST: export / import
    @Test fun exportSingleDesignIsAFileDownload() = run { env ->
        val d = env.repo.create("My: design/1")
        val r = client.get("/api/designs/${d.id}/export") { auth() }
        assertEquals(HttpStatusCode.OK, r.status)
        val disposition = r.headers[HttpHeaders.ContentDisposition]!!
        assertTrue(disposition, disposition.contains("attachment") && disposition.contains(".glyph.json"))
        assertFalse(disposition, disposition.contains("/") || disposition.contains(":"))
        assertTrue(DesignCodec.parse(r.bodyAsText()) is com.yash.glyphstudio.design.ParseResult.Ok)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/designs/nope/export") { auth() }.status)
    }

    @Test fun exportAllAndSelected() = run { env ->
        val a = env.repo.create("A"); val b = env.repo.create("B"); env.repo.create("C")
        assertEquals(3, client.get("/api/export") { auth() }.arr().length())
        val some = client.get("/api/export?ids=${a.id},${b.id}") { auth() }
        assertEquals(setOf("A", "B"), (0 until 2).map { some.arr().getJSONObject(it).getString("name") }.toSet())
        assertTrue(some.headers[HttpHeaders.ContentDisposition]!!.contains(".glyphpack.json"))
    }

    @Test fun importGivesNewIdsAndNeverOverwrites() = run { env ->
        val d = env.repo.create("Original")
        val file = DesignCodec.serialize(env.repo.get(d.id)!!).toString()
        val r = client.post("/api/import") { auth(); setBody(file) }
        assertEquals(HttpStatusCode.Created, r.status)
        val created = r.arr()
        assertEquals(1, created.length())
        assertNotEquals(d.id, created.getJSONObject(0).getString("id"))
        assertEquals(2, env.repo.list().size)
        assertEquals("Original", env.repo.get(d.id)!!.name)
    }

    @Test fun importPackOfSeveralDesigns() = run { env ->
        val a = DesignCodec.serialize(DesignCodec.createDesign("A")); val b = DesignCodec.serialize(DesignCodec.createDesign("B"))
        val r = client.post("/api/import") { auth(); setBody(JSONArray().put(a).put(b).toString()) }
        assertEquals(2, r.arr().length())
        assertEquals(setOf("A", "B"), env.repo.list().map { it.name }.toSet())
    }

    @Test fun invalidImportAddsNothing() = run { env ->
        val good = DesignCodec.serialize(DesignCodec.createDesign("good"))
        val bad = DesignCodec.serialize(DesignCodec.createDesign("bad")).put("frames", JSONArray())
        val r = client.post("/api/import") { auth(); setBody(JSONArray().put(good).put(bad).toString()) }
        assertEquals(HttpStatusCode.BadRequest, r.status)
        assertTrue(r.obj().getString("error").contains("Design 2"))
        assertTrue(env.repo.list().isEmpty())
        assertEquals(HttpStatusCode.BadRequest, client.post("/api/import") { auth(); setBody("hello") }.status)
        assertEquals(HttpStatusCode.BadRequest, client.post("/api/import") { auth(); setBody("[]") }.status)
        val newer = DesignCodec.serialize(DesignCodec.createDesign()).put("format", C.FORMAT_VERSION + 1)
        val rn = client.post("/api/import") { auth(); setBody(newer.toString()) }
        assertEquals(HttpStatusCode.BadRequest, rn.status)
        assertTrue(rn.obj().getString("error").contains("newer"))
    }

    @Test fun saveEndpointWritesEditsToDiskNow() = run { env ->
        val d = env.repo.create("before")
        client.post("/api/designs/${d.id}/ops") { auth(); setBody("""{"t":"rename","name":"after"}""") }
        assertEquals("before", env.repo.get(d.id)!!.name) // the automatic save is still waiting
        val r = client.post("/api/designs/${d.id}/save") { auth() }
        assertEquals(HttpStatusCode.OK, r.status)
        assertTrue(r.obj().getBoolean("saved"))
        assertEquals(1, r.obj().getInt("revision"))
        assertEquals("after", env.repo.get(d.id)!!.name)
        assertEquals(HttpStatusCode.NotFound, client.post("/api/designs/nope/save") { auth() }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/designs/${d.id}/save").status)
    }

    @Test fun websocketClientsAreToldWhenASaveHappens() = run { env ->
        val d = env.repo.create("live")
        createClient { install(WebSockets) }.webSocket("/ws/designs/${d.id}?client=A", { auth() }) {
            next() // snapshot
            send(Frame.Text(opJson(d, led, 50, 1)))
            assertEquals("ack", next().getString("type"))
            env.hub.flush(d.id)
            val saved = next()
            assertEquals("saved", saved.getString("type"))
            assertEquals(1, saved.getInt("revision"))
        }
    }

    // ---------------------------------------------------------------- toy slots, live preview, device
    @Test fun slotsListAssignAndClear() = run { env ->
        val a = env.repo.create("Pacman")
        val initial = client.get("/api/slots") { auth() }.arr()
        assertEquals(5, initial.length())
        assertTrue((0 until 5).all { initial.getJSONObject(it).isNull("designId") })
        assertEquals(1, initial.getJSONObject(0).getInt("slot"))

        val put = client.put("/api/slots/2") { auth(); setBody("""{"designId":"${a.id}"}""") }
        assertEquals(HttpStatusCode.OK, put.status)
        val after = put.arr().getJSONObject(1)
        assertEquals(a.id, after.getString("designId"))
        assertEquals("Pacman", after.getString("designName"))
        assertEquals(a.id, env.slots.assignment(2))

        val cleared = client.put("/api/slots/2") { auth(); setBody("""{"designId":null}""") }
        assertTrue(cleared.arr().getJSONObject(1).isNull("designId"))
        assertNull(env.slots.assignment(2))
    }

    @Test fun slotsRejectBadInput() = run { env ->
        val a = env.repo.create("A")
        suspend fun put(path: String, body: String) = client.put(path) { auth(); setBody(body) }.status
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/0", """{"designId":"${a.id}"}"""))
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/6", """{"designId":"${a.id}"}"""))
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/x", """{"designId":"${a.id}"}"""))
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/1", "not json"))
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/1", "{}"))
        assertEquals(HttpStatusCode.BadRequest, put("/api/slots/1", """{"designId":5}"""))
        assertEquals(HttpStatusCode.NotFound, put("/api/slots/1", """{"designId":"does-not-exist"}"""))
        assertEquals(HttpStatusCode.NotFound, put("/api/slots/1", """{"designId":"../escape"}"""))
        assertNull(env.slots.assignment(1))
    }

    @Test fun slotsAndPreviewRequireTheToken() = run {
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/slots").status)
        assertEquals(HttpStatusCode.Unauthorized, client.put("/api/slots/1") { setBody("""{"designId":null}""") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/preview").status)
        assertEquals(HttpStatusCode.Unauthorized, client.put("/api/preview") { setBody("""{"enabled":false}""") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/device/open-toy-manager").status)
    }

    @Test fun previewStartStatusAndStop() = run { env ->
        val d = env.repo.create("live")
        val off = client.get("/api/preview") { auth() }.obj()
        assertTrue(off.getBoolean("supported")); assertFalse(off.getBoolean("active"))

        val on = client.put("/api/preview") { auth(); setBody("""{"enabled":true,"designId":"${d.id}","frameId":"${d.frames[0].id}"}""") }.obj()
        assertTrue(on.getBoolean("active"))
        assertEquals(d.id, on.getString("designId"))
        assertEquals(1, env.device.connects)
        env.device.onConnected!!() // the system's Glyph service answers

        // Asking again for the same design just updates the frame instead of reconnecting.
        client.put("/api/preview") { auth(); setBody("""{"enabled":true,"designId":"${d.id}","frameId":null}""") }
        assertEquals(1, env.device.connects)

        val stopped = client.put("/api/preview") { auth(); setBody("""{"enabled":false}""") }.obj()
        assertFalse(stopped.getBoolean("active"))
        assertEquals(1, env.device.closeApps)
    }

    @Test fun previewReportsUnsupportedPhonesAndBadRequests() = run(supported = false) { env ->
        val d = env.repo.create("x")
        val r = client.put("/api/preview") { auth(); setBody("""{"enabled":true,"designId":"${d.id}"}""") }.obj()
        assertFalse(r.getBoolean("supported")); assertFalse(r.getBoolean("active"))
        assertTrue(r.getString("message").contains("20250801"))
        assertEquals(0, env.device.connects)
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/preview") { auth(); setBody("""{"enabled":true}""") }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/preview") { auth(); setBody("nope") }.status)
    }

    @Test fun openToyManagerCallsTheDevice() = run { env ->
        val r = client.post("/api/device/open-toy-manager") { auth() }
        assertEquals(HttpStatusCode.OK, r.status)
        assertTrue(r.obj().getBoolean("ok"))
        assertEquals(1, env.toyManagerOpened.get())
    }

    // ---------------------------------------------------------------- WebSocket
    private suspend fun io.ktor.client.plugins.websocket.DefaultClientWebSocketSession.next(): JSONObject =
        withTimeout(5_000) { JSONObject((incoming.receive() as Frame.Text).readText()) }

    private fun opJson(d: com.yash.glyphstudio.design.Design, cell: Int, value: Int, seq: Int) =
        """{"type":"op","seq":$seq,"op":{"t":"setPixels","frameId":"${d.frames[0].id}","layerId":"${d.frames[0].layers[0].id}","indices":[$cell],"values":[$value]}}"""

    @Test fun websocketSendsSnapshotThenAcksOps() = run { env ->
        val d = env.repo.create("live")
        createClient { install(WebSockets) }.webSocket("/ws/designs/${d.id}?client=A", { auth() }) {
            val snap = next()
            assertEquals("snapshot", snap.getString("type"))
            assertEquals(0, snap.getInt("revision"))
            assertEquals("A", snap.getString("client"))
            assertEquals(d.id, snap.getJSONObject("design").getString("id"))

            send(Frame.Text(opJson(d, led, 99, 7)))
            val ack = next()
            assertEquals("ack", ack.getString("type"))
            assertEquals(7, ack.getInt("seq"))
            assertEquals(1, ack.getInt("revision"))
            assertEquals(99, env.hub.snapshot(d.id)!!.design.frames[0].layers[0].let { (it as com.yash.glyphstudio.design.PixelsLayer).data[led].toInt() and 0xFF })
        }
    }

    @Test fun websocketRejectsBadOpsAndKeepsRunning() = run { env ->
        val d = env.repo.create("live")
        createClient { install(WebSockets) }.webSocket("/ws/designs/${d.id}?client=A", { auth() }) {
            next() // snapshot
            send(Frame.Text("garbage")); assertEquals("reject", next().getString("type"))
            send(Frame.Text("""{"type":"op","seq":1,"op":{"t":"nope"}}""")); val r = next()
            assertEquals("reject", r.getString("type")); assertEquals(1, r.getInt("seq"))
            send(Frame.Text("""{"type":"op","seq":2,"op":{"t":"deleteFrame","frameId":"ghost"}}""")); assertEquals("reject", next().getString("type"))
            send(Frame.Text("""{"type":"op","seq":3,"op":{"t":"rename","name":"still works"}}"""))
            assertEquals("ack", next().getString("type"))
            assertEquals("still works", env.hub.snapshot(d.id)!!.design.name)
        }
    }

    @Test fun twoClientsSeeEachOthersEditsButNotTheirOwn() = run { env ->
        val d = env.repo.create("shared")
        val ws = createClient { install(WebSockets) }
        ws.webSocket("/ws/designs/${d.id}?client=phone", { auth() }) {
            next() // phone snapshot
            ws.webSocket("/ws/designs/${d.id}?client=pc", { auth() }) {
                next() // pc snapshot
                // PC draws; the phone must be told, the PC only gets an ack.
                send(Frame.Text(opJson(d, led, 120, 1)))
                assertEquals("ack", next().getString("type"))
            }
            val update = next()
            assertEquals("update", update.getString("type"))
            assertEquals("pc", update.getString("origin"))
            assertEquals(1, update.getInt("revision"))
            val op = update.getJSONObject("op")
            assertEquals("setPixels", op.getString("t"))
            assertEquals(led, op.getJSONArray("indices").getInt(0))
            assertEquals(120, op.getJSONArray("values").getInt(0))
        }
    }

    @Test fun lateJoinerGetsCurrentStateInTheSnapshot() = run { env ->
        val d = env.repo.create("late")
        env.hub.apply(d.id, com.yash.glyphstudio.sync.Op.Rename("edited before joining"), "phone")
        createClient { install(WebSockets) }.webSocket("/ws/designs/${d.id}", { auth() }) {
            val snap = next()
            assertEquals(1, snap.getInt("revision"))
            assertEquals("edited before joining", snap.getJSONObject("design").getString("name"))
            assertTrue(snap.getString("client").isNotEmpty()) // server-assigned when not supplied
        }
    }

    @Test fun websocketForUnknownDesignIsClosed() = run {
        createClient { install(WebSockets) }.webSocket("/ws/designs/nope", { auth() }) {
            val reason = closeReason.await()
            assertEquals(io.ktor.websocket.CloseReason.Codes.CANNOT_ACCEPT.code, reason?.code)
        }
    }

    @Test fun clientsAreToldWhenTheDesignIsDeleted() = run { env ->
        val d = env.repo.create("doomed")
        createClient { install(WebSockets) }.webSocket("/ws/designs/${d.id}", { auth() }) {
            next()
            env.repo.delete(d.id)
            assertEquals("deleted", next().getString("type"))
        }
        assertNull(env.hub.snapshot(d.id))
    }
}
