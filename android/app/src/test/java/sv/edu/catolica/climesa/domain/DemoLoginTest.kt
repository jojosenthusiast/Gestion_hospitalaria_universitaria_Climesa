package sv.edu.catolica.climesa.domain

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Placeholder accounts only; the real ones live in the git-ignored demo-credenciales.json.
class DemoLoginTest {
    private val json = """[{"rol":"MED","correo":"med@example.test","contrasena":"Placeholder-MED-1"},{"rol":"PAC","correo":"pac@example.test","contrasena":"Placeholder-PAC-1"}]"""

    @Test fun flagOffHidesEveryAccount() {
        assertTrue(DemoLogin.accounts(false, json).isEmpty())
    }

    @Test fun flagOnReadsAccountsInFileOrder() {
        assertEquals(
            listOf(DemoAccount("MED", "med@example.test", "Placeholder-MED-1"), DemoAccount("PAC", "pac@example.test", "Placeholder-PAC-1")),
            DemoLogin.accounts(true, json),
        )
    }

    @Test fun rolesThatDoNotUseAndroidAreDropped() {
        val webOnly = listOf("ADM", "DPD", "JOP", "LAB").joinToString(",") { """{"rol":"$it","correo":"${it.lowercase()}@example.test","contrasena":"x"}""" }
        assertTrue(DemoLogin.accounts(true, "[$webOnly]").isEmpty())
    }

    @Test fun androidRolesAreKeptInFileOrder() {
        val file = listOf("ADM", "PAC", "JOP", "REC", "AST", "LAB", "ENF", "MED", "DPD", "PAR")
            .joinToString(",", "[", "]") { """{"rol":"$it","correo":"${it.lowercase()}@example.test","contrasena":"x"}""" }
        assertEquals(listOf("PAC", "REC", "AST", "ENF", "MED", "PAR"), DemoLogin.accounts(true, file).map { it.role })
    }

    @Test fun buildFiltersTheSameRolesAsTheApp() {
        // build.gradle.kts keeps only these roles in BuildConfig.DEMO_CREDENTIALS; it cannot import AndroidSections.
        val line = File("build.gradle.kts").readLines().single { it.startsWith("val climesaDemoRoles") }
        assertEquals(AndroidSections.roles, Regex("\"([A-Z]+)\"").findAll(line).map { it.groupValues[1] }.toList())
    }

    @Test fun missingFileOrInvalidJsonGivesNoAccounts() {
        assertTrue(DemoLogin.accounts(true, "").isEmpty())
        assertTrue(DemoLogin.accounts(true, "no es json").isEmpty())
        assertTrue(DemoLogin.accounts(true, "{\"rol\":\"MED\"}").isEmpty())
    }

    @Test fun incompleteEntriesAreDropped() {
        val accounts = DemoLogin.accounts(true, """[{"rol":"MED"},{"rol":"PAR","correo":"par@example.test","contrasena":"x"}]""")
        assertEquals(listOf(DemoAccount("PAR", "par@example.test", "x")), accounts)
    }
}
