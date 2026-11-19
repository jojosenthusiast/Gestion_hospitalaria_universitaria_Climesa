package sv.edu.catolica.climesa.ui.icons

import androidx.compose.ui.graphics.vector.VectorPath
import androidx.compose.ui.graphics.vector.addPathNodes
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The generated set must carry every web icon and glyph, and every path must parse. */
class ClimesaIconsTest {
    /** Unit tests run from `android/app`; the web source sits two folders up. */
    private fun web(path: String) = File("../../web/src/components/$path").readText()

    private fun union(source: String, type: String): List<String> {
        val start = source.indexOf("export type $type =")
        val end = source.indexOf(";", start)
        return Regex("'(\\w+)'").findAll(source.substring(start, end)).map { it.groupValues[1] }.toList()
    }

    @Test fun everyWebIconIsGenerated() {
        val names = union(web("ui.tsx"), "IconName")
        assertEquals(46, names.size)
        val missing = names.filterNot { it in ClimesaIcons.all }
        assertTrue("missing web icons: $missing", missing.isEmpty())
    }

    @Test fun everyIdentityGlyphIsGenerated() {
        val glyphs = union(web("identity.tsx"), "IdentityIcon")
        assertEquals(21, glyphs.size)
        val missing = glyphs.filterNot { it in ClimesaIcons.all || "glyph:$it" in ClimesaIcons.all }
        assertTrue("missing identity glyphs: $missing", missing.isEmpty())
    }

    @Test fun everyPathParsesAndIsAStrokedOutline() {
        ClimesaIcons.pathData.forEach { (name, paths) ->
            paths.forEach { d -> assertTrue("$name does not parse: $d", addPathNodes(d).isNotEmpty()) }
            val vector = ClimesaIcons.all.getValue(name)
            assertEquals(24f, vector.viewportWidth)
            val strokes = (0 until vector.root.size).map { vector.root[it] as VectorPath }
            assertEquals(paths.size, strokes.size)
            assertTrue(strokes.all { it.fill == null && it.strokeLineWidth == 1.7f })
        }
    }

    @Test fun identityGlyphsThatDrawDifferentlyKeepTheirOwnEntry() {
        assertTrue("glyph:clipboard" in ClimesaIcons.all)
        assertTrue("glyph:calendar" in ClimesaIcons.all)
        assertTrue(ClimesaIcons.pathData.getValue("glyph:clipboard") != ClimesaIcons.pathData.getValue("clipboard"))
    }
}
