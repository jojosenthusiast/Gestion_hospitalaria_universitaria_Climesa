package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceptionSchedulingTest {
    @Test fun searchNeedsTwoCharactersIgnoringAccentsAndSpaces() {
        assertFalse(ReceptionScheduling.canSearch("m"))
        assertFalse(ReceptionScheduling.canSearch(" á "))
        assertTrue(ReceptionScheduling.canSearch("ma"))
        assertTrue(ReceptionScheduling.canSearch("12"))
    }

    @Test fun parsesThePickerPageWithAgeWhenPresent() {
        val page = ReceptionScheduling.pickerPage(JSONObject("""{"items":[{"id":"p1","record":"0000001-X","fullName":"María Alejandra Pérez","age":34},{"id":"p2","record":"0000002-V","fullName":"María Valeria"}],"hasMore":true}"""))
        assertEquals(2, page.items.size)
        assertTrue(page.hasMore)
        assertEquals("Expediente 0000001-X · 34 años", page.items[0].detail)
        assertNull(page.items[1].age)
        assertEquals("Expediente 0000002-V", page.items[1].detail)
    }

    @Test fun doctorsWithoutShiftKeepTheirReason() {
        val doctors = ReceptionScheduling.doctors(JSONObject("""{"doctors":[
            {"id":"d1","givenNames":"Ana","surnames":"Ruiz","specialty":"Pediatría","active":true,"tieneTurno":true,"motivo":null},
            {"id":"d2","givenNames":"Luis","surnames":"Mena","specialty":null,"active":true,"tieneTurno":false,"motivo":"Sin turno ese día"},
            {"id":"d3","givenNames":"Inactivo","surnames":"X","active":false}]}"""))
        assertEquals(listOf("d1", "d2"), doctors.map { it.id })
        assertTrue(doctors[0].hasShift)
        assertFalse(doctors[1].hasShift)
        assertEquals("Sin turno ese día", doctors[1].reason)
        assertEquals("Medicina general", doctors[1].detail)
    }

    @Test fun allSlotsOfTheDayKeepTheirState() {
        val slots = ReceptionScheduling.daySlots(JSONObject("""{"franjas":[
            {"start":"2026-11-20T14:00:00Z","end":"2026-11-20T14:20:00Z","estado":"ocupado","motivo":"Ocupado"},
            {"start":"2026-11-20T14:20:00Z","end":"2026-11-20T14:40:00Z","estado":"libre","motivo":null},
            {"start":"2026-11-20T14:40:00Z","end":"2026-11-20T15:00:00Z","estado":"sin_turno","motivo":"Médico sin turno"},
            {"start":"2026-11-20T15:00:00Z","end":"2026-11-20T15:20:00Z","estado":"pasado"}]}"""))
        assertEquals(listOf(SlotStatus.BUSY, SlotStatus.FREE, SlotStatus.NO_SHIFT, SlotStatus.PAST), slots.map { it.status })
        assertEquals(listOf(false, true, false, false), slots.map { it.selectable })
        assertEquals("Ocupado", slots[0].label)
        assertEquals("Ya pasó", slots[3].label)
    }

    @Test fun anOlderServerWithoutFranjasStillGivesTheFreeSlots() {
        val slots = ReceptionScheduling.daySlots(JSONObject("""{"slots":[{"start":"2026-11-20T14:20:00Z","end":"2026-11-20T14:40:00Z"}]}"""))
        assertEquals(1, slots.size)
        assertTrue(slots.single().selectable)
    }

    @Test fun onlyAFreeSlotOfADoctorWithShiftCanBeConfirmed() {
        val patient = PickerPatient("p1", "1", "Ana", 30)
        val doctor = SchedulingDoctor("d1", "Dr", null, true, null)
        val free = DaySlot("a", "b", SlotStatus.FREE, null)
        assertTrue(ReceptionScheduling.canConfirm(patient, doctor, free))
        assertFalse(ReceptionScheduling.canConfirm(null, doctor, free))
        assertFalse(ReceptionScheduling.canConfirm(patient, doctor.copy(hasShift = false), free))
        assertFalse(ReceptionScheduling.canConfirm(patient, doctor, free.copy(status = SlotStatus.BUSY)))
        assertEquals("p1", ReceptionScheduling.createBody(patient, doctor, free, " control ").getString("patientId"))
        assertEquals("control", ReceptionScheduling.createBody(patient, doctor, free, " control ").getString("reason"))
        assertFalse(ReceptionScheduling.createBody(patient, doctor, free, "  ").has("reason"))
    }

    @Test fun linkRequestsExplainWhatToDo() {
        val rows = ReceptionLinking.parse(JSONArray("""[
          {"id":"v1","version":1,"createdAt":"2026-11-13T15:12:00Z","account":{"email":"a@x.test","name":"Ana"},"declared":{"dui":"06612345-2","birth":"1999-05-30"},"candidate":{"id":"p","record":"000412-7","fullName":"Ana","birth":"1999-05-30"},"candidates":1},
          {"id":"v2","version":3,"createdAt":"2026-11-13T16:05:00Z","account":{"email":"b@x.test","name":""},"declared":{"dui":"07788990-1","birth":"1988-02-14"},"candidate":null,"candidates":0},
          {"id":"v3","version":1,"createdAt":"2026-11-13T16:06:00Z","account":{"email":"c@x.test","name":""},"declared":{"dui":"1","birth":"1"},"candidate":null,"candidates":2}]"""))
        assertTrue(rows[0].canApprove)
        assertTrue(rows[0].birthMatches)
        assertFalse(rows[1].canApprove)
        assertTrue(rows[1].guidance.contains("búscalo en Pacientes"))
        assertTrue(rows[2].guidance.contains("posible duplicado"))
        assertEquals(3, ReceptionLinking.approveBody(rows[1]).getInt("version"))
        assertEquals("motivo suficiente", ReceptionLinking.rejectBody(rows[0], " motivo suficiente ").getString("reason"))
        assertEquals("El motivo debe tener al menos 10 caracteres.", ReceptionLinking.rejectError("corto"))
        assertNull(ReceptionLinking.rejectError("motivo suficiente"))
    }

    @Test fun prefillCopiesWhatWasSearched() {
        assertEquals(PatientDraft(dui = "12345678-9"), PatientRules.prefill("123456789"))
        assertEquals(PatientDraft(givenNames = "Pedro"), PatientRules.prefill(" Pedro "))
        assertEquals(PatientDraft(givenNames = "Pedro", surnames = "Gomez"), PatientRules.prefill("Pedro Gomez"))
        assertEquals(PatientDraft(givenNames = "Ana María", surnames = "Prueba Hernández"), PatientRules.prefill("Ana María Prueba Hernández"))
        assertEquals(PatientDraft(), PatientRules.prefill("0000001-X"))
    }

    @Test fun duplicateAnswersFromTheApiAreReadable() {
        val similar = PatientDuplicates.similar("""{"codigo":"posible_duplicado","candidatos":[{"id":"p9","record":"EXP-9","fullName":"Luis Prueba"}]}""")
        assertEquals(listOf("Luis Prueba · EXP-9"), similar)
        assertEquals("Lucrecia Ayala · 0000001-X", PatientDuplicates.existing("""{"codigo":"dui_duplicado","paciente":{"id":"p","record":"0000001-X","fullName":"Lucrecia Ayala"}}"""))
        assertTrue(PatientDuplicates.similar("no es json").isEmpty())
        assertNull(PatientDuplicates.existing(null))
    }
}
