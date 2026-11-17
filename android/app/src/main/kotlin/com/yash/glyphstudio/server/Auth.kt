package com.yash.glyphstudio.server

import io.ktor.http.ContentType
import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.header
import io.ktor.server.request.path
import io.ktor.server.response.header
import io.ktor.server.response.respondText
import java.security.MessageDigest
import java.security.SecureRandom

/** Decides whether a request may use the server. The in-app WebView and the paired PC browser use different policies. */
interface Authenticator {
    fun isAuthorized(call: ApplicationCall): Boolean

    /** Whether a call that was allowed earlier (a live WebSocket) still is, e.g. not signed out since. Must not count as activity. */
    fun stillAuthorized(call: ApplicationCall): Boolean = isAuthorized(call)

    /** Answers a request that [isAuthorized] refused. The default is a plain 401; the PC server adds its pairing page. */
    suspend fun respondUnauthorized(call: ApplicationCall) {
        call.response.header(HttpHeaders.WWWAuthenticate, "Bearer")
        call.respondText("{\"error\":\"Unauthorized\"}", ContentType.Application.Json, HttpStatusCode.Unauthorized)
    }
}

object Tokens {
    private val random = SecureRandom()

    /** 256 random bits as hex. */
    fun newToken(): String = ByteArray(32).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }

    /** Constant-time comparison so a wrong token leaks nothing through timing. */
    fun matches(candidate: String?, expected: String): Boolean =
        candidate != null && MessageDigest.isEqual(candidate.toByteArray(), expected.toByteArray())
}

/**
 * Per-launch secret for the in-app WebView (design.md decision 2). The WebView opens `/?token=...` once; the server then
 * sets an HttpOnly cookie, so assets, API calls and the WebSocket are authorised without the token appearing again.
 * Scripts and other apps can also send `Authorization: Bearer <token>`.
 */
class TokenAuthenticator(private val token: String) : Authenticator {
    override fun isAuthorized(call: ApplicationCall): Boolean {
        val bearer = call.request.header(HttpHeaders.Authorization)?.takeIf { it.startsWith("Bearer ") }?.removePrefix("Bearer ")
        if (Tokens.matches(bearer, token)) return true
        if (Tokens.matches(call.request.cookies[COOKIE], token)) return true
        // The token in the URL is accepted for the entry page only, never for API calls.
        val path = call.request.path()
        val isEntryPage = path == "/" || path.isEmpty() // some engines report the root path as ""
        if (isEntryPage && Tokens.matches(call.request.queryParameters["token"], token)) {
            call.response.cookies.append(Cookie(COOKIE, token, path = "/", httpOnly = true, extensions = mapOf("SameSite" to "Strict")))
            return true
        }
        return false
    }

    companion object { const val COOKIE = "gs_session" }
}
