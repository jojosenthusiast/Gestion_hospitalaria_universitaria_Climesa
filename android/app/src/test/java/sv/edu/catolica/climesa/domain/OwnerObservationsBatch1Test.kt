package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** Owner observations batch 1 (lotes 1-3) on Android: pure rules behind the screens. */
class OwnerObservationsBatch1Test {
    private val today = LocalDate.of(2026, 11, 18)

    @Test fun patientListLineShowsAgeAndSexButNeverTheDui() {
        val p = Patient(record = "EXP-1", givenNames = "Ana", surnames = "Ruiz", dui = "01234567-8", birth = LocalDate.of(1992, 11, 19), sex = Sex.FEMALE, phone = "")
        assertEquals("33 años · Femenino", PatientSummary.line(p, today))
        assertEquals("1 año", PatientSummary.ageText(LocalDate.of(2025, 1, 1), today))
        assertNull(PatientSummary.line(p.copy(birth = null, sex = Sex.UNKNOWN), today))
        assertEquals("Masculino", PatientSummary.line(p.copy(birth = null, sex = Sex.MALE), today))
        // A role that only sees the age range gets the range, never an exact age.
        assertEquals("30-39 años · Femenino", PatientSummary.fromApi(null, "30-39", "femenino", today))
        assertEquals("34 años", PatientSummary.fromApi("1992-01-10", "30-39", "no_registrado", today))
        val hit = PortalParsers.patients(JSONArray().put(JSONObject().put("fullName", "Ana Ruiz").put("record", "EXP-1").put("birth", "1992-11-19").put("sex", "femenino"))).single()
        assertEquals(true, hit.summary?.endsWith("Femenino"))
    }

    @Test fun unitHeaderSaysItCannotBeDispatchedInsteadOfAvailable() {
        assertEquals("disponible", UnitStatusBadge.code("disponible", blocked = false))
        assertEquals("Disponible", UnitStatusBadge.label("disponible", false, "Disponible"))
        assertEquals(UnitStatusBadge.BLOCKED, UnitStatusBadge.code("disponible", blocked = true))
        assertEquals("No se puede despachar", UnitStatusBadge.label("disponible", true, "Disponible"))
        assertEquals("Falta motorista en turno. Asigna un motorista.", UnitStatusBadge.reason(DispatchBlock("sin_motorista", "Falta motorista en turno.", "Asigna un motorista.")))
        assertEquals("La unidad está en servicio. Despacha cuando la unidad termine ese servicio.", UnitStatusBadge.reason(DispatchBlock("en_servicio", "La unidad está en servicio.", "")))
        assertEquals("Sin servicio activo", UnitStatusBadge.NO_SERVICE)
    }

    private fun ticket(state: String, allowed: List<String>, undo: List<String> = emptyList(), calls: Int = 1) = QueueRules.parse(JSONArray().put(JSONObject()
        .put("id", "t7").put("service", "consulta_general").put("area", "CON").put("numero", 7).put("patientName", "Paciente Ficticio").put("state", state)
        .put("llamados", calls).put("version", 2).put("issuedAt", "2026-11-17T15:00:00Z").put("priority", "rutina").put("walkIn", true)
        .put("allowedActions", JSONArray(allowed)).put("blockedActions", JSONArray()).put("undoActions", JSONArray(undo)))).single()

    @Test fun queueMenuNeverRepeatsTheDirectButtons() {
        // Waiting: "Llamar" is the direct button, so the menu has no move left.
        assertEquals(emptyList<QueueMove>(), QueueMoves.menuMoves(ticket("en_espera", listOf("llamar"), calls = 0)))
        // Called once: "Iniciar atención" and "No se presentó" are direct; only "Devolver a espera" stays in the menu.
        val called = ticket("llamado", listOf("atender", "no_se_presento"), listOf("deshacer_llamado"))
        assertEquals(listOf(QueueMove.UNDO_CALL), QueueMoves.menuMoves(called))
        assertEquals("Devolver a espera", QueueMove.UNDO_CALL.label)
        // The card already shows its own "Deshacer": the menu does not offer it again.
        assertEquals(emptyList<QueueMove>(), QueueMoves.menuMoves(called, undoShown = true))
        // Called twice: one call less, never "Mover a…".
        assertEquals(listOf(QueueMove.REMOVE_CALL), QueueMoves.menuMoves(ticket("llamado", listOf("atender"), listOf("deshacer_llamado"), calls = 2)))
    }

    private fun bed(code: String, room: String, level: Int?, state: String) = Bed(id = code, code = code, room = room, state = state, version = 1, level = level, roomId = "r-$room")

    @Test fun bedsBoardGroupsByFloorAndRoomWithCountsPerState() {
        val beds = listOf(bed("C-10", "H-201", 2, "libre"), bed("C-2", "H-201", 2, "ocupada"), bed("C-1", "H-101", 1, "libre"), bed("X-1", "Sin lugar", null, "bloqueada"))
        val floors = BedBoard.group(beds)
        assertEquals(listOf(1, 2, null), floors.map { it.level })
        assertEquals(listOf("C-2", "C-10"), floors[1].rooms.single().beds.map { it.code })
        assertEquals(listOf<Pair<String?, Int>>(null to 4, "libre" to 2, "ocupada" to 1, "bloqueada" to 1), BedBoard.chips(beds, null))
        // A chosen state with no beds left keeps its chip (count 0) so it can be cleared.
        assertEquals(true, ("reservada" to 0) in BedBoard.chips(beds, "reservada"))
        assertEquals(listOf("C-1", "C-10"), BedBoard.group(beds, "libre").flatMap { f -> f.rooms.flatMap { r -> r.beds.map { it.code } } })
        val parsed = sv.edu.catolica.climesa.data.parseBeds(JSONArray().put(JSONObject().put("id", "b").put("code", "C-1").put("room", "H-1").put("roomId", "r1").put("level", 3).put("state", "libre")))
        assertEquals(3, parsed.single().level)
    }

    @Test fun indicatedAdmissionSaysWhoAndWhereFrom() {
        assertEquals("Indicado por Dr(a). Ana Ruiz desde consulta", HospitalizationRules.indicatedBy("Ana Ruiz", "consulta", null))
        assertEquals("Indicado por Dra. Ana Ruiz desde Emergencia", HospitalizationRules.indicatedBy("Dra. Ana Ruiz", "emergencia", null))
        assertEquals("Indicado por Dr(a). Ana Ruiz desde consulta · para el 18 de noviembre, 14:00", HospitalizationRules.indicatedBy("Ana Ruiz", "consulta", "2026-11-18T20:00:00Z"))
        assertEquals("Llega desde ambulancia", HospitalizationRules.indicatedBy(null, "ambulancia", null))
        assertNull(HospitalizationRules.indicatedBy(" ", null, null))
    }

    @Test fun bedSuggestionsAreGroupedByRoom() {
        val rows = listOf(HospitalBedSuggestion("1", 1, "C-10", "H-2", "vip", ""), HospitalBedSuggestion("2", 1, "C-1", "H-10", "vip", ""), HospitalBedSuggestion("3", 1, "C-2", "H-2", "vip", ""))
        val groups = HospitalizationRules.byRoom(rows)
        assertEquals(listOf("H-2", "H-10"), groups.map { it.first })
        assertEquals(listOf("C-2", "C-10"), groups.first().second.map { it.code })
    }

    @Test fun clockShowsSecondsAndTheFullWeekday() {
        val now = Instant.parse("2026-11-18T20:05:09.400Z")
        assertEquals("14:05:09", HospitalClockText.time(now))
        assertEquals("Miércoles 18 de noviembre", HospitalClockText.date(now))
        assertEquals(600L, HospitalClockText.untilNextSecond(now.toEpochMilli()))
        assertEquals(1000L, HospitalClockText.untilNextSecond(0L))
    }

    @Test fun receptionNamesBookedRequestsToConfirmAndCategoryRequestsToAssign() {
        assertEquals("Por confirmar", ReceptionAppointmentLabels.state("solicitada") { it })
        assertEquals("confirmada", ReceptionAppointmentLabels.state("confirmada") { it })
        assertEquals("Por asignar", CategoryRequestRules.status(CategoryRequestRules.PENDING).second)
    }
}
