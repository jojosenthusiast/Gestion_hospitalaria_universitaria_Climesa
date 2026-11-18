package sv.edu.catolica.climesa.ui

import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.DraftStore
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.DashboardSource
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RoleDashboard

/** Keeps drafts in memory, per user and key. */
internal class MemoryDrafts : DraftStore {
    val data = mutableMapOf<Pair<String, String>, JSONObject>()
    override fun save(userId: String, key: String, value: JSONObject): Boolean { data[userId to key] = value; return true }
    override fun load(userId: String, key: String) = data[userId to key]
    override fun clear(userId: String, key: String) { data.remove(userId to key) }
    override fun retainOnly(userId: String, keep: Set<String>) { data.keys.removeAll { it.first != userId && it.second !in keep } }
    override fun clearAll(keep: Set<String>) { data.keys.removeAll { it.second !in keep } }
    override fun expire(keys: Set<String>, before: Long) = Unit
}

/** R7 U2, journeys G2 (the patient sees their pending link request) and G6 (patient Inicio). */
@OptIn(ExperimentalCoroutinesApi::class)
class PatientHomeJourneysTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }
    private val notFound = AuthRequestException("No encontrado", 404, "no_encontrado")

    // G2 (the patient sees the real state of the link request, from `GET /me/vinculacion`) is covered in SweepU9AndroidTest.

    private val now = Instant.parse("2026-11-16T15:00:00Z")
    private val permissions = listOf("sesion.perfil", "citas.ver", "citas.solicitar", "resultados.ver", "fila.ver", "cuenta.vincular", "ambulancia.solicitar")
    private fun rows(vararg r: JSONObject) = JSONArray().apply { r.forEach { put(it) } }

    // "Cuenta sin vincular. Se espera 'Vincular' primero."
    @Test fun unlinkedPatientSeesLinkFirst() {
        val model = RoleDashboard.build("PAC", permissions, mapOf(DashboardSource.APPOINTMENTS to rows()), now = now, linked = false)
        assertEquals(AndroidSection.LINK_RECORD, model.attention.first().request.section)
    }

    @Test fun withoutAppointmentsPedirCitaIsTheAction() {
        val model = RoleDashboard.build("PAC", permissions, mapOf(DashboardSource.APPOINTMENTS to rows()), now = now)
        val ask = model.attention.single { it.actionLabel == "Pedir cita" }
        assertEquals(QuickAction.REQUEST_APPOINTMENT, ask.request.action)
        assertTrue(model.kpis.none { it.label == "Próxima cita" })
    }

    @Test fun todayTheTicketAndTheAppointmentComeFirst() {
        val model = RoleDashboard.build("PAC", permissions, mapOf(
            DashboardSource.QUEUE to rows(JSONObject().put("state", "en_espera").put("numero", 12).put("service", "consulta_general").put("area", "CON")),
            DashboardSource.APPOINTMENTS to rows(JSONObject().put("state", "confirmada").put("start", "2026-11-16T15:20:00Z").put("doctorName", "Dra. Ejemplo")),
        ), now = now)
        assertEquals("Tu número CON 12", model.attention[0].title)
        assertEquals("Hoy tienes cita", model.attention[1].title)
        assertEquals("09:20 · Dra. Ejemplo", model.attention[1].detail)
    }

    // "Un resultado liberado hoy. Se espera 'Resultados nuevos (1)'": the old history does not count.
    @Test fun onlyRecentResultsCountAsNew() {
        val model = RoleDashboard.build("PAC", permissions, mapOf(
            DashboardSource.MY_LAB to rows(
                JSONObject().put("state", "completado").put("reviewedAt", "2026-11-16T10:00:00Z"),
                JSONObject().put("state", "completado").put("reviewedAt", "2026-09-01T10:00:00Z"),
            ),
        ), now = now)
        assertTrue(model.attention.any { it.title == "Resultados nuevos (1)" })
    }

    // Inicio adds only what the bar lacks: no "Mi turno" or "Mis exámenes" chip (they are tabs).
    @Test fun patientShortcutsAreAppointmentAmbulanceAndHospital() {
        val labels = RoleDashboard.build("PAC", permissions, emptyMap(), now = now).actions.map { it.label }
        assertEquals(listOf("Pedir cita", "Pedir ambulancia", "Hospital"), labels)
    }

    // One primary action: with "No tienes citas próximas · Pedir cita" pending, the "Pedir cita" chip is not repeated.
    @Test fun pedirCitaIsNotRepeatedWhenAPendingRowOffersIt() {
        val model = RoleDashboard.build("PAC", permissions, mapOf(DashboardSource.APPOINTMENTS to rows()), now = now)
        assertTrue(model.attention.any { it.actionLabel == "Pedir cita" })
        assertEquals(listOf("Pedir ambulancia", "Hospital"), model.actions.map { it.label })
    }

    // Unlinked, the API refuses requests ("La cuenta no está vinculada"): no "Pedir cita" anywhere on Inicio.
    @Test fun unlinkedPatientIsNotOfferedPedirCita() {
        val model = RoleDashboard.build("PAC", permissions + "admision.ver", emptyMap(), now = now, linked = false)
        assertTrue(model.actions.none { it.label == "Pedir cita" })
        assertTrue(model.attention.none { it.actionLabel == "Pedir cita" })
    }

    // Inicio reads the same explicit window as "Mis citas"; other roles keep their paths.
    @Test fun patientDashboardReadsAppointmentsOverTheExplicitWindow() {
        val today = LocalDate.parse("2026-11-18")
        assertEquals("/citas?from=2026-09-20&to=2026-12-21", RoleDashboard.path("PAC", DashboardSource.APPOINTMENTS, today))
        assertEquals("/citas", RoleDashboard.path("REC", DashboardSource.APPOINTMENTS, today))
        assertTrue(DashboardSource.ADMISSIONS in RoleDashboard.sources("PAC", listOf("citas.ver", "admision.ver")))
    }

    // «Mi habitación» on Inicio while hospitalized, like iOS.
    @Test fun hospitalizedPatientSeesTheirBedOnInicio() {
        val model = RoleDashboard.build("PAC", permissions + "admision.ver", mapOf(
            DashboardSource.ADMISSIONS to rows(JSONObject().put("id", "ad1").put("state", "hospitalizado").put("bed", "2-04A")),
        ), now = now)
        val room = model.kpis.single { it.label == "Mi habitación" }
        assertEquals("Cama 2-04A", room.value)
        assertEquals(AndroidSection.MY_ROOM, room.target)
    }
}
