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

    // R3 A-36: zero free beds asks for attention (amber); red stays for critical values and emergencies.
    @Test fun sinCamasLibresLaTarjetaPideAtencionSinRojo() {
        val model = RoleDashboard.build("REC", everything, mapOf(DashboardSource.BEDS to beds("ocupada", "ocupada")), now = now)
        assertEquals(DashboardTone.WARNING, model.kpis.first { it.label == "Camas libres" }.tone)
    }

    @Test fun laFuenteQueFallaNoDejaUnCeroInventado() {
        val model = RoleDashboard.build("REC", everything, mapOf(DashboardSource.BEDS to beds("libre")), unavailable = setOf(DashboardSource.QUEUE), now = now)
        assertTrue(model.kpis.none { it.label == "En espera" })
        assertTrue(model.kpis.none { it.label == "Admisiones sin cama" })
        assertEquals(setOf(DashboardSource.QUEUE), model.unavailable)
    }

    @Test fun elMedicoVeLosResultadosCriticosPrimero() {
        val critical = row("state" to "completado", "reviewedAt" to null, "items" to rows(row("result" to row("mark" to "critico_alto"))))
        val normal = row("state" to "completado", "reviewedAt" to null, "items" to rows(row("result" to row("mark" to "normal"))))
        val model = RoleDashboard.build("MED", everything, mapOf(DashboardSource.LAB to rows(critical, normal)), now = now)
        // R3 A-28: the pending rows carry the count, so the KPI tile with the same number is gone.
        assertTrue(model.kpis.none { it.label == "Resultados por revisar" })
        assertEquals(listOf("1 resultado con valor crítico", "1 resultado por revisar"), model.attention.map { it.title })
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
                DashboardSource.APPOINTMENTS to rows(
                    row("state" to "solicitada", "start" to "2026-11-15T15:00:00Z"),
                    // A request whose time already passed is "vencida" on the server (it sweeps before every read).
                    row("state" to "vencida", "start" to "2026-11-14T13:00:00Z"),
                    row("state" to "confirmada", "start" to "2026-11-15T15:00:00Z"),
                ),
                // S8: a pending request by category also waits on Recepción; an assigned one does not.
                DashboardSource.CATEGORY_REQUESTS to rows(row("state" to "pendiente"), row("state" to "asignada")),
                DashboardSource.LINKS to rows(row("id" to "a"), row("id" to "b")),
            ),
            now = now,
        )
        // R3 A-28: "1 solicitud de cita" replaces the "Citas por confirmar 1" tile; one row, one action.
        assertTrue(model.kpis.none { it.label == "Citas por confirmar" || it.label == "Vinculaciones por verificar" })
        assertEquals("2 solicitudes de cita", model.attention.first { it.request.section == AndroidSection.APPOINTMENTS }.title)
        assertEquals(QuickAction.REVIEW_REQUESTS, model.attention.first { it.request.section == AndroidSection.APPOINTMENTS }.request.action)
        assertTrue(model.attention.first { it.request.section == AndroidSection.APPOINTMENTS }.detail.contains("reprograma"))
        assertEquals("2 vinculaciones por verificar", model.attention.first { it.request.section == AndroidSection.LINKING }.title)
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
        // R3 A-36: a service in progress is normal work for the paramedic, never red.
        assertEquals(DashboardTone.PROCESS, model.kpis.first().tone)
        assertEquals(DashboardTone.PROCESS, model.attention.single().tone)
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
        assertTrue(model.attention.any { it.title == "Resultados nuevos (1)" })
        assertTrue(model.kpis.none { it.label == "Exámenes listos" })
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

    // R3 A-36: outside critical lab values no dashboard item is red, for any role.
    @Test fun ningunRolPintaDeRojoLoQueNoEsCritico() {
        val ambulance = JSONObject("""{"unit":{"id":"u","plate":"P-1","state":"en_servicio","version":1},"activeService":{"id":"s","origin":"A","destination":"B","hasPrehospital":true},"paramedicOnDuty":true,"pendingRequests":[{"id":"r1","origin":"X","reason":"Caída","createdAt":"2026-11-14T10:00:00Z"}]}""")
        val stock = rows(row("bajo_minimo" to true, "expiresAt" to "2026-10-01"))
        val data = mapOf(DashboardSource.BEDS to beds("ocupada"), DashboardSource.AMBULANCE to ambulance, DashboardSource.STOCK to stock)
        listOf("REC", "ENF", "PAR").forEach { role ->
            val model = RoleDashboard.build(role, everything, data, now = now)
            assertTrue(role, model.kpis.none { it.tone == DashboardTone.DANGER })
            assertTrue(role, model.attention.none { it.tone == DashboardTone.DANGER })
        }
        assertEquals(DashboardTone.PROCESS, RoleDashboard.unitTone("en_servicio"))
    }

    // R3 A-48: counts read as Spanish, never "número(s)".
    @Test fun losConteosNoUsanParentesisDePlural() {
        val queue = rows(row("state" to "en_espera"))
        val one = RoleDashboard.build("AST", everything, mapOf(DashboardSource.QUEUE to queue), now = now)
        assertEquals("1 número esperando", one.attention.single().title)
        val two = RoleDashboard.build("AST", everything, mapOf(DashboardSource.QUEUE to rows(row("state" to "en_espera"), row("state" to "en_espera"))), now = now)
        assertEquals("2 números esperando", two.attention.single().title)
        assertTrue(two.kpis.none { it.label == "En espera" })
    }
}
