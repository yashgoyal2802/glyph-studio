package com.yash.glyphstudio.server

import com.yash.glyphstudio.design.Design
import com.yash.glyphstudio.design.DesignCodec
import com.yash.glyphstudio.design.DesignRepository
import com.yash.glyphstudio.design.ParseResult
import com.yash.glyphstudio.matrix.PreviewController
import com.yash.glyphstudio.pc.ActivityTracker
import com.yash.glyphstudio.pc.PcEditing
import com.yash.glyphstudio.slots.SlotStore
import com.yash.glyphstudio.sync.ApplyResult
import com.yash.glyphstudio.sync.OpException
import com.yash.glyphstudio.sync.OpJson
import com.yash.glyphstudio.sync.SyncHub
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.request.contentLength
import io.ktor.server.request.header
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.pingPeriod
import io.ktor.server.websocket.timeout
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.UUID
import kotlin.time.Duration.Companion.seconds

class ServerDeps(
    val repo: DesignRepository,
    val hub: SyncHub,
    val assets: AssetSource,
    val newId: () -> String = { UUID.randomUUID().toString() },
    val slots: SlotStore? = null,
    val preview: PreviewController? = null,
    val device: DeviceActions? = null,
    /** Turning PC editing on and off. Only the in-app server gets this; a browser on the Wi-Fi must never control it. */
    val pc: PcEditing? = null,
    /** Notes browser activity on the PC server, so it can switch itself off when nobody is using it. */
    val activity: ActivityTracker? = null,
    /** Small on/off preferences (first-run done, tray auto-close). */
    val settings: com.yash.glyphstudio.design.SettingsStore? = null,
) {
    /** The same data, minus everything that controls the phone itself. This is what a paired PC browser gets. */
    fun forRemote(activity: ActivityTracker? = null) = ServerDeps(repo, hub, assets, newId, slots, preview, device = null, pc = null, activity = activity, settings = settings)

    /** Adds the controls that only the app's own screen may use. */
    fun withLocalControls(device: DeviceActions?, pc: PcEditing?) = ServerDeps(repo, hub, assets, newId, slots, preview, device, pc, settings = settings)
}

private const val MAX_BODY_BYTES = 16L * 1024 * 1024

private suspend fun ApplicationCall.json(status: HttpStatusCode, body: Any) =
    respondText(body.toString(), ContentType.Application.Json, status)

private suspend fun ApplicationCall.fail(status: HttpStatusCode, message: String) =
    json(status, JSONObject().put("error", message))

private fun summaryJson(s: DesignRepository.Summary) =
    JSONObject().put("id", s.id).put("name", s.name).put("frameCount", s.frameCount).put("modified", s.modified).put("thumb", s.thumb)

private fun snapshotJson(designJson: JSONObject, revision: Long) = JSONObject().put("revision", revision).put("design", designJson)

private fun slotsJson(store: SlotStore) = JSONArray(
    store.info().map {
        JSONObject().put("slot", it.slot).put("designId", it.designId ?: JSONObject.NULL).put("designName", it.designName ?: JSONObject.NULL)
    },
)

private fun previewJson(s: PreviewController.Status) = JSONObject()
    .put("supported", s.supported).put("active", s.active)
    .put("designId", s.designId ?: JSONObject.NULL).put("frameId", s.frameId ?: JSONObject.NULL)
    .put("playing", s.playing).put("message", s.message ?: JSONObject.NULL)

private fun pcJson(s: PcEditing.Status) = JSONObject()
    .put("on", s.on).put("url", s.url ?: JSONObject.NULL).put("code", s.code ?: JSONObject.NULL).put("paired", s.paired)

private fun safeFileName(name: String) = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().ifEmpty { "design" }

/** Reads a request body as text, refusing anything larger than [MAX_BODY_BYTES]. Null when too large. */
private suspend fun ApplicationCall.boundedText(): String? {
    val declared = request.contentLength()
    if (declared != null && declared > MAX_BODY_BYTES) return null
    val text = receiveText()
    return if (text.length > MAX_BODY_BYTES) null else text
}

private fun parseObject(text: String): JSONObject? = try { JSONObject(text) } catch (_: JSONException) { null }

/**
 * The whole HTTP + WebSocket surface: the bundled editor, the library REST API and live editing over WebSocket.
 * Everything is behind [auth]; the same module serves the in-app WebView and (later) the paired PC browser.
 */
fun Application.glyphModule(deps: ServerDeps, auth: Authenticator) {
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 30.seconds
        maxFrameSize = MAX_BODY_BYTES
    }
    val repo = deps.repo
    val hub = deps.hub

    routing {
        intercept(ApplicationCallPipeline.Plugins) {
            if (!auth.isAuthorized(call)) {
                auth.respondUnauthorized(call)
                finish()
            }
        }

        route("/api") {
            get("/designs") {
                hub.flushAll() // so edits made a moment ago (a rename, the last stroke) show up in the list
                call.json(HttpStatusCode.OK, JSONArray(repo.list().map { summaryJson(it) }))
            }

            post("/designs") {
                val body = call.boundedText() ?: return@post call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val name = (if (body.isBlank()) null else parseObject(body)?.optString("name", ""))?.takeIf { it.isNotBlank() } ?: "Untitled"
                val d = repo.create(name)
                call.json(HttpStatusCode.Created, snapshotJson(DesignCodec.serialize(d), 0))
            }

            get("/designs/{id}") {
                val snap = call.parameters["id"]?.takeIf(DesignRepository::isValidId)?.let { hub.snapshot(it) }
                    ?: return@get call.fail(HttpStatusCode.NotFound, "Unknown design")
                call.json(HttpStatusCode.OK, snapshotJson(DesignCodec.serialize(snap.design), snap.revision))
            }

            delete("/designs/{id}") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@delete call.fail(HttpStatusCode.NotFound, "Unknown design")
                if (repo.delete(id)) call.respond(HttpStatusCode.NoContent) else call.fail(HttpStatusCode.NotFound, "Unknown design")
            }

            // The editor's undo/redo, kept so it survives closing the editor. Only valid for exactly the design it was recorded on.
            get("/designs/{id}/history") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@get call.fail(HttpStatusCode.NotFound, "Unknown design")
                val snap = hub.snapshot(id) ?: return@get call.fail(HttpStatusCode.NotFound, "Unknown design")
                val stored = repo.loadHistory(id, DesignRepository.fingerprint(snap.design))
                call.respondText(stored ?: "{\"undo\":[],\"redo\":[]}", ContentType.Application.Json)
            }

            put("/designs/{id}/history") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@put call.fail(HttpStatusCode.NotFound, "Unknown design")
                val snap = hub.snapshot(id) ?: return@put call.fail(HttpStatusCode.NotFound, "Unknown design")
                val body = call.boundedText() ?: return@put call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val obj = parseObject(body) ?: return@put call.fail(HttpStatusCode.BadRequest, "Invalid JSON")
                if (obj.optJSONArray("undo") == null || obj.optJSONArray("redo") == null) return@put call.fail(HttpStatusCode.BadRequest, "Missing 'undo' and 'redo'")
                if (repo.saveHistory(id, DesignRepository.fingerprint(snap.design), body)) call.respond(HttpStatusCode.NoContent)
                else call.fail(HttpStatusCode.PayloadTooLarge, "History too large to keep")
            }

            post("/designs/{id}/save") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                if (hub.snapshot(id) == null) return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                hub.flush(id) // write everything now instead of waiting for the short save delay
                call.json(HttpStatusCode.OK, JSONObject().put("revision", hub.snapshot(id)?.revision ?: 0).put("saved", true))
            }

            post("/designs/{id}/duplicate") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                hub.flush(id) // include edits that are not on disk yet
                val copy = repo.duplicate(id) ?: return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                call.json(HttpStatusCode.Created, snapshotJson(DesignCodec.serialize(copy), 0))
            }

            post("/designs/{id}/ops") {
                val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId) ?: return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                val body = call.boundedText() ?: return@post call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                if (hub.snapshot(id) == null) return@post call.fail(HttpStatusCode.NotFound, "Unknown design")
                val obj = parseObject(body) ?: return@post call.fail(HttpStatusCode.BadRequest, "Invalid JSON")
                val op = try { OpJson.fromJson(obj) } catch (e: OpException) { return@post call.fail(HttpStatusCode.BadRequest, e.message ?: "Invalid op") }
                when (val r = hub.apply(id, op, call.request.header("X-Client") ?: "rest")) {
                    is ApplyResult.Applied -> call.json(HttpStatusCode.OK, JSONObject().put("revision", r.revision))
                    is ApplyResult.Rejected -> call.fail(HttpStatusCode.UnprocessableEntity, r.reason)
                }
            }

            get("/settings") {
                val store = deps.settings ?: return@get call.fail(HttpStatusCode.NotFound, "Settings are not available")
                call.json(HttpStatusCode.OK, JSONObject(store.all() as Map<*, *>))
            }

            put("/settings") {
                val store = deps.settings ?: return@put call.fail(HttpStatusCode.NotFound, "Settings are not available")
                val body = call.boundedText() ?: return@put call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val obj = parseObject(body) ?: return@put call.fail(HttpStatusCode.BadRequest, "Invalid JSON")
                call.json(HttpStatusCode.OK, JSONObject(store.update(obj) as Map<*, *>))
            }

            get("/slots") {
                val store = deps.slots ?: return@get call.fail(HttpStatusCode.NotFound, "Toy slots are not available")
                call.json(HttpStatusCode.OK, slotsJson(store))
            }

            put("/slots/{n}") {
                val store = deps.slots ?: return@put call.fail(HttpStatusCode.NotFound, "Toy slots are not available")
                val slot = call.parameters["n"]?.toIntOrNull()?.takeIf { it in 1..SlotStore.COUNT }
                    ?: return@put call.fail(HttpStatusCode.BadRequest, "Slot must be 1..${SlotStore.COUNT}")
                val body = call.boundedText() ?: return@put call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val obj = parseObject(body) ?: return@put call.fail(HttpStatusCode.BadRequest, "Invalid JSON")
                if (!obj.has("designId")) return@put call.fail(HttpStatusCode.BadRequest, "Missing 'designId' (a design id, or null to empty the slot)")
                val id = if (obj.isNull("designId")) null else obj.opt("designId") as? String
                    ?: return@put call.fail(HttpStatusCode.BadRequest, "'designId' must be a string or null")
                if (id == null) store.clear(slot)
                else if (!DesignRepository.isValidId(id) || !store.assign(slot, id)) return@put call.fail(HttpStatusCode.NotFound, "Unknown design")
                call.json(HttpStatusCode.OK, slotsJson(store))
            }

            get("/pc/status") {
                val pc = deps.pc ?: return@get call.fail(HttpStatusCode.NotFound, "Not available")
                call.json(HttpStatusCode.OK, pcJson(pc.status()))
            }
            post("/pc/start") {
                val pc = deps.pc ?: return@post call.fail(HttpStatusCode.NotFound, "Not available")
                when (val r = pc.start()) {
                    is PcEditing.StartResult.Started -> call.json(HttpStatusCode.OK, pcJson(r.status))
                    PcEditing.StartResult.NoWifi -> call.fail(HttpStatusCode.Conflict, "No Wi-Fi found. The phone and the computer must be on the same Wi-Fi network (or the computer joins this phone's hotspot).")
                    is PcEditing.StartResult.Failed -> call.fail(HttpStatusCode.InternalServerError, r.message)
                }
            }
            post("/pc/stop") {
                val pc = deps.pc ?: return@post call.fail(HttpStatusCode.NotFound, "Not available")
                pc.stop()
                call.json(HttpStatusCode.OK, pcJson(pc.status()))
            }
            post("/pc/disconnect") {
                val pc = deps.pc ?: return@post call.fail(HttpStatusCode.NotFound, "Not available")
                pc.disconnectAll()
                call.json(HttpStatusCode.OK, pcJson(pc.status()))
            }

            post("/device/open-toy-manager") {
                val device = deps.device ?: return@post call.fail(HttpStatusCode.NotFound, "Not available")
                call.json(HttpStatusCode.OK, JSONObject().put("ok", device.openToyManager()))
            }

            get("/preview") {
                val preview = deps.preview ?: return@get call.fail(HttpStatusCode.NotFound, "Live preview is not available")
                call.json(HttpStatusCode.OK, previewJson(preview.status()))
            }

            put("/preview") {
                val preview = deps.preview ?: return@put call.fail(HttpStatusCode.NotFound, "Live preview is not available")
                val body = call.boundedText() ?: return@put call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val obj = parseObject(body) ?: return@put call.fail(HttpStatusCode.BadRequest, "Invalid JSON")
                val status = if (obj.optBoolean("enabled", false)) {
                    val id = (obj.opt("designId") as? String)?.takeIf(DesignRepository::isValidId)
                        ?: return@put call.fail(HttpStatusCode.BadRequest, "Missing 'designId'")
                    val frameId = if (obj.isNull("frameId")) null else obj.opt("frameId") as? String
                    val shown = if (preview.status().designId == id) preview.setFrame(frameId).let { s -> if (s.active) s else preview.start(id, frameId) }
                    else preview.start(id, frameId)
                    if (obj.has("playing")) preview.setPlaying(obj.optBoolean("playing", false)) else shown
                } else preview.stop()
                call.json(HttpStatusCode.OK, previewJson(status))
            }

            get("/designs/{id}/export") {
                val snap = call.parameters["id"]?.takeIf(DesignRepository::isValidId)?.let { hub.snapshot(it) }
                    ?: return@get call.fail(HttpStatusCode.NotFound, "Unknown design")
                call.response.header(HttpHeaders.ContentDisposition, ContentDisposition.Attachment.withParameter(
                    io.ktor.http.ContentDisposition.Parameters.FileName, "${safeFileName(snap.design.name)}.glyph.json").toString())
                call.json(HttpStatusCode.OK, DesignCodec.serialize(snap.design))
            }

            get("/export") {
                val wanted = call.request.queryParameters["ids"]?.split(',')?.filter { it.isNotBlank() }?.toSet()
                val all = JSONArray()
                for (s in repo.list()) {
                    if (wanted != null && s.id !in wanted) continue
                    hub.snapshot(s.id)?.let { all.put(DesignCodec.serialize(it.design)) }
                }
                call.response.header(HttpHeaders.ContentDisposition, ContentDisposition.Attachment.withParameter(
                    io.ktor.http.ContentDisposition.Parameters.FileName, "glyph-designs.glyphpack.json").toString())
                call.json(HttpStatusCode.OK, all)
            }

            post("/import") {
                val body = call.boundedText() ?: return@post call.fail(HttpStatusCode.PayloadTooLarge, "Body too large")
                val trimmed = body.trim()
                val docs: List<JSONObject> = try {
                    when {
                        trimmed.startsWith("[") -> JSONArray(trimmed).let { a -> List(a.length()) { a.optJSONObject(it) ?: throw JSONException("not an object") } }
                        trimmed.startsWith("{") -> listOf(JSONObject(trimmed))
                        else -> throw JSONException("not a design")
                    }
                } catch (_: JSONException) {
                    return@post call.fail(HttpStatusCode.BadRequest, "Not a design file")
                }
                if (docs.isEmpty()) return@post call.fail(HttpStatusCode.BadRequest, "The file contains no designs")
                // Validate everything first so a bad file adds nothing.
                val parsed = ArrayList<Design>()
                for ((i, doc) in docs.withIndex()) {
                    when (val r = DesignCodec.parse(doc)) {
                        is ParseResult.Ok -> parsed.add(r.design)
                        is ParseResult.Error -> return@post call.fail(HttpStatusCode.BadRequest, if (docs.size > 1) "Design ${i + 1}: ${r.message}" else r.message)
                    }
                }
                // Imports always get new ids, so they never overwrite an existing design.
                val created = parsed.map { repo.save(it.copy(id = deps.newId(), created = System.currentTimeMillis())) }
                call.json(HttpStatusCode.Created, JSONArray(created.map { summaryJson(repo.summaryOf(it)) }))
            }
        }

        webSocket("/ws/designs/{id}") {
            val id = call.parameters["id"]?.takeIf(DesignRepository::isValidId)
            if (id == null || hub.snapshot(id) == null) {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Unknown design"))
                return@webSocket
            }
            val clientId = call.request.queryParameters["client"]?.takeIf { it.isNotBlank() } ?: deps.newId()
            val outbox = Channel<String>(Channel.UNLIMITED)

            // Subscribe before taking the snapshot so no update can slip between them; the client ignores
            // updates whose revision is not newer than the snapshot's.
            val sub = hub.subscribe(id, object : SyncHub.Subscriber {
                override fun onUpdate(update: SyncHub.Update) {
                    if (update.origin == clientId) return // the sender gets an ack instead
                    outbox.trySend(
                        JSONObject().put("type", "update").put("revision", update.revision).put("origin", update.origin)
                            .put("op", OpJson.toJson(update.op)).toString(),
                    )
                }

                override fun onDeleted(designId: String) {
                    outbox.trySend(JSONObject().put("type", "deleted").toString())
                }

                override fun onSaved(designId: String, revision: Long) {
                    outbox.trySend(JSONObject().put("type", "saved").put("revision", revision).toString())
                }
            })
            deps.activity?.socketOpened()
            var writer: kotlinx.coroutines.Job? = null
            var signedOut: kotlinx.coroutines.Job? = null
            try {
                val snap = hub.snapshot(id)
                if (snap == null) {
                    close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Unknown design"))
                    return@webSocket
                }
                outbox.trySend(
                    JSONObject().put("type", "snapshot").put("revision", snap.revision).put("client", clientId)
                        .put("design", DesignCodec.serialize(snap.design)).toString(),
                )
                writer = launch { for (msg in outbox) send(Frame.Text(msg)) }
                // "Disconnect all computers" must also cut connections that are already open, not only new requests.
                signedOut = launch {
                    while (true) {
                        delay(1500)
                        if (!auth.stillAuthorized(call)) { close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Signed out")); break }
                    }
                }
                for (frame in incoming) {
                    if (frame !is Frame.Text) continue
                    deps.activity?.touch()
                    val msg = parseObject(frame.readText())
                    val seq = msg?.opt("seq")
                    fun reply(type: String, extra: JSONObject.() -> Unit) {
                        outbox.trySend(JSONObject().put("type", type).also { if (seq != null) it.put("seq", seq) }.apply(extra).toString())
                    }
                    if (msg?.opt("type") == "ping") { // the editor checks that the phone is still reachable
                        reply("pong") {}
                        continue
                    }
                    if (msg == null || msg.opt("type") != "op") {
                        reply("reject") { put("reason", "Expected {type:'op', op:{...}}") }
                        continue
                    }
                    val op = try { OpJson.fromJson(msg.optJSONObject("op") ?: throw OpException("Missing 'op'")) } catch (e: OpException) {
                        reply("reject") { put("reason", e.message ?: "Invalid op") }
                        continue
                    }
                    when (val r = hub.apply(id, op, clientId)) {
                        is ApplyResult.Applied -> reply("ack") { put("revision", r.revision) }
                        is ApplyResult.Rejected -> reply("reject") { put("reason", r.reason) }
                    }
                }
            } finally {
                writer?.cancel()
                signedOut?.cancel()
                deps.activity?.socketClosed()
                sub.close()
                outbox.close()
            }
        }

        get("/") { serveAsset(deps, "index.html") }
        get("/{path...}") {
            val path = call.parameters.getAll("path")?.joinToString("/") ?: ""
            serveAsset(deps, path)
        }
    }
}

private suspend fun io.ktor.server.routing.RoutingContext.serveAsset(deps: ServerDeps, path: String) {
    if (!Mime.isSafePath(path)) return call.fail(HttpStatusCode.NotFound, "Not found")
    val bytes = deps.assets.open(path)?.use { it.readBytes() } ?: return call.fail(HttpStatusCode.NotFound, "Not found")
    call.response.header(HttpHeaders.CacheControl, "no-cache")
    call.respondBytes(bytes, Mime.forPath(path))
}
