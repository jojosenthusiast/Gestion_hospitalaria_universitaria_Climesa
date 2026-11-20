package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.ui.undoSecondsLeft
import java.time.Instant

/** Flow audit 2026-11-20: paramedic and ambulance reception rules on Android. */
class AuditAmbulanceRulesTest {
    private val now = Instant.parse("2026-11-20T15:00:00Z")
    private val everything = AndroidSection.entries.map(AndroidSection::permission).toSet()

    // D19/D119: the API ranges are checked on the phone, next to each field.
    @Test fun signosFueraDeRangoDanErrorPorCampo() {
        val errors = AmbulanceRules.signErrors(PrehospitalForm(reason = "Dolor", glasgow = "20", oxygenSaturation = "150", heartRate = "80"))
        assertEquals(setOf("glasgow", "oxygenSaturation"), errors.keys)
        assertEquals("La escala de Glasgow va de 3 a 15.", errors["glasgow"])
        assertEquals("La escala de Glasgow va de 3 a 15.", AmbulanceRules.prehospitalError(PrehospitalForm(reason = "Dolor torácico", glasgow = "20")))
        assertTrue(AmbulanceRules.signErrors(PrehospitalForm(temperature = "37,5", glasgow = "15", systolic = "")).isEmpty())
    }

    // D22: the map query carries the municipality and the country.
    @Test fun elMapaBuscaConMunicipio() {
        assertEquals("Col. Zacamil, Mejicanos, El Salvador", AmbulanceRules.mapQuery("Col. Zacamil", "Mejicanos"))
        assertEquals("Calle Arce, San Salvador, El Salvador", AmbulanceRules.mapQuery("Calle Arce, San Salvador", "San Salvador"))
        assertEquals("Calle Arce, El Salvador", AmbulanceRules.mapQuery("Calle Arce", ""))
    }

    @Test fun elServicioActivoTraeSuMunicipio() {
        val status = AmbulanceParser.status(JSONObject("""{"unit":{"id":"u","plate":"P","state":"en_servicio","version":1},"activeService":{"id":"s","origin":"Col. Zacamil","municipality":"Mejicanos","destination":"H"},"paramedicOnDuty":true}"""))!!
        assertEquals("Mejicanos", status.activeService!!.municipality)
    }

    // D7/D117: the undo countdown rounds up and never goes negative.
    @Test fun cuentaRegresivaDelDeshacer() {
        assertEquals(15L, undoSecondsLeft(until = 15_000L, now = 0L))
        assertEquals(1L, undoSecondsLeft(until = 1_000L, now = 1L))
        assertEquals(0L, undoSecondsLeft(until = 1_000L, now = 2_000L))
    }

    // D13/D114: no "Servicio en curso" shortcut; the running service has its own pending row.
    @Test fun paramedicoSinAtajoDeServicioEnCurso() {
        val labels = QuickActions.forRole("PAR", everything).map { it.label }
        assertFalse("Servicio en curso" in labels)
        assertTrue("Ver unidad" in labels)
    }

    // D136: Inicio agrees with Servicio: a blocked unit is not "Disponible".
    @Test fun unidadBloqueadaNoSeVeDisponibleEnInicio() {
        val blocked = JSONObject("""{"unit":{"id":"u","plate":"P-1","state":"disponible","version":1},"activeService":null,"paramedicOnDuty":false,"pendingRequests":[],"dispatchBlock":{"code":"sin_paramedico_de_turno","message":"No hay paramédico de turno.","action":""}}""")
        val tile = RoleDashboard.build("PAR", everything, mapOf(DashboardSource.AMBULANCE to blocked), now = now).kpis.first()
        assertEquals(RoleDashboard.UNIT_CANNOT_LEAVE, tile.value)
        assertEquals(DashboardTone.BLOCKED, tile.tone)
        assertEquals("No hay paramédico de turno.", tile.hint)
    }

    // D6/D73: a running shift is "Mi turno · Hasta las HH:mm" with the area apart; the next one is "Mi próximo turno".
    @Test fun turnoEnCursoNoEsProximoTurno() {
        val running = JSONArray().put(JSONObject().put("state", "en_curso").put("area", "Bahía de ambulancia").put("start", "2026-11-20T12:00:00Z").put("end", "2026-11-20T20:00:00Z"))
        val (label, value, hint) = RoleDashboard.shiftTile(running, now)!!
        assertEquals("Mi turno", label)
        assertEquals("Hasta las 14:00", value)
        assertEquals("Bahía de ambulancia", hint)
        val next = JSONArray().put(JSONObject().put("state", "publicado").put("area", "Consulta").put("start", "2026-11-21T12:00:00Z").put("end", "2026-11-21T20:00:00Z"))
        assertEquals("Mi próximo turno", RoleDashboard.shiftTile(next, now)!!.first)
        assertNull(RoleDashboard.shiftTile(JSONArray(), now))
    }

    // D25/D26: arrived first, then on the way; priority and report state when the API sends them.
    @Test fun alertasDeAmbulanciaConEstado() {
        val list = listOf(
            ArrivalCandidate("s1", "2026-11-20T14:40:00Z", active = true, arrived = false, priority = "roja", hasPrehospital = true),
            ArrivalCandidate("s2", "2026-11-20T14:00:00Z", active = false, arrived = true),
        )
        val alerts = RoleDashboard.ambulanceAlerts(list, now)
        assertEquals(listOf("Ambulancia en el hospital", "Ambulancia en camino"), alerts.map { it.title })
        assertEquals("Prioridad Roja · despachada a las 08:40 · reporte prehospital enviado", alerts[1].detail)
        assertEquals("Despachada a las 08:00", alerts[0].detail)
        val parsed = AmbulanceParser.arrivals(JSONObject().put("services", JSONArray().put(JSONObject().put("serviceId", "s").put("dispatchedAt", "x").put("active", true).put("arrived", false).put("priority", "naranja").put("hasPrehospital", true))))
        assertEquals("naranja", parsed.single().priority)
        assertTrue(parsed.single().hasPrehospital)
    }

    @Test fun fechaCortaDelEncabezado() {
        assertEquals("Vie 20 nov", HospitalClockText.shortDate(now))
    }
}
