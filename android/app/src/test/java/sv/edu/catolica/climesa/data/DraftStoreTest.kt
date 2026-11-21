package sv.edu.catolica.climesa.data

import java.nio.file.Files
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftStoreTest {
    private fun store() = FileDraftStore(Files.createTempDirectory("borradores").toFile(), sv.edu.catolica.climesa.data.TestCipher)

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
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
        drafts.save("u-1", "k", JSONObject().put("a", 1))
        root.walkTopDown().filter { it.isFile }.forEach { it.writeText("{no es json") }
        assertNull(drafts.load("u-1", "k"))
        // S8: a file that does not decrypt is deleted, not kept around.
        assertTrue(root.walkTopDown().none { it.isFile })
    }

    /** S8: drafts are encrypted at rest; the clinical text never appears in the file, yet it reads back intact. */
    @Test fun aDraftIsEncryptedOnDiskAndReadsBack() {
        val root = Files.createTempDirectory("borradores").toFile()
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
        val value = JSONObject().put("plan", "Reposo absoluto y control de glucosa")
        assertTrue(drafts.save("u-1", "consulta:c1", value))
        val bytes = root.walkTopDown().single { it.isFile }.readBytes()
        val onDisk = String(bytes, Charsets.ISO_8859_1)
        assertTrue(!onDisk.contains("Reposo absoluto") && !onDisk.contains("\"plan\"") && !onDisk.contains(value.toString()))
        assertEquals(value.toString(), drafts.load("u-1", "consulta:c1").toString())
    }

    /** S8: a draft left in clear text by an older version is kept and sealed on first read, so pending queues survive the update. */
    @Test fun aLegacyPlaintextDraftIsMigratedToCiphertext() {
        val root = Files.createTempDirectory("borradores").toFile()
        val legacy = java.io.File(root, "u-1/hitos.json").apply { parentFile?.mkdirs(); writeText("""{"items":[{"hito":"salida"}]}""") }
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
        assertEquals("salida", drafts.load("u-1", "hitos")?.getJSONArray("items")?.getJSONObject(0)?.getString("hito"))
        assertTrue(legacy.exists())
        assertTrue(!String(legacy.readBytes(), Charsets.ISO_8859_1).contains("salida"))
        assertEquals("salida", drafts.load("u-1", "hitos")?.getJSONArray("items")?.getJSONObject(0)?.getString("hito"))
    }

    /** S10: every saved draft counts as activity, so typing a long note never trips the inactivity sign-out. */
    @Test fun savingADraftReportsActivity() {
        var writes = 0
        val drafts = FileDraftStore(Files.createTempDirectory("borradores").toFile(), sv.edu.catolica.climesa.data.TestCipher) { writes++ }
        drafts.save("u-1", "consulta", JSONObject().put("motivo", "dolor"))
        assertEquals(1, writes)
    }

    /** S8: a draft sealed with another key (or tampered) is deleted and reads as absent. */
    @Test fun aForeignKeyDraftIsDeleted() {
        val root = Files.createTempDirectory("borradores").toFile()
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
        val other = FileDraftStore(root, AesGcmCipher { javax.crypto.KeyGenerator.getInstance("AES").apply { init(256) }.generateKey() })
        other.save("u-1", "signos", JSONObject().put("fc", "90"))
        assertNull(drafts.load("u-1", "signos"))
        assertTrue(root.walkTopDown().none { it.isFile })
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
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
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

    /** Sweep U6 defect 2: the "results seen" marker is not clinical data; it never expires and still survives sign-out. */
    @Test fun theResultsSeenMarkerNeverExpiresAndSurvivesSignOut() {
        val root = Files.createTempDirectory("borradores").toFile()
        val drafts = FileDraftStore(root, sv.edu.catolica.climesa.data.TestCipher)
        var clock = 0L
        val session = SessionDrafts(drafts) { clock }
        ResultsSeen.mark(drafts, "pac-1", java.time.Instant.parse("2026-11-10T08:00:00Z"))
        root.walkTopDown().filter { it.isFile }.forEach { it.setLastModified(1_000_000L) }
        clock = 1_000_000L + 7 * SessionDrafts.PENDING_WRITES_TTL_MS
        session.appStarted()
        session.signedIn("pac-1")
        session.ended()
        session.signedIn("enf-1")
        assertEquals(java.time.Instant.parse("2026-11-10T08:00:00Z"), ResultsSeen.load(drafts, "pac-1"))
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

    /** Audit 2 D3: a Keystore that is momentarily unavailable never deletes a sealed draft; it reads again once the key is back. */
    @Test fun anUnavailableKeystoreKeepsTheDraft() {
        val root = Files.createTempDirectory("borradores").toFile()
        FileDraftStore(root, TestCipher).save("u-1", "signos", JSONObject().put("fc", "90"))
        val locked = object : PayloadCipher {
            override fun encrypt(plain: ByteArray): ByteArray = throw java.security.ProviderException("keystore")
            override fun decrypt(sealed: ByteArray): ByteArray = throw java.security.KeyStoreException("keystore")
        }
        assertNull(FileDraftStore(root, locked).load("u-1", "signos"))
        assertEquals("90", FileDraftStore(root, TestCipher).load("u-1", "signos")?.getString("fc"))
    }

    /** Audit 2 D3: a readable draft written in clear is returned and kept even when sealing it again fails. */
    @Test fun aLegacyClearDraftIsReturnedEvenIfItCannotBeSealed() {
        val root = Files.createTempDirectory("borradores").toFile()
        val file = java.io.File(java.io.File(root, "u-1"), "signos.json").apply { parentFile.mkdirs(); writeText(JSONObject().put("fc", "80").toString()) }
        val failing = object : PayloadCipher {
            override fun encrypt(plain: ByteArray): ByteArray = throw java.security.ProviderException("keystore")
            override fun decrypt(sealed: ByteArray): ByteArray = throw javax.crypto.AEADBadTagException("clear")
        }
        assertEquals("80", FileDraftStore(root, failing).load("u-1", "signos")?.getString("fc"))
        assertTrue(file.isFile)
    }
}
