package sv.edu.catolica.climesa.data

import java.nio.file.Files
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftStoreTest {
    private fun store() = FileDraftStore(Files.createTempDirectory("borradores").toFile())

    @Test fun aSavedDraftComesBackForTheSameUserAndKey() {
        val drafts = store()
        assertTrue(drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "Reposo")))
        assertEquals("Reposo", drafts.load("u-1", "consulta:c1")?.getString("plan"))
    }

    @Test fun anotherUserNeverReadsTheDraft() {
        val drafts = store()
        drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "Reposo"))
        assertNull(drafts.load("u-2", "consulta:c1"))
        assertNull(drafts.load("../u-1", "consulta:c1"))
    }

    @Test fun clearRemovesOneDraftAndClearAllRemovesEveryUser() {
        val drafts = store()
        drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "a"))
        drafts.save("u-1", "signos", JSONObject().put("fc", "80"))
        drafts.save("u-2", "consulta:c2", JSONObject().put("plan", "b"))
        drafts.clear("u-1", "consulta:c1")
        assertNull(drafts.load("u-1", "consulta:c1"))
        assertEquals("80", drafts.load("u-1", "signos")?.getString("fc"))
        drafts.clearAll()
        assertNull(drafts.load("u-1", "signos"))
        assertNull(drafts.load("u-2", "consulta:c2"))
    }

    @Test fun bindingAUserDropsTheDraftsOfOtherAccounts() {
        val drafts = store()
        drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "a"))
        drafts.save("u-2", "consulta:c2", JSONObject().put("plan", "b"))
        drafts.retainOnly("u-2")
        assertNull(drafts.load("u-1", "consulta:c1"))
        assertEquals("b", drafts.load("u-2", "consulta:c2")?.getString("plan"))
    }

    @Test fun aCorruptFileReadsAsNoDraft() {
        val root = Files.createTempDirectory("borradores").toFile()
        val drafts = FileDraftStore(root)
        drafts.save("u-1", "k", JSONObject().put("a", 1))
        root.walkTopDown().filter { it.isFile }.forEach { it.writeText("{no es json") }
        assertNull(drafts.load("u-1", "k"))
    }
}
