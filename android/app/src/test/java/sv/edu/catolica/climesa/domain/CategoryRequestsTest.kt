package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fase 2, flow A (S8): the patient picks a reason, not a doctor; reception assigns doctor and time. */
class CategoryRequestsTest {
    private val categories = CategoryRequestRules.categories(JSONArray()
        .put(JSONObject().put("code", "consulta_general").put("name", "Consulta general").put("description", "Malestar o control").put("icon", "general").put("specialties", JSONArray().put("Medicina general")).put("keywords", "fiebre gripe"))
        .put(JSONObject().put("code", "piel").put("name", "Piel").put("description", "Manchas o granos").put("icon", "piel").put("specialties", JSONArray().put("Dermatología")).put("keywords", "dermatologo acne"))
        .put(JSONObject().put("code", "salud_mental").put("name", "Salud mental").put("description", "Ansiedad o estrés").put("icon", "mente").put("specialties", JSONArray().put("Psiquiatría")).put("keywords", "ansiedad")))

    private fun request(franja: String = "tarde", preferred: String? = null) = CategoryRequestRules.requests(JSONArray().put(JSONObject()
        .put("id", "s1").put("patientName", "Ana Ficticia").put("record", "EXP-1").put("categories", JSONArray().put(JSONObject().put("code", "piel").put("name", "Piel").put("icon", "piel")))
        .put("specialties", JSONArray().put("Dermatología")).put("franja", franja).put("note", "Mancha").put("preferredDoctorId", preferred ?: JSONObject.NULL)
        .put("preferredDoctorName", JSONObject.NULL).put("state", "pendiente").put("rejectionReason", JSONObject.NULL).put("appointment", JSONObject.NULL)
        .put("createdAt", "2026-11-16T14:00:00Z").put("version", 1).put("allowedActions", JSONArray().put("asignar").put("rechazar")))).single()

    @Test fun searchIgnoresAccentsAndUsesKeywordsAndSpecialties() {
        assertEquals(listOf("piel"), CategoryRequestRules.filter(categories, "ACNÉ").map { it.code })
        assertEquals(listOf("salud_mental"), CategoryRequestRules.filter(categories, "psiquiatria").map { it.code })
        assertEquals(listOf("piel", "salud_mental"), CategoryRequestRules.filter(categories, "ansiedad", picked = listOf("piel")).map { it.code })
        assertEquals(3, CategoryRequestRules.filter(categories, "").size)
    }

    @Test fun oneToThreeCategories() {
        var picked = listOf<String>()
        for (code in listOf("a", "b", "c", "d")) picked = CategoryRequestRules.toggle(picked, code)
        assertEquals(listOf("a", "b", "c"), picked)
        assertEquals(listOf("a", "c"), CategoryRequestRules.toggle(picked, "b"))
        assertFalse(CategoryRequestRules.canSend(emptyList(), ""))
        assertFalse(CategoryRequestRules.canSend(listOf("a"), "x".repeat(281)))
        assertTrue(CategoryRequestRules.canSend(listOf("a"), "x".repeat(280)))
    }

    @Test fun parsesTheInboxRowWithServerActions() {
        val r = request()
        assertEquals(RequestFranja.AFTERNOON, r.franja)
        assertEquals("Piel", r.categoryNames)
        assertTrue(r.pending && r.allows(CategoryRequestRules.ASSIGN) && !r.allows(CategoryRequestRules.CANCEL))
        assertNull(r.appointment)
    }

    @Test fun prefillsTheSuggestedDoctorAndTheFirstFreeSlotOfTheRequestedTimeOfDay() {
        val doctors = listOf(
            SchedulingDoctor("d1", "Médica General", "Medicina general", true, null),
            SchedulingDoctor("d2", "Doctor Sin Turno", "Dermatología", false, "Sin turno"),
            SchedulingDoctor("d3", "Doctora Dermis", "Dermatología", true, null),
        )
        assertEquals("d3", CategoryRequestRules.suggestedDoctor(request(), doctors)?.id)
        assertEquals("d1", CategoryRequestRules.suggestedDoctor(request(preferred = "d1"), doctors)?.id)
        assertEquals(listOf("d2", "d3", "d1"), CategoryRequestRules.orderDoctors(request(), doctors).map { it.id })
        // 09:00, 13:00 (ocupada) y 13:20 hora de El Salvador (UTC-6).
        val slots = listOf(DaySlot("2026-11-20T15:00:00Z", "2026-11-20T15:20:00Z", SlotStatus.FREE, null), DaySlot("2026-11-20T19:00:00Z", "2026-11-20T19:20:00Z", SlotStatus.BUSY, null), DaySlot("2026-11-20T19:20:00Z", "2026-11-20T19:40:00Z", SlotStatus.FREE, null))
        assertEquals("2026-11-20T19:20:00Z", CategoryRequestRules.firstFreeSlot(slots, RequestFranja.AFTERNOON, wholeDay = false)?.start)
        assertEquals("2026-11-20T15:00:00Z", CategoryRequestRules.firstFreeSlot(slots, RequestFranja.AFTERNOON, wholeDay = true)?.start)
        assertEquals(2, CategoryRequestRules.slotsFor(slots, RequestFranja.AFTERNOON, wholeDay = false).size)
    }

    @Test fun rejectingNeedsTenCharacters() {
        assertTrue(CategoryRequestRules.rejectError("corto") != null)
        assertNull(CategoryRequestRules.rejectError("No hay dermatología este mes"))
    }
}
