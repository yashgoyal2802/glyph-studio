package com.yash.glyphstudio.pc

import com.yash.glyphstudio.server.Tokens
import java.security.SecureRandom

/**
 * The 6-digit pairing code and the browsers that have used it. A browser that enters the right code receives a session
 * token (kept in a cookie); every request without a valid token is refused. After [maxFailures] wrong attempts in a row
 * the code is replaced, so guessing it is not practical. Pure logic, no network, so it is fully unit-tested.
 */
class Pairing(private val random: SecureRandom = SecureRandom(), private val maxFailures: Int = 5) {
    sealed interface Result {
        data class Paired(val token: String) : Result

        /** [codeChanged] is true when this attempt used up the allowance and a new code was made. */
        data class Wrong(val attemptsLeft: Int, val codeChanged: Boolean) : Result
    }

    private var current = newCode()
    private var failures = 0
    private val sessions = ArrayList<String>()

    @Synchronized fun code(): String = current

    @Synchronized fun tryPair(candidate: String): Result {
        if (Tokens.matches(candidate.trim(), current)) {
            failures = 0
            val token = Tokens.newToken()
            sessions.add(token)
            return Result.Paired(token)
        }
        failures++
        if (failures >= maxFailures) {
            current = newCode()
            failures = 0
            return Result.Wrong(attemptsLeft = maxFailures, codeChanged = true)
        }
        return Result.Wrong(attemptsLeft = maxFailures - failures, codeChanged = false)
    }

    @Synchronized fun isSessionValid(token: String?): Boolean = sessions.any { Tokens.matches(token, it) }

    @Synchronized fun sessionCount(): Int = sessions.size

    /** Signs every browser out. The code is also replaced, so an old screenshot of it is useless. */
    @Synchronized fun revokeAll() {
        sessions.clear()
        current = newCode()
        failures = 0
    }

    private fun newCode(): String = "%06d".format(random.nextInt(1_000_000))
}
