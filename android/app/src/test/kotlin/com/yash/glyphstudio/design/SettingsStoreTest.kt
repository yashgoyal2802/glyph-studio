package com.yash.glyphstudio.design

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SettingsStoreTest {
    @get:Rule val tmp = TemporaryFolder()
    private fun file() = File(tmp.root, "settings.json")

    @Test fun startsAllOff() {
        assertEquals(mapOf("firstRunDone" to false, "autoClose" to false, "trayHintDone" to false), SettingsStore(file()).all())
    }

    @Test fun savesAndSurvivesARestart() {
        SettingsStore(file()).update(JSONObject("""{"firstRunDone":true}"""))
        val again = SettingsStore(file())
        assertTrue(again.all().getValue("firstRunDone"))
        assertFalse(again.all().getValue("autoClose"))
    }

    @Test fun ignoresUnknownKeysAndNonBooleans() {
        val s = SettingsStore(file())
        s.update(JSONObject("""{"evil":true,"autoClose":"yes","firstRunDone":1}"""))
        assertEquals(mapOf("firstRunDone" to false, "autoClose" to false, "trayHintDone" to false), s.all())
        assertFalse(file().exists())
    }

    @Test fun anUnreadableFileMeansDefaults() {
        file().writeText("not json")
        assertEquals(false, SettingsStore(file()).all().getValue("firstRunDone"))
    }
}
