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

    @Test fun endingTheSessionByHandOrByInactivityDropsEveryDraft() {
        val drafts = store()
        val session = SessionDrafts(drafts)
        drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "a"))
        drafts.save("u-2", "signos", JSONObject().put("fc", "80"))
        session.ended()
        assertNull(drafts.load("u-1", "consulta:c1"))
        assertNull(drafts.load("u-2", "signos"))
    }

    /** Review of #117: queued milestones and the prehospital queue are pending writes, not drafts: they survive sign-out. */
    @Test fun endingTheSessionKeepsThePendingWritesOfEachAccount() {
        val drafts = store()
        val session = SessionDrafts(drafts)
        drafts.save("par-1", "hitos:cola", JSONObject().put("items", org.json.JSONArray().put(JSONObject().put("type", "en_escena"))))
        drafts.save("par-1", "prehospital:cola", JSONObject().put("serviceId", "s1"))
        drafts.save("par-1", "prehospital:provisional", JSONObject().put("id", "p9"))
        drafts.save("par-1", "prehospital:formulario", JSONObject().put("reason", "texto"))
        assertTrue(session.hasPendingWrites("par-1"))
        session.ended()
        assertNull(drafts.load("par-1", "prehospital:formulario"))
        assertEquals("s1", drafts.load("par-1", "prehospital:cola")?.getString("serviceId"))
        assertEquals("p9", drafts.load("par-1", "prehospital:provisional")?.getString("id"))
        assertTrue(session.hasPendingWrites("par-1"))
        // Another account signing in on the device keeps them for their owner but never sees them.
        session.signedIn("enf-1")
        assertTrue(session.hasPendingWrites("par-1"))
        assertTrue(!session.hasPendingWrites("enf-1"))
        drafts.clear("par-1", "hitos:cola"); drafts.clear("par-1", "prehospital:cola")
        assertTrue(!session.hasPendingWrites("par-1"))
    }

    /** Re-review of #117: pending writes hold clinical data; they expire 24 h after their last write, on app start or any sign-in. */
    @Test fun pendingWritesExpireAfterOneDay() {
        val root = Files.createTempDirectory("borradores").toFile()
        val drafts = FileDraftStore(root)
        var clock = 0L
        val session = SessionDrafts(drafts) { clock }
        drafts.save("par-1", "hitos:cola", JSONObject().put("items", org.json.JSONArray().put(JSONObject().put("type", "en_escena"))))
        drafts.save("par-1", "prehospital:cola", JSONObject().put("serviceId", "s1"))
        drafts.save("par-2", "prehospital:cola", JSONObject().put("serviceId", "s2"))
        val files = root.walkTopDown().filter { it.isFile }.toList()
        files.forEach { it.setLastModified(1_000_000L) }
        files.first { it.parentFile?.name == "par-2" }.setLastModified(1_000_000L + 3_600_000L)
        clock = 1_000_000L + SessionDrafts.PENDING_WRITES_TTL_MS - 1
        session.appStarted()
        assertTrue(session.hasPendingWrites("par-1"))
        clock = 1_000_000L + SessionDrafts.PENDING_WRITES_TTL_MS + 1
        session.signedIn("enf-1")
        assertTrue(!session.hasPendingWrites("par-1"))
        assertNull(drafts.load("par-1", "prehospital:cola"))
        assertEquals("s2", drafts.load("par-2", "prehospital:cola")?.getString("serviceId"))
        clock += 3_600_000L
        session.appStarted()
        assertNull(drafts.load("par-2", "prehospital:cola"))
    }

    @Test fun signingInKeepsOnlyTheDraftsOfThatAccount() {
        val drafts = store()
        val session = SessionDrafts(drafts)
        drafts.save("u-1", "consulta:c1", JSONObject().put("plan", "de otra cuenta"))
        drafts.save("u-2", "consulta:c2", JSONObject().put("plan", "propia"))
        session.signedIn("u-2")
        assertNull(drafts.load("u-1", "consulta:c1"))
        assertEquals("propia", drafts.load("u-2", "consulta:c2")?.getString("plan"))
    }
}
