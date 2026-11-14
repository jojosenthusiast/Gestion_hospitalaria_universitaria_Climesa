package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class RoleDashboardTest {
    private val now = Instant.parse("2026-11-14T15:00:00Z")
    private fun rows(vararg items: JSONObject) = JSONArray().apply { items.forEach { put(it) } }
    private fun row(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }
    private fun beds(vararg states: String) = rows(*states.map { row("state" to it) }.toTypedArray())

    private val everything = AndroidSection.entries.map(AndroidSection::permission).toSet() + setOf(
        "camas.asignar", "pacientes.registrar", "citas.agendar", "fila.emitir", "fila.llamar", "ambulancia.despachar", "cuentas.verificar", "inventario.ver", "resultados.ver",
    )

    @Test fun cadaRolTieneTableroYSoloLeeLosEndpointsQueSuPermisoPermite() {
        assertTrue(AndroidSections.roles.all(RoleDashboard::builds))
        assertEquals(
            listOf(DashboardSource.BEDS, DashboardSource.QUEUE, DashboardSource.ADMISSIONS, DashboardSource.AMBULANCE, DashboardSource.APPOINTMENTS, DashboardSource.SHIFTS),
            RoleDashboard.sources("REC", setOf("camas.ver_tablero", "fila.ver", "admision.ver", "ambulancia.ver_estado", "citas.ver", "turnos.ver")),
        )
        assertFalse(DashboardSource.LINKS in RoleDashboard.sources("REC", setOf("fila.ver")))
        assertTrue(RoleDashboard.sources("LAB", setOf("sesion.perfil")).isEmpty())
    }

    @Test fun elJefeVeCamasYAdmisionesSinCamaConLaAccionDeAsignar() {
        val model = RoleDashboard.build(
            "JOP", everything,
            mapOf(DashboardSource.BEDS to beds("libre", "libre", "ocupada", "limpieza", "bloqueada"), DashboardSource.ADMISSIONS to rows(row("state" to "pendiente_cama"), row("state" to "hospitalizado"))),
            now = now,
        )
        val free = model.kpis.first { it.label == "Camas libres" }
        assertEquals("2", free.value)
        assertEquals("de 5", free.suffix)
        assertEquals(DashboardTone.SUCCESS, free.tone)
        assertEquals(DashboardTone.WARNING, model.kpis.first { it.label == "Admisiones sin cama" }.tone)
        val donut = model.charts.single { it.kind == ChartKind.DONUT }
        assertEquals(5, donut.total)
        val assign = model.attention.single { it.request.action == QuickAction.ASSIGN_BED }
        assertEquals(AndroidSection.ADMISSION, assign.request.section)
    }

    @Test fun sinCamasLibresLaTarjetaSePintaDePeligro() {
        val model = RoleDashboard.build("JOP", everything, mapOf(DashboardSource.BEDS to beds("ocupada", "ocupada")), now = now)
        assertEquals(DashboardTone.DANGER, model.kpis.first { it.label == "Camas libres" }.tone)
    }

    @Test fun laFuenteQueFallaNoDejaUnCeroInventado() {
        val model = RoleDashboard.build("JOP", everything, mapOf(DashboardSource.BEDS to beds("libre")), unavailable = setOf(DashboardSource.QUEUE), now = now)
        assertTrue(model.kpis.none { it.label == "En espera" })
        assertTrue(model.kpis.none { it.label == "Admisiones sin cama" })
        assertEquals(setOf(DashboardSource.QUEUE), model.unavailable)
    }

    @Test fun laboratorioPriorizaLasUrgentesYAbreMuestraYCaptura() {
        val orders = rows(
            row("state" to "pendiente", "priority" to "urgente"),
            row("state" to "pendiente", "priority" to "rutina"),
            row("state" to "en_proceso", "priority" to "rutina"),
            row("state" to "completado", "priority" to "rutina", "reviewedAt" to null),
            row("state" to "completado", "priority" to "rutina", "reviewedAt" to "2026-11-14T10:00:00Z"),
        )
        val model = RoleDashboard.build("LAB", everything, mapOf(DashboardSource.LAB to orders), now = now)
        assertEquals("2", model.kpis.first { it.label == "Solicitadas" }.value)
        assertEquals("1", model.kpis.first { it.label == "Urgentes abiertas" }.value)
        assertEquals(DashboardTone.DANGER, model.kpis.first { it.label == "Urgentes abiertas" }.tone)
        assertEquals("1", model.kpis.first { it.label == "Esperan revisión médica" }.value)
        assertEquals(listOf(QuickAction.TAKE_SAMPLE, QuickAction.CAPTURE_RESULT), model.attention.mapNotNull { it.request.action })
        assertEquals(listOf(2, 1, 1, 1), model.charts.single().slices.map { it.value })
    }

    @Test fun elMedicoVeLosResultadosCriticosPrimero() {
        val critical = row("state" to "completado", "reviewedAt" to null, "items" to rows(row("result" to row("mark" to "critico_alto"))))
        val normal = row("state" to "completado", "reviewedAt" to null, "items" to rows(row("result" to row("mark" to "normal"))))
        val model = RoleDashboard.build("MED", everything, mapOf(DashboardSource.LAB to rows(critical, normal)), now = now)
        assertEquals("2", model.kpis.first { it.label == "Resultados por revisar" }.value)
        assertEquals(DashboardTone.DANGER, model.kpis.first { it.label == "Resultados por revisar" }.tone)
        assertEquals(listOf(DashboardTone.DANGER, DashboardTone.WARNING), model.attention.map { it.tone })
        assertTrue(model.attention.all { it.request.section == AndroidSection.RESULT_REVIEW })
    }

    @Test fun recepcionOfreceRegistrarEmitirAgendarYDespacharSoloConSusPermisos() {
        val all = RoleDashboard.build("REC", everything, emptyMap(), now = now).actions.mapNotNull { it.request.action }
        assertEquals(listOf(QuickAction.REGISTER_PATIENT, QuickAction.SCHEDULE_APPOINTMENT, QuickAction.ISSUE_NUMBER, QuickAction.ASSIGN_BED, QuickAction.DISPATCH), all)
        val limited = RoleDashboard.build("REC", setOf("sesion.perfil", "pacientes.buscar", "fila.emitir"), emptyMap(), now = now).actions.mapNotNull { it.request.action }
        assertEquals(listOf(QuickAction.ISSUE_NUMBER), limited)
    }

    @Test fun recepcionAvisaLasSolicitudesDeCitaYLasVinculaciones() {
        val model = RoleDashboard.build(
            "REC", everything,
            mapOf(
                DashboardSource.APPOINTMENTS to rows(row("state" to "solicitada"), row("state" to "confirmada")),
                DashboardSource.LINKS to rows(row("id" to "a"), row("id" to "b")),
            ),
            now = now,
        )
        assertEquals("1", model.kpis.first { it.label == "Citas por confirmar" }.value)
        assertEquals("2", model.kpis.first { it.label == "Vinculaciones por verificar" }.value)
        assertTrue(model.attention.any { it.request.section == AndroidSection.LINKING })
        assertTrue(model.attention.any { it.request.section == AndroidSection.APPOINTMENTS })
    }

    @Test fun elAsistenteLlamaAlSiguienteSoloSiPuedeLlamar() {
        val queue = rows(row("state" to "en_espera"), row("state" to "en_espera"), row("state" to "atendido"))
        val withPermission = RoleDashboard.build("AST", everything, mapOf(DashboardSource.QUEUE to queue), now = now)
        assertEquals(QuickAction.CALL_NEXT, withPermission.attention.single().request.action)
        val without = RoleDashboard.build("AST", everything - "fila.llamar", mapOf(DashboardSource.QUEUE to queue), now = now)
        assertTrue(without.attention.isEmpty())
    }

    @Test fun elParamedicoVeElServicioEnCursoYElEstadoDeLaUnidad() {
        val ambulance = JSONObject("""{"unit":{"id":"u","plate":"P-123","state":"en_servicio","version":1},"activeService":{"id":"s","origin":"Calle 1","destination":"Hospital","hasPrehospital":false},"paramedicOnDuty":true,"pendingRequests":[]}""")
        val model = RoleDashboard.build("PAR", everything, mapOf(DashboardSource.AMBULANCE to ambulance), now = now)
        assertEquals("En servicio", model.kpis.first().value)
        assertEquals(DashboardTone.DANGER, model.kpis.first().tone)
        assertEquals(AndroidSection.SERVICE, model.attention.single().request.section)
    }

    @Test fun elInventarioCuentaBajoMinimoYVencidos() {
        val stock = rows(
            row("bajo_minimo" to true, "expiresAt" to "2027-01-01"),
            row("bajo_minimo" to false, "expiresAt" to "2026-10-01"),
            row("bajo_minimo" to false, "expiresAt" to null),
        )
        assertEquals(RoleDashboard.StockCounts(1, 1), RoleDashboard.stockCounts(stock, java.time.LocalDate.parse("2026-11-14")))
    }

    @Test fun elPacienteVeProximaCitaTurnoYExamenesLiberados() {
        val model = RoleDashboard.build(
            "PAC", everything,
            mapOf(
                DashboardSource.APPOINTMENTS to rows(row("state" to "confirmada", "start" to "2026-11-20T15:00:00Z", "doctorName" to "Dra. Ejemplo"), row("state" to "cancelada", "start" to "2026-11-15T15:00:00Z")),
                DashboardSource.QUEUE to rows(row("state" to "llamado", "numero" to 12)),
                DashboardSource.MY_LAB to rows(row("state" to "completado", "reviewedAt" to "2026-11-14T10:00:00Z"), row("state" to "en_proceso")),
            ),
            now = now,
        )
        assertTrue(model.kpis.first { it.label == "Próxima cita" }.value.contains("Dra. Ejemplo"))
        assertEquals("N.º 12", model.kpis.first { it.label == "Mi turno en fila" }.value)
        assertEquals("1", model.kpis.first { it.label == "Exámenes listos" }.value)
        assertEquals("Es tu turno", model.attention.first().title)
    }

    @Test fun elPacienteSinVincularRecibeLaInvitacionAVincular() {
        val model = RoleDashboard.build("PAC", everything, emptyMap(), now = now, linked = false)
        assertEquals(AndroidSection.LINK_RECORD, model.attention.single().request.section)
    }

    @Test fun elProximoTurnoIgnoraLosYaTerminados() {
        val shifts = rows(
            row("state" to "completado", "start" to "2026-11-13T08:00:00Z", "end" to "2026-11-13T16:00:00Z", "area" to "Ayer"),
            row("state" to "publicado", "start" to "2026-11-15T08:00:00Z", "end" to "2026-11-15T16:00:00Z", "area" to "Consulta"),
        )
        assertTrue(RoleDashboard.nextShift(shifts, now)!!.startsWith("Consulta"))
        assertNull(RoleDashboard.nextShift(rows(), now))
    }
}
