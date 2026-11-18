package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** D4 and D6: external result without an order (body and validation like the API) and permission gates (rule 8). */
class ExternalRecordRulesTest {
    private val hb = ExternalExam("e1", "HB", "Hemoglobina", "g/dL", numeric = true)
    private val hiv = ExternalExam("e2", "VIH", "Prueba de VIH", null, numeric = false)
    private val pdf = LabAttachment("informe.pdf", "application/pdf", 2048, "a".repeat(64), uri = "content://doc/1")

    private fun error(place: String = "Laboratorio Ejemplo", exams: List<ExternalExam> = listOf(hb), values: Map<String, String> = mapOf("e1" to "12,5"), file: LabAttachment? = pdf, note: String = "") =
        ExternalRecordRules.error(place, exams, values, file, note)

    @Test fun pathIsThePatientEndpoint() = assertEquals("/laboratorio/pacientes/p1/resultado-externo", ExternalRecordRules.path("p1"))

    @Test fun recordingNeedsLaboratorioOrdenarNotARole() {
        assertTrue(ExternalRecordRules.canRecord(listOf("expediente.ver", "laboratorio.ordenar")))
        assertFalse(ExternalRecordRules.canRecord(listOf("expediente.ver", "laboratorio.revisar")))
    }

    @Test fun vitalsCaptureNeedsSignosRegistrarNotARole() {
        assertTrue(VitalsAccess.canRecord(listOf("signos.registrar")))
        assertFalse(VitalsAccess.canRecord(listOf("expediente.ver")))
        assertFalse(VitalsAccess.canRecord(emptyList()))
    }

    @Test fun aCompleteFormHasNoError() = assertNull(error())

    @Test fun placeNeedsThreeToTwoHundredCharactersAfterTrimming() {
        assertEquals("Indica dónde se hizo el examen (al menos 3 caracteres).", error(place = "  ab  "))
        assertEquals("El lugar no puede pasar de 200 caracteres.", error(place = "x".repeat(201)))
        assertNull(error(place = "x".repeat(200)))
    }

    @Test fun examsGoOneByOneBetweenOneAndFifty() {
        assertEquals("Agrega al menos un examen.", error(exams = emptyList(), values = emptyMap()))
        assertEquals("Cada examen va una sola vez.", error(exams = listOf(hb, hb)))
        val many = (1..51).map { ExternalExam("x$it", "C$it", "Examen $it", null, numeric = false) }
        assertEquals("Registra como máximo 50 exámenes.", error(exams = many, values = many.associate { it.id to "ok" }))
    }

    @Test fun everyExamNeedsItsValueANumberWhenNumeric() {
        assertEquals("Falta el valor de 1 examen(es).", error(exams = listOf(hb, hiv)))
        assertEquals("El valor de Hemoglobina debe ser un número.", error(values = mapOf("e1" to "alto")))
        assertEquals("El valor de Hemoglobina debe ser un número.", error(values = mapOf("e1" to "NaN")))
        assertEquals("El valor de Prueba de VIH no puede pasar de 5000 caracteres.", error(exams = listOf(hiv), values = mapOf("e2" to "x".repeat(5001))))
    }

    @Test fun noteAndFileFollowTheApiBounds() {
        assertEquals("La nota no puede pasar de 1000 caracteres.", error(note = "x".repeat(1001)))
        assertEquals("Adjunta la foto o el PDF del informe externo.", error(file = null))
        assertEquals("El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP).", error(file = pdf.copy(mimeType = "text/plain")))
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", error(file = pdf.copy(sizeBytes = 10L * 1024 * 1024 + 1)))
    }

    @Test fun bodySendsValueForNumbersTextOtherwiseAndTrims() {
        val body = ExternalRecordRules.body("  Lab Ejemplo ", pdf, listOf(hb, hiv), mapOf("e1" to "12,5", "e2" to " Negativo "), "  ")
        assertEquals("Lab Ejemplo", body.getString("place"))
        assertFalse(body.has("note"))
        val file = body.getJSONObject("attachment")
        assertEquals("informe.pdf", file.getString("fileName")); assertEquals("application/pdf", file.getString("mimeType")); assertEquals(2048L, file.getLong("sizeBytes"))
        assertFalse("the uri never leaves the phone", file.has("uri"))
        val results = body.getJSONArray("results")
        assertEquals(12.5, results.getJSONObject(0).getDouble("value"), 0.0)
        assertFalse(results.getJSONObject(0).has("text"))
        assertEquals("Negativo", results.getJSONObject(1).getString("text"))
        assertFalse(results.getJSONObject(1).has("value"))
        assertEquals(setOf("place", "attachment", "results"), body.keys().asSequence().toSet())
    }

    @Test fun catalogLeavesPanelsOutAndKnowsTextExams() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "p").put("code", "BH").put("name", "Biometría").put("isPanel", true).put("unit", JSONObject.NULL).put("resultType", "numerico"))
            .put(JSONObject().put("id", "e2").put("code", "VIH").put("name", "Prueba de VIH").put("isPanel", false).put("unit", JSONObject.NULL).put("resultType", "texto"))
            .put(JSONObject().put("id", "e1").put("code", "HB").put("name", "Hemoglobina").put("isPanel", false).put("unit", "g/dL").put("resultType", "numerico"))
        assertEquals(listOf(hb, hiv), ExternalRecordRules.parseCatalog(rows))
    }
}
