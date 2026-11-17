package com.yash.glyphstudio.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class ShareFilesTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun safeNameKeepsGoodNamesAndCleansBadOnes() {
        assertEquals("Pacman.glyph.json", ShareFiles.safeName("Pacman.glyph.json"))
        assertEquals("My design 1.glyph.json", ShareFiles.safeName("My design 1.glyph.json"))
        assertEquals("a_b_c.glyph.json", ShareFiles.safeName("a/b\\c.glyph.json"))
        assertEquals("_.._evil.json", ShareFiles.safeName("../../evil.json"))
        assertTrue(ShareFiles.safeName("....hidden").first() != '.')
        assertEquals("design.glyph.json", ShareFiles.safeName(""))
        assertEquals("design.glyph.json", ShareFiles.safeName("   "))
        assertEquals(80, ShareFiles.safeName("x".repeat(500)).length)
        assertEquals("caf_.json", ShareFiles.safeName("café.json"))
    }

    @Test fun resolveFindsExistingFilesInsideTheFolder() {
        val dir = tmp.newFolder("shared")
        File(dir, "a.glyph.json").writeText("{}")
        assertNotNull(ShareFiles.resolve(dir, "a.glyph.json"))
        assertNull(ShareFiles.resolve(dir, "missing.json"))
    }

    @Test fun resolveRefusesAnyAttemptToLeaveTheFolder() {
        val dir = tmp.newFolder("shared")
        File(tmp.root, "secret.txt").writeText("private")
        for (bad in listOf("../secret.txt", "..", ".", "a/../../secret.txt", "..\\secret.txt", "sub/x", "", null, "a\u0000b")) {
            assertNull("must refuse '$bad'", ShareFiles.resolve(dir, bad))
        }
    }

    @Test fun resolveRefusesFoldersAndLinksOutside() {
        val dir = tmp.newFolder("shared")
        File(dir, "folder").mkdir()
        assertNull(ShareFiles.resolve(dir, "folder")) // not a file
    }
}
