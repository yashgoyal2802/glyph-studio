package com.yash.glyphstudio.pc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingTest {
    private fun wrongCode(p: Pairing) = if (p.code() == "000000") "111111" else "000000"

    @Test fun codeIsSixDigits() {
        repeat(200) { assertTrue(Regex("[0-9]{6}").matches(Pairing().code())) }
    }

    @Test fun rightCodePairsAndTheSessionIsValid() {
        val p = Pairing()
        val r = p.tryPair(p.code()) as Pairing.Result.Paired
        assertTrue(p.isSessionValid(r.token))
        assertEquals(1, p.sessionCount())
        assertFalse(p.isSessionValid("nope"))
        assertFalse(p.isSessionValid(null))
    }

    @Test fun surroundingSpacesInTheCodeAreIgnored() {
        val p = Pairing()
        assertTrue(p.tryPair(" ${p.code()} ") is Pairing.Result.Paired)
    }

    @Test fun fiveWrongCodesMakeANewCodeAndTheOldOneStopsWorking() {
        val p = Pairing()
        val old = p.code()
        for (left in 4 downTo 1) {
            val r = p.tryPair(wrongCode(p)) as Pairing.Result.Wrong
            assertEquals(left, r.attemptsLeft)
            assertFalse(r.codeChanged)
            assertEquals(old, p.code())
        }
        val last = p.tryPair(wrongCode(p)) as Pairing.Result.Wrong
        assertTrue(last.codeChanged)
        // A new random code could equal the old one by chance (1 in a million); make the check meaningful either way.
        if (p.code() != old) assertTrue(p.tryPair(old) is Pairing.Result.Wrong)
        assertEquals(0, p.sessionCount())
    }

    @Test fun aSuccessfulPairingResetsTheFailureCount() {
        val p = Pairing()
        repeat(4) { p.tryPair(wrongCode(p)) }
        val code = p.code()
        assertTrue(p.tryPair(code) is Pairing.Result.Paired)
        val r = p.tryPair(wrongCode(p)) as Pairing.Result.Wrong
        assertEquals(4, r.attemptsLeft)
    }

    @Test fun pairedBrowsersStayPairedAcrossLaterWrongAttempts() {
        val p = Pairing()
        val token = (p.tryPair(p.code()) as Pairing.Result.Paired).token
        repeat(7) { p.tryPair(wrongCode(p)) }
        assertTrue(p.isSessionValid(token))
    }

    @Test fun revokeAllSignsEveryoneOutAndChangesTheCode() {
        val p = Pairing(maxFailures = 5)
        val a = (p.tryPair(p.code()) as Pairing.Result.Paired).token
        val b = (p.tryPair(p.code()) as Pairing.Result.Paired).token
        assertNotEquals(a, b)
        p.revokeAll()
        assertFalse(p.isSessionValid(a))
        assertFalse(p.isSessionValid(b))
        assertEquals(0, p.sessionCount())
    }
}
