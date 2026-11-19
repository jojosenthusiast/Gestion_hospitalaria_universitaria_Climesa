package sv.edu.catolica.climesa.ui

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.AdmissionParser
import sv.edu.catolica.climesa.domain.DischargeFlow
import sv.edu.catolica.climesa.domain.HospitalAdmission
import sv.edu.catolica.climesa.domain.HospitalizationRules

/** Lote 5 S7/S14: the transfer list by floor and room, and where an inpatient is in the discharge flow. */
class Lote5MedHospitalizationTest {
    private val admission = HospitalAdmission("ad1", "Ana", "hospitalizado", "B-201", "semiprivada", false, 4, bedCategory = "semiprivada")

    private fun beds() = AdmissionParser.beds(JSONArray("""[
        {"id":"a","code":"B-205","room":"205","category":"semiprivada","state":"libre","level":2},
        {"id":"b","code":"B-204B","room":"204","category":"semiprivada","state":"ocupada","level":2},
        {"id":"c","code":"B-204A","room":"204","category":"semiprivada","state":"libre","level":2},
        {"id":"d","code":"B-101","room":"101","category":"semiprivada","state":"libre","level":1},
        {"id":"e","code":"B-301","room":"301","category":"semiprivada","state":"ocupada","level":3},
        {"id":"f","code":"B-201","room":"201","category":"semiprivada","state":"ocupada","level":2},
        {"id":"g","code":"V-1","room":"V1","category":"vip","state":"libre","level":4},
        {"id":"h","code":"X-1","room":"X","category":"semiprivada","state":"libre","level":null}
    ]"""))

    @Test fun transferIsGroupedByFloorAndRoomWithFreeAndOccupiedBeds() {
        val rooms = HospitalizationRules.transferGroups(beds(), admission)
        assertEquals(listOf("Piso 1 · Habitación 101 (Semiprivada)", "Piso 2 · Habitación 204 (Semiprivada)", "Piso 2 · Habitación 205 (Semiprivada)", "Habitación X (Semiprivada)"), rooms.map { it.title })
        val room204 = rooms[1]
        assertEquals(listOf("B-204A", "B-204B"), room204.beds.map { it.code })
        assertEquals(listOf(true, false), room204.beds.map { it.free })
        assertEquals(1, room204.freeCount)
        // The current bed, other categories and rooms with no free bed stay out.
        assertEquals(emptyList<String>(), rooms.flatMap { r -> r.beds.map { it.id } }.filter { it in setOf("e", "f", "g") })
        // The selectable candidates are unchanged.
        assertEquals(listOf("a", "c", "d", "h"), HospitalizationRules.transferCandidates(beds(), admission).map { it.id })
        assertNull(beds().last().level)
    }

    @Test fun dischargeFlowStageSaysWhereThePatientIs() {
        assertEquals("Hospitalizado · cama B-201", DischargeFlow.stage(admission).title)
        assertEquals("Pendiente de cama", DischargeFlow.stage(admission.copy(state = "pendiente_cama", bed = "")).title)
        assertEquals("Falta la firma del médico tratante.", DischargeFlow.stage(admission.copy(dischargeRequestedAt = "2026-11-18T15:00:00Z")).detail)
        assertEquals("Falta registrar la salida del paciente.", DischargeFlow.stage(admission.copy(state = "alta_firmada")).detail)
    }
}
