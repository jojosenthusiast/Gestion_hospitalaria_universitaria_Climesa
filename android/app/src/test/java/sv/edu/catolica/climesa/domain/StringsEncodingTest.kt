package sv.edu.catolica.climesa.domain

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards against mojibake (UTF-8 read as Latin-1 and saved again, e.g. "dÃ­a" instead of "día") in the Spanish UI texts.
 * The patterns are written as escapes so this file never contains the broken sequences itself.
 */
class StringsEncodingTest {
    private val mojibake = Regex("[ÃÂ][\u0080-¿]|â€|â\u0082|�")

    private fun mainDir(): File {
        val candidates = listOf(File("src/main"), File("app/src/main"), File("android/app/src/main"))
        return candidates.first { it.isDirectory }
    }

    private fun offenders(files: Sequence<File>) = files.flatMap { file ->
        file.readLines(Charsets.UTF_8).withIndex().filter { mojibake.containsMatchIn(it.value) }.map { "${file.name}:${it.index + 1}: ${it.value.trim().take(80)}" }
    }.toList()

    @Test fun losTextosEnEspanolNoTienenMojibake() {
        val resources = File(mainDir(), "res").walkTopDown().filter { it.isFile && it.name.startsWith("strings") && it.extension == "xml" }
        val found = offenders(resources)
        assertTrue("Mojibake en strings: $found", found.isEmpty())
    }

    @Test fun elCodigoKotlinNoTieneMojibake() {
        val sources = File(mainDir(), "java").walkTopDown().filter { it.isFile && it.extension == "kt" }
        val found = offenders(sources)
        assertTrue("Mojibake en Kotlin: $found", found.isEmpty())
    }

    @Test fun elDetectorReconoceUnTextoRoto() {
        val broken = "d" + "Ã­" + "a"
        assertTrue(mojibake.containsMatchIn(broken))
        assertTrue(!mojibake.containsMatchIn("día, niño, Hospitalización"))
    }

    @Test fun losStringsExistenYTienenAcentos() {
        val strings = File(mainDir(), "res/values/strings.xml").readText(Charsets.UTF_8)
        assertTrue(strings.contains("Cerrar sesión"))
    }
}
