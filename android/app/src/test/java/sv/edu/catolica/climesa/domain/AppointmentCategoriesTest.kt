package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Appointments born from a request by reason carry its categories; parsing is defensive for older servers. */
class AppointmentCategoriesTest {
    private val heart = JSONObject().put("code", "corazon").put("name", "Corazón y presión").put("icon", "corazon")
    private val gut = JSONObject().put("code", "digestivo").put("name", "Estómago e intestinos").put("icon", "digestivo")
    private val expected = listOf(CategoryRef("corazon", "Corazón y presión", "corazon"), CategoryRef("digestivo", "Estómago e intestinos", "digestivo"))

    private fun appointment(categories: Any?) = JSONObject().put("id", "c1").put("patientName", "Ana Ficticia").put("doctorName", "Dra. Uno")
        .put("start", "2026-11-17T15:00:00Z").put("end", "2026-11-17T15:20:00Z").put("state", "confirmada").put("version", 1)
        .apply { if (categories != null) put("categories", categories) }

    @Test fun receptionPatientAndDoctorRowsReadTheCategories() {
        val row = appointment(JSONArray().put(heart).put(gut))
        assertEquals(expected, ReceptionScheduling.appointments(JSONArray().put(row)).single().categories)
        assertEquals(expected, PatientAppointmentRules.parse(JSONArray().put(row)).single().categories)
        val agenda = JSONObject().put("appointmentId", "c1").put("patientId", "p1").put("patientName", "Ana Ficticia").put("start", "2026-11-17T15:00:00Z")
            .put("end", "2026-11-17T15:20:00Z").put("appointmentState", "confirmada").put("version", 1).put("categories", JSONArray().put(heart).put(gut))
        assertEquals(expected, ConsultationResume.parseAgenda(JSONArray().put(agenda)).single().categories)
    }

    @Test fun missingNullOrMalformedCategoriesGiveNone() {
        for (value in listOf(null, JSONObject.NULL, JSONArray(), "corazon", JSONObject().put("code", "x"))) {
            assertEquals(emptyList<CategoryRef>(), ReceptionScheduling.appointments(JSONArray().put(appointment(value))).single().categories)
            assertEquals(emptyList<CategoryRef>(), PatientAppointmentRules.parse(JSONArray().put(appointment(value))).single().categories)
        }
        // An entry without a code is skipped; one without a name falls back to its code.
        val partial = appointment(JSONArray().put(JSONObject().put("name", "Sin código")).put(JSONObject().put("code", "ojos").put("icon", "ojo")))
        assertEquals(listOf(CategoryRef("ojos", "ojos", "ojo")), ReceptionScheduling.appointments(JSONArray().put(partial)).single().categories)
    }

    @Test fun toneFollowsTheWebPaletteAndUnknownIconsAreSlate() {
        assertEquals(CategoryTone.RED, CategoryRequestRules.tone("corazon"))
        assertEquals(CategoryTone.GREEN, CategoryRequestRules.tone("digestivo"))
        assertEquals(CategoryTone.BLUE, CategoryRequestRules.tone("ojo"))
        assertEquals(CategoryTone.SLATE, CategoryRequestRules.tone("desconocido"))
    }
}
