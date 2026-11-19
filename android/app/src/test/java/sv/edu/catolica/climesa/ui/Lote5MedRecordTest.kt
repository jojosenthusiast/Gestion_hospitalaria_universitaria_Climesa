package sv.edu.catolica.climesa.ui

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.ClinicalHistoryParser
import sv.edu.catolica.climesa.domain.ClinicalRecordLab

/** Lote 5 S15: the record's exams as master-detail joined to the consultation that ordered them. */
class Lote5MedRecordTest {
    private val history = ClinicalHistoryParser.parse(JSONObject("""
        {"patient":{"id":"p","record":"E-1","fullName":"Ana López"},"access":"relacion",
         "consultations":[{"id":"k1","state":"firmada","startedAt":"2026-11-10T15:00:00Z","signedAt":"2026-11-10T15:30:00Z","doctor":{"name":"Dra. Ruiz"},
           "reason":"Fiebre","plan":"Reposo","diagnoses":[{"code":"A09","description":"Diarrea","principal":true}],"prescriptions":[]}],
         "laboratory":[
           {"id":"o1","consultationId":"k1","state":"completado","priority":"rutina","createdAt":"2026-11-10T15:20:00Z","completedAt":"2026-11-11T16:00:00Z","reviewedAt":"2026-11-11T18:00:00Z",
            "items":[{"id":"i1","code":"HB","name":"Hemoglobina","result":{"value":6.1,"text":null,"mark":"critico_bajo"}},{"id":"i2","code":"GL","name":"Glucosa","result":{"value":150,"text":null,"mark":"alto"}}]},
           {"id":"o2","consultationId":null,"state":"pendiente","priority":"urgente","createdAt":"2026-11-15T15:00:00Z","completedAt":null,"reviewedAt":null,
            "items":[{"id":"i3","code":"PCR","name":"Proteína C reactiva","result":null}]}],
         "admissions":[]}
    """.trimIndent()))!!

    @Test fun masterRowsAreNewestFirstWithResultSummary() {
        val rows = ClinicalRecordLab.rows(history)
        assertEquals(listOf("o2", "o1"), rows.map { it.orderId })
        assertEquals("Hemoglobina, Glucosa", rows[1].exams)
        assertEquals("2026-11-10", rows[1].orderedOn)
        assertEquals("2 fuera de rango · 1 crítico", ClinicalRecordLab.summary(rows[1]))
        assertEquals("1 resultado pendiente", ClinicalRecordLab.summary(rows[0]))
    }

    @Test fun detailSaysWhyFromTheOriginConsultation() {
        val detail = ClinicalRecordLab.detail(history, "o1")
        assertNotNull(detail)
        assertEquals("Fiebre", detail!!.origin?.reason)
        assertEquals("Dra. Ruiz", detail.origin?.doctor)
        assertEquals("A09", detail.origin?.diagnoses?.single()?.code)
        assertEquals("2026-11-11", detail.completedOn)
        assertNull(ClinicalRecordLab.detail(history, "o2")?.origin)
        assertNull(ClinicalRecordLab.detail(history, "nope"))
    }
}
