package com.yash.glyphstudio.pc

import com.yash.glyphstudio.server.Authenticator
import io.ktor.http.ContentType
import io.ktor.http.Cookie
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import org.json.JSONObject

/**
 * Access control for browsers on the Wi-Fi. A request is allowed only with the session cookie that pairing hands out.
 * Everything else is refused, except the pairing page itself (`GET /`) and the code check (`POST /pair`), which hold no
 * design data.
 */
class PcAuthenticator(private val pairing: Pairing, private val onActivity: () -> Unit = {}) : Authenticator {
    override fun isAuthorized(call: ApplicationCall): Boolean {
        val ok = pairing.isSessionValid(call.request.cookies[COOKIE])
        if (ok) onActivity()
        return ok
    }

    override fun stillAuthorized(call: ApplicationCall): Boolean = pairing.isSessionValid(call.request.cookies[COOKIE])

    override suspend fun respondUnauthorized(call: ApplicationCall) {
        val path = call.request.path()
        val isRoot = path == "/" || path.isEmpty()
        when {
            call.request.httpMethod == HttpMethod.Get && isRoot -> call.respondText(PairingPage.HTML, ContentType.Text.Html)
            call.request.httpMethod == HttpMethod.Post && path == "/pair" -> pair(call)
            else -> call.respondText(JSONObject().put("error", "Not paired").toString(), ContentType.Application.Json, HttpStatusCode.Unauthorized)
        }
    }

    private suspend fun pair(call: ApplicationCall) {
        val body = call.receiveText().take(200)
        val code = try { JSONObject(body).optString("code", "") } catch (_: Exception) { "" }
        when (val r = pairing.tryPair(code)) {
            is Pairing.Result.Paired -> {
                call.response.cookies.append(Cookie(COOKIE, r.token, path = "/", httpOnly = true, extensions = mapOf("SameSite" to "Strict")))
                call.respondText(JSONObject().put("ok", true).toString(), ContentType.Application.Json)
            }
            is Pairing.Result.Wrong -> call.respondText(
                JSONObject()
                    .put("error", if (r.codeChanged) "Too many wrong codes. The phone made a new code — read it again." else "Wrong code.")
                    .put("attemptsLeft", r.attemptsLeft).put("codeChanged", r.codeChanged).toString(),
                ContentType.Application.Json, HttpStatusCode.Unauthorized,
            )
        }
    }

    companion object { const val COOKIE = "gs_pc" }
}
