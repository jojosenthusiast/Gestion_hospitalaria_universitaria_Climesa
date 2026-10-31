package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftPlanningRulesTest {
    private val jefe = listOf("sesion.perfil", "turnos.ver", "turnos.ver_borradores", "turnos.planificar", "turnos.publicar")
    private val form = ShiftForm("p1", "a1", "2026-11-10", "07:00", "2026-11-10", "15:00", "diurno", "")
    private val shift = PlannedShift("t1", "p1", "Ana Prueba", "a1", "Emergencia", "2026-11-10T13:00:00.000Z", "2026-11-10T21:00:00.000Z", "diurno", "borrador", null, 3)

    @Test fun planificarYPublicarSalenDeLosPermisosDelCatalogo() {
        assertTrue(ShiftPlanning.canPlan(jefe))
        assertTrue(ShiftPlanning.canPublish(jefe))
        assertFalse(ShiftPlanning.canPlan(listOf("turnos.ver", "turnos.publicar")))
        assertFalse(ShiftPlanning.canPublish(listOf("turnos.ver", "turnos.planificar")))
        assertFalse(ShiftPlanning.canPlan(listOf("turnos.planificar")))
    }

    @Test fun laPantallaSeOfreceAQuienPlanificaPublicaOVeBorradoresSiempreConTurnosVer() {
        assertTrue(ShiftPlanning.canView(jefe))
        assertTrue(ShiftPlanning.canView(listOf("turnos.ver", "turnos.ver_borradores")))
        assertFalse(ShiftPlanning.canView(listOf("turnos.ver")))
        assertFalse(ShiftPlanning.canView(listOf("turnos.planificar")))
    }

    @Test fun elFormularioExigeCamposYHorasValidas() {
        assertNull(ShiftPlanning.formError(form))
        assertNotNull(ShiftPlanning.formError(form.copy(staffId = "")))
        assertNotNull(ShiftPlanning.formError(form.copy(areaId = "")))
        assertNotNull(ShiftPlanning.formError(form.copy(startDate = "10/11/2026")))
        assertNotNull(ShiftPlanning.formError(form.copy(startTime = "7:00")))
        assertNotNull(ShiftPlanning.formError(form.copy(endTime = "07:00")))
        assertNotNull(ShiftPlanning.formError(form.copy(endTime = "06:00")))
        assertNotNull(ShiftPlanning.formError(form.copy(justification = "x".repeat(501))))
    }

    @Test fun elCuerpoDeCrearUsaElHorarioDeElSalvadorConZona() {
        val body = ShiftPlanning.createBody(form)
        assertEquals("2026-11-10T07:00:00-06:00", body.getString("start"))
        assertEquals("2026-11-10T15:00:00-06:00", body.getString("end"))
        assertEquals("diurno", body.getString("type"))
        assertFalse(body.has("version"))
        assertFalse(body.has("justification"))
        assertEquals("Nota larga", ShiftPlanning.createBody(form.copy(justification = " Nota larga ")).getString("justification"))
    }

    @Test fun editarLlevaVersionYMotivoYElMotivoEsObligatorio() {
        val body = ShiftPlanning.editBody(form, shift, " Cambio de sala ")
        assertEquals(3, body.getInt("version"))
        assertEquals("Cambio de sala", body.getString("reason"))
        assertFalse(body.has("state"))
        assertNotNull(ShiftPlanning.reasonError("corto"))
        assertNull(ShiftPlanning.reasonError("a".repeat(10)))
        assertNotNull(ShiftPlanning.reasonError("a".repeat(501)))
    }

    @Test fun cancelarEnviaElMismoTurnoConEstadoCanceladoVersionYMotivo() {
        val body = ShiftPlanning.cancelBody(shift, " Falta de personal ")
        assertEquals("cancelado", body.getString("state"))
        assertEquals(3, body.getInt("version"))
        assertEquals("Falta de personal", body.getString("reason"))
        assertEquals("p1", body.getString("staffId"))
        assertEquals("a1", body.getString("areaId"))
        assertEquals("2026-11-10T13:00:00.000Z", body.getString("start"))
        assertEquals("diurno", body.getString("type"))
    }

    @Test fun soloSeCancelanBorradoresYPublicados() {
        assertTrue(ShiftPlanning.cancellable("borrador"))
        assertTrue(ShiftPlanning.cancellable("publicado"))
        assertFalse(ShiftPlanning.cancellable("cancelado"))
        assertFalse(ShiftPlanning.cancellable("completado"))
        assertFalse(ShiftPlanning.cancellable("en_curso"))
    }

    @Test fun elRangoDePublicacionNoPasaDe31DiasNiVaAlReves() {
        assertNull(ShiftPlanning.publishError("2026-11-10", "2026-11-16"))
        assertNull(ShiftPlanning.publishError("2026-11-01", "2026-12-01"))
        assertNotNull(ShiftPlanning.publishError("2026-11-01", "2026-12-02"))
        assertNotNull(ShiftPlanning.publishError("2026-11-16", "2026-11-10"))
        assertNotNull(ShiftPlanning.publishError("", "2026-11-10"))
        assertNotNull(ShiftPlanning.publishError("2026-11-10", "16-11-2026"))
    }

    @Test fun publicarEnviaElRangoYElAreaSoloSiSeEligio() {
        assertFalse(ShiftPlanning.publishBody("2026-11-10", "2026-11-16", null).has("areaId"))
        assertEquals("a1", ShiftPlanning.publishBody("2026-11-10", "2026-11-16", "a1").getString("areaId"))
    }

    @Test fun leeLosTurnosYLosFormateaEnHorarioLocal() {
        val rows = JSONArray().put(JSONObject().put("id", "t1").put("staffId", "p1").put("person", "Ana Prueba").put("areaId", "a1").put("area", "Emergencia")
            .put("start", "2026-11-10T13:00:00.000Z").put("end", "2026-11-10T21:00:00.000Z").put("type", "guardia").put("state", "publicado").put("version", 2))
        val parsed = ShiftPlanning.parseShifts(rows).single()
        assertEquals("Ana Prueba", parsed.person)
        assertEquals(2, parsed.version)
        assertNull(parsed.justification)
        val f = ShiftPlanning.formOf(parsed)
        assertEquals("2026-11-10", f.startDate)
        assertEquals("07:00", f.startTime)
        assertEquals("15:00", f.endTime)
        assertEquals("Guardia", ShiftPlanning.typeLabel("guardia"))
    }

    @Test fun elPersonalYLasAreasSoloOfrecenActivosYTiposDeArea() {
        val staff = JSONArray().put(JSONObject().put("id", "p1").put("givenNames", "Ana").put("surnames", "Prueba").put("type", "medico").put("active", true))
            .put(JSONObject().put("id", "p2").put("givenNames", "Beto").put("surnames", "Baja").put("type", "medico").put("active", false))
        assertEquals(listOf(StaffOption("p1", "Ana Prueba · Médico")), ShiftPlanning.parseStaff(staff))
        val spaces = JSONArray()
            .put(JSONObject().put("id", "a1").put("code", "EMG").put("name", "Emergencia").put("type", "area").put("active", true))
            .put(JSONObject().put("id", "b1").put("code", "C-101").put("name", "Cama 101").put("type", "cama").put("active", true))
            .put(JSONObject().put("id", "a2").put("code", "OLD").put("name", "Cerrada").put("type", "area").put("active", false))
        assertEquals(listOf(AreaOption("a1", "EMG · Emergencia")), ShiftPlanning.parseAreas(spaces))
    }

    @Test fun elResultadoDeLaPublicacionTraeLosHuecosDeCobertura() {
        val json = JSONObject().put("from", "2026-11-10").put("to", "2026-11-16").put("published", 4).put("warnings", JSONArray().put(
            JSONObject().put("areaId", "a1").put("area", "Emergencia").put("role", "enfermero").put("start", "2026-11-10T13:00:00.000Z").put("end", "2026-11-10T14:00:00.000Z").put("required", 2).put("actual", 1)))
        val summary = ShiftPlanning.parseSummary(json)
        assertEquals(4, summary.published)
        val gap = summary.gaps.single()
        assertEquals(1, gap.missing)
        assertEquals("Emergencia · Enfermería · 10/11/2026 07:00 a 08:00: faltan 1 (mínimo 2, programadas 1)", ShiftPlanning.gapText(gap))
        assertTrue(ShiftPlanning.summaryText(summary).startsWith("Se publicaron 4 turnos del 2026-11-10 al 2026-11-16."))
        assertEquals("No había turnos en borrador en ese rango.", ShiftPlanning.summaryText(summary.copy(published = 0, gaps = emptyList())))
    }
}
