package com.yash.glyphstudio.design

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.math.BigDecimal

/**
 * Cross-language contract (task 3.4). The TypeScript editor writes shared/fixtures/ts; this test reads them,
 * rewrites them with the Kotlin codec and compares with shared/fixtures/kt (committed). The editor's
 * crosslang.test.ts then reads the kt files back. Regenerate: UPDATE_FIXTURES=1 gradlew :app:testDebugUnitTest
 */
class CrossLanguageTest {
    private val dir = File("../../shared/fixtures")

    private fun canon(v: Any?): String = when (v) {
        is JSONObject -> v.keys().asSequence().toList().sorted().joinToString(",", "{", "}") { "${JSONObject.quote(it)}:${canon(v.get(it))}" }
        is JSONArray -> (0 until v.length()).joinToString(",", "[", "]") { canon(v.get(it)) }
        is String -> JSONObject.quote(v)
        is Number -> BigDecimal(v.toString()).stripTrailingZeros().toPlainString()
        null, JSONObject.NULL -> "null"
        else -> v.toString()
    }

    @Test fun kotlinReadsTypeScriptFixturesAndRewritesThemIdentically() {
        val update = System.getenv("UPDATE_FIXTURES") == "1"
        val tsFiles = File(dir, "ts").listFiles { f -> f.name.endsWith(".glyph.json") }?.sortedBy { it.name }.orEmpty()
        assertTrue("no TypeScript fixtures found in ${dir.absolutePath}; run the editor tests with UPDATE_FIXTURES=1", tsFiles.isNotEmpty())

        for (tsFile in tsFiles) {
            val tsText = tsFile.readText()
            val parsed = DesignCodec.parse(tsText)
            assertTrue("${tsFile.name}: $parsed", parsed is ParseResult.Ok)
            val written = DesignCodec.serialize((parsed as ParseResult.Ok).design)

            val ktFile = File(dir, "kt/${tsFile.name}")
            if (update) {
                ktFile.parentFile.mkdirs()
                ktFile.writeText(written.toString(2) + "\n")
            }
            assertTrue("${ktFile.name} missing; run with UPDATE_FIXTURES=1", ktFile.exists())

            assertEquals("${tsFile.name}: Kotlin rewrite differs from the TypeScript original", canon(JSONObject(tsText)), canon(written))
            assertEquals("${tsFile.name}: committed Kotlin fixture is stale", canon(JSONObject(ktFile.readText())), canon(written))
        }
    }
}
