package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** ENF/AST audit: ward ranking, bed board order, date labels, signed discharge in the vitals flow and nursing Inicio. */
class NursingFlowTest {
    private val now = Instant.parse("2026-11-18T18:00:00Z") // 12:00 in El Salvador, Wednesday
    private fun admission(id: String, state: String = "hospitalizado", bed: String = "", unstable: Boolean = false, requested: String? = null, patient: String = id) =
        HospitalAdmission(id, patient, state, bed, "general", false, 1, dischargeRequestedAt = requested, unstable = unstable, patientId = "p-$id")

    // --- shared ward ranking (ENF and MED) ------------------------------------------------------------------------

    @Test fun laPlantaOrdenaAltaPedidaAltaFirmadaInestableYLuegoPorCama() {
        val rows = listOf(
            admission("c10", bed = "C-10"),
            admission("c2", bed = "C-2"),
            admission("sin", state = "pendiente_cama"),
            admission("firmada", state = "alta_firmada", bed = "C-9"),
            admission("pedida", bed = "C-11", requested = "2026-11-18T15:00:00Z"),
            admission("grave", bed = "C-12", unstable = true),
            admission("cerrada", state = "egresado", bed = "C-1"),
        )
        assertEquals(listOf("pedida", "firmada", "grave", "c2", "c10", "sin", "cerrada"), HospitalizationRules.wardOrder(rows).map { it.id })
    }

    @Test fun laCamaSeComparaEnOrdenNaturalYSinCamaVaAlFinal() {
        assertTrue(HospitalizationRules.compareBeds("HAB-2", "HAB-10") < 0)
        assertTrue(HospitalizationRules.compareBeds("", "HAB-1") > 0)
        assertEquals(0, HospitalizationRules.compareBeds("", ""))
    }

    @Test fun elPrincipalDeLaPlantaEsLaPrimeraFilaOrdenadaConAccion() {
        val exit = admission("firmada", state = "alta_firmada", bed = "C-9").copy(allowedActions = setOf(AdmissionAction.REGISTER_EXIT))
        val bed = admission("sin", state = "pendiente_cama").copy(allowedActions = setOf(AdmissionAction.ASSIGN_BED))
        assertEquals("firmada", HospitalizationRules.primaryAdmission(HospitalizationRules.wardOrder(listOf(bed, exit))))
    }

    // --- alta firmada in the vitals flow ----------------------------------------------------------------------------

    @Test fun conAltaFirmadaAunSeTomanSignosDesdeLaPlanta() {
        assertNotNull(HospitalizationRules.vitalsSubject(admission("a", state = "alta_firmada", bed = "C-9")))
        assertEquals("Cama C-9", HospitalizationRules.vitalsSubject(admission("a", state = "alta_firmada", bed = "C-9"))!!.detail)
        assertNull(HospitalizationRules.vitalsSubject(admission("b", state = "egresado")))
    }

    // --- bed board ---------------------------------------------------------------------------------------------------

    @Test fun elTableroPoneVerificarYTerminarLimpiezaPrimero() {
        val permissions = setOf("camas.registrar_limpieza", "camas.verificar_limpieza")
        val beds = listOf(
            Bed("1", "A-1", "A", "libre", 1),
            Bed("2", "A-2", "A", "limpieza", 1, cleaningPending = true),
            Bed("3", "A-3", "A", "ocupada", 1),
            Bed("4", "A-4", "A", "limpieza", 1, cleaningPending = true, cleaningCompleted = true),
        )
        val (actionable, rest) = BedRules.boardGroups(beds, permissions)
        assertEquals(listOf("A-4", "A-2"), actionable.map { it.code })
        assertEquals(listOf("A-1", "A-3"), rest.map { it.code })
        // Without permission to clean nothing is actionable and the server order stays.
        assertEquals(beds, BedRules.boardGroups(beds, emptySet()).second)
    }

    // --- date labels --------------------------------------------------------------------------------------------------

    @Test fun lasFechasSonCortasYSinAnio() {
        assertEquals("Hoy 11:30", VitalsFormat.time(Instant.parse("2026-11-18T17:30:00Z"), now))
        assertEquals("Ayer 08:05", VitalsFormat.time(Instant.parse("2026-11-17T14:05:00Z"), now))
        val older = VitalsFormat.time(Instant.parse("2026-11-16T14:05:00Z"), now)
        assertTrue(older, older.startsWith("lun 16 nov") && older.endsWith(", 08:05"))
        assertTrue(!older.contains("2026"))
        assertEquals("Hoy", VitalsFormat.dayLabel(LocalDate.of(2026, 11, 18), now))
        assertEquals("—", VitalsFormat.time(null, now))
    }

    @Test fun elHistorialSeAgrupaPorDiaDelMasRecienteAlMasAntiguo() {
        fun reading(id: String, at: String) = VitalReading(id, Instant.parse(at), null, false, emptyMap(), null)
        val history = VitalsHistory("p", "Ana", "EXP", null, null, null, listOf(
            reading("r1", "2026-11-18T17:00:00Z"), reading("r2", "2026-11-18T13:00:00Z"), reading("r3", "2026-11-17T13:00:00Z"), reading("r4", "2026-11-10T13:00:00Z"),
        ))
        val days = history.days(now)
        assertEquals(listOf("Hoy", "Ayer"), days.take(2).map { it.label })
        assertEquals(listOf(2, 1, 1), days.map { it.readings.size })
    }

    @Test fun laBusquedaPoneEnContextoPrimero() {
        val results = listOf(VitalsCandidate("x", "Xavier", null), VitalsCandidate("p1", "Ana", null), VitalsCandidate("y", "Yolanda", null))
        assertEquals(listOf("p1", "x", "y"), VitalsParser.rankByContext(results, setOf("p1")).map { it.patientId })
    }

    // --- nursing and assistant Inicio -----------------------------------------------------------------------------------

    private val enf = setOf(
        "sesion.perfil", "camas.ver_tablero", "camas.registrar_limpieza", "admision.ver", "admision.registrar_salida", "inventario.ver",
        "ambulancia.recibir_prehospital", "signos.registrar", "turnos.ver",
    )

    @Test fun enfermeriaLeeLaLlegadaDeAmbulanciaNoElEstado() {
        val sources = RoleDashboard.sources("ENF", enf)
        assertTrue(DashboardSource.ARRIVALS in sources)
        assertTrue(DashboardSource.AMBULANCE !in sources)
        val coming = JSONObject().put("services", JSONArray().put(JSONObject().put("serviceId", "s1").put("dispatchedAt", "2026-11-18T17:00:00Z").put("active", true).put("arrived", false)))
        val sections = AndroidSections.visible("ENF", enf)
        if (AndroidSection.AMBULANCE_RECEPTION in sections) {
            val model = RoleDashboard.build("ENF", enf, mapOf(DashboardSource.ARRIVALS to coming), now = now)
            // D25: the ambulance is a red alert card of its own, not a row of "Requiere tu atención".
            assertEquals("Ambulancia en camino", model.alerts.single().title)
            assertEquals(AndroidSection.AMBULANCE_RECEPTION, model.alerts.single().request.section)
            assertTrue(model.attention.none { it.title.startsWith("Ambulancia") })
        }
    }

    @Test fun enfermeriaVaALimpiezaYVeLasAltasSinSalida() {
        val beds = JSONArray().put(JSONObject().put("state", "limpieza")).put(JSONObject().put("state", "libre"))
        val admissions = JSONArray()
            .put(JSONObject().put("state", "alta_firmada").put("allowedActions", JSONArray().put("registrar_salida")))
            .put(JSONObject().put("state", "pendiente_cama"))
        val model = RoleDashboard.build("ENF", enf, mapOf(DashboardSource.BEDS to beds, DashboardSource.ADMISSIONS to admissions), now = now)
        val cleaning = model.attention.first { it.title == "1 cama en limpieza" }
        assertEquals("Ver limpieza", cleaning.actionLabel)
        val sections = AndroidSections.visible("ENF", enf)
        if (AndroidSection.CLEANING in sections) assertEquals(AndroidSection.CLEANING, cleaning.request.section)
        if (AndroidSection.WARD in sections) assertTrue(model.attention.any { it.title == "1 alta firmada sin salida" })
        assertTrue(model.kpis.none { it.label == "Admisiones sin cama" })
    }

    @Test fun elAsistenteCuentaSoloLaFilaDeSuPuesto() {
        val ast = setOf("sesion.perfil", "fila.ver", "fila.llamar", "fila.gestionar", "turnos.ver", "signos.registrar")
        assertTrue(DashboardSource.MY_POST in RoleDashboard.sources("AST", ast))
        val queue = JSONArray()
            .put(JSONObject().put("state", "en_espera").put("service", "consulta_general"))
            .put(JSONObject().put("state", "en_espera").put("service", "emergencia"))
            .put(JSONObject().put("state", "en_espera").put("service", "emergencia"))
        val post = JSONObject().put("service", "consulta_general").put("officeId", JSONObject.NULL).put("officeCode", JSONObject.NULL).put("areaName", JSONObject.NULL)
        val mine = RoleDashboard.build("AST", ast, mapOf(DashboardSource.QUEUE to queue, DashboardSource.MY_POST to post), now = now)
        assertEquals(1, mine.charts.first { it.title == "Fila del día" }.slices.first { it.label == "En espera" }.value)
        val whole = RoleDashboard.build("AST", ast, mapOf(DashboardSource.QUEUE to queue), now = now)
        assertEquals(3, whole.charts.first { it.title == "Fila del día" }.slices.first { it.label == "En espera" }.value)
    }
}
