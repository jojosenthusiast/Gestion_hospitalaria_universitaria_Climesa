package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Placeholder accounts only; the real ones live in the git-ignored demo-credenciales.json.
class DemoLoginTest {
    private val json = """[{"rol":"ADM","correo":"adm@example.test","contrasena":"Placeholder-ADM-1"},{"rol":"PAC","correo":"pac@example.test","contrasena":"Placeholder-PAC-1"}]"""

    @Test fun flagOffHidesEveryAccount() {
        assertTrue(DemoLogin.accounts(false, json).isEmpty())
    }

    @Test fun flagOnReadsAccountsInFileOrder() {
        assertEquals(
            listOf(DemoAccount("ADM", "adm@example.test", "Placeholder-ADM-1"), DemoAccount("PAC", "pac@example.test", "Placeholder-PAC-1")),
            DemoLogin.accounts(true, json),
        )
    }

    @Test fun missingFileOrInvalidJsonGivesNoAccounts() {
        assertTrue(DemoLogin.accounts(true, "").isEmpty())
        assertTrue(DemoLogin.accounts(true, "no es json").isEmpty())
        assertTrue(DemoLogin.accounts(true, "{\"rol\":\"ADM\"}").isEmpty())
    }

    @Test fun incompleteEntriesAreDropped() {
        val accounts = DemoLogin.accounts(true, """[{"rol":"ADM"},{"rol":"LAB","correo":"lab@example.test","contrasena":"x"}]""")
        assertEquals(listOf(DemoAccount("LAB", "lab@example.test", "x")), accounts)
    }
}
