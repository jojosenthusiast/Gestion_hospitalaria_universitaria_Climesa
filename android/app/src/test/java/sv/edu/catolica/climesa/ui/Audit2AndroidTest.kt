package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionEvents
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.HospitalAdmission
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.PatientSummary
import sv.edu.catolica.climesa.domain.PortalEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.WardEvents

/** Second code audit (2026-11-20), Android items D1-D13 with logic a JVM test can pin. */
@OptIn(ExperimentalCoroutinesApi::class)
class Audit2AndroidTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }
    private fun bed(id: String, code: String) = JSONObject().put("id", id).put("version", 1).put("code", code).put("room", "H-1").put("category", "semiprivada").put("reason", "")

    /** D1: a bed taken meanwhile re-reads the suggestions and keeps the error in the open dialog. */
    @Test fun aTakenBedReloadsTheSuggestionsKeepingTheError() = runTest(dispatcher) {
        val admission = HospitalAdmission("ad1", "Ana", "pendiente_cama", "", "semiprivada", false, 2)
        val api = FakeGateway(JSONArray().put(JSONObject().put("id", "ad1").put("patientName", "Ana").put("state", "pendiente_cama").put("version", 2)))
        api.responses["/admisiones/ad1/sugerencias-cama"] = JSONArray().put(bed("b1", "C-101"))
        api.failures["/admisiones/ad1/cama"] = AuthRequestException("La cama ya fue ocupada.", 409, "cama_ocupada")
        val vm = HospitalizationViewModel(api, quiet)
        vm.open(admission); runCurrent()
        assertEquals("b1", vm.state.value.suggestions.single().id)
        api.responses["/admisiones/ad1/sugerencias-cama"] = JSONArray().put(bed("b2", "C-102"))
        vm.assign(admission, vm.state.value.suggestions.single()); runCurrent()
        assertEquals("b2", vm.state.value.suggestions.single().id)
        assertNotNull(vm.state.value.formError)
        assertEquals("ad1", vm.state.value.selectedId)
        assertTrue(HospitalizationRules.staleCode("cama_ocupada"))
        // Previous stale codes still count.
        assertTrue(HospitalizationRules.staleCode("version_conflicto"))
        assertFalse(HospitalizationRules.staleCode("validacion"))
    }

    /** D2: the guide goes back to the bed step with a fresh map when the bed was taken at confirm. */
    @Test fun aTakenBedAtConfirmGoesBackToTheBedStep() = runTest(dispatcher) {
        val api = FakeGateway().apply {
            responses["/pacientes/selector?query=nueve&limit=10&offset=0"] = JSONObject("""{"items":[{"id":"p9","record":"EXP-9","fullName":"Paciente Ficticio Nueve","age":41}],"hasMore":false}""")
            responses["/admisiones/origenes?patientId=p9"] = JSONArray("""[{"id":"c1","origin":"cita","label":"Cita","detail":"Dra. Ficticia"}]""")
            responses["/admisiones/mapa-camas?patientId=p9"] = JSONObject("""{"categories":[{"category":"semiprivada","free":2,"compatible":1}],"beds":[]}""")
            responses["/admisiones/mapa-camas?patientId=p9&isolation=false&category=semiprivada"] = JSONObject("""{"categories":[],"beds":[
                {"id":"b1","version":3,"code":"C-201","roomId":"r1","room":"H-201","floor":2,"category":"semiprivada","capacity":2,"compatible":true,"reason":null,"suggested":true}]}""")
            failures["/admisiones"] = AuthRequestException("Otra persona tomó esta cama.", 409, "cama_ocupada")
        }
        val vm = AdmissionIntakeViewModel(api, quiet); vm.debounceMs = 0
        vm.open(); vm.query("nueve"); advanceUntilIdle()
        vm.pickPatient(vm.state.value.results.single()); vm.next(true); runCurrent()
        vm.pickOrigin(OriginKind.APPOINTMENT); vm.pickRecord(vm.state.value.origins.single()); vm.motive("Dolor abdominal con fiebre"); vm.next(true)
        vm.at(AdmissionIntake.nowLocal()); advanceUntilIdle()
        val instant = AdmissionIntake.instantOf(vm.state.value.draft.at)!!
        api.responses["/admisiones/medicos-disponibles?at=${java.net.URLEncoder.encode(instant.toString(), "UTF-8")}"] = JSONArray("""[{"id":"d1","name":"Dra. Ficticia","specialty":null,"available":true,"reason":null}]""")
        vm.at(AdmissionIntake.nowLocal()); advanceUntilIdle()
        vm.pickDoctor(vm.state.value.doctors.first()); vm.next(true); runCurrent()
        vm.pickCategory("semiprivada"); vm.next(true); vm.next(true); runCurrent()
        assertEquals("b1", vm.state.value.draft.bed?.id)
        vm.next(true)
        api.responses[AdmissionIntake.feasibilityPath(vm.state.value.draft, true)!!] = JSONObject("""{"feasible":true,"checks":[]}""")
        vm.next(true); runCurrent()
        assertEquals(AdmissionIntake.LAST_STEP, vm.state.value.step)
        val mapReads = api.gets("/admisiones/mapa-camas?patientId=p9&isolation=false&category=semiprivada")
        vm.confirm(true); runCurrent()
        assertEquals(5, vm.state.value.step)
        assertEquals("Otra persona tomó esta cama.", vm.state.value.error)
        assertEquals(mapReads + 1, api.gets("/admisiones/mapa-camas?patientId=p9&isolation=false&category=semiprivada"))
        assertFalse(vm.state.value.busy)
        assertFalse(vm.state.value.finished)
    }

    /** D6: the history card names a lab order with the lab's own label, not the shared "Pendiente de iniciar". */
    @Test fun labOrdersUseTheLabLabel() {
        assertEquals("Pendiente", LaboratoryLabels.state("pendiente"))
        assertNotEquals(StatusCatalog.label("pendiente"), LaboratoryLabels.state("pendiente"))
        assertEquals("En Proceso", LaboratoryLabels.state("en_proceso"))
    }

    /** D7: same names as the web and iOS. */
    @Test fun statusCatalogKnowsTheMetricStates() {
        assertEquals("En orden", StatusCatalog.label("ok"))
        assertEquals("Atendido", StatusCatalog.label("atendido"))
        assertEquals("Requiere atención", StatusCatalog.label("requiere_atencion"))
        assertEquals("Atendida", StatusCatalog.label("atendida"))
    }

    /** D8: the home summary and the ward listen to what changes them; history keeps ignoring bed events. */
    @Test fun liveFiltersCoverTheHomeAndTheWard() {
        listOf("personal", "usuario", "turno", "admision").forEach { entity ->
            assertTrue(entity, PortalEvents.matches("/inicio", EventoDominio("$entity.actualizado", entity, "x", 1)))
        }
        assertTrue(PortalEvents.matches("/inicio", EventoDominio("cama.estado_cambiado", "cama", "b1", 1)))
        assertFalse(PortalEvents.matches("/inicio", EventoDominio("inventario.actualizado", "articulo", "a1", 1)))
        assertTrue(WardEvents.matches(EventoDominio("cama.estado_cambiado", "cama", "b1", 1)))
        assertTrue(WardEvents.matches(EventoDominio("admision.actualizada", "admision", "ad1", 1)))
        assertFalse(AdmissionEvents.matches(EventoDominio("cama.estado_cambiado", "cama", "b1", 1)))
    }

    /** D9: "today" is the hospital's day (UTC-6), never the UTC day. */
    @Test fun agesCountOnTheHospitalDay() {
        val lateEvening = java.time.Clock.fixed(java.time.Instant.parse("2026-11-21T03:00:00Z"), java.time.ZoneOffset.UTC)
        val today = ReceptionScheduling.today(lateEvening)
        assertEquals(java.time.LocalDate.parse("2026-11-20"), today)
        // Birthday tomorrow in El Salvador: still 29 there, although it is already the 21st in UTC.
        assertEquals(29, PatientSummary.age(java.time.LocalDate.parse("1996-11-21"), today))
        assertEquals(PatientSummary.age(java.time.LocalDate.parse("1990-01-01"), ReceptionScheduling.today()), PatientSummary.age(java.time.LocalDate.parse("1990-01-01")))
    }

    /** D13: removing a pending row keeps the keys of the others, so their «Otro» state stays with them. */
    @Test fun pendingRowsKeepTheirKeys() {
        val keys = PendingRowKeys()
        keys.sync(3)
        val (first, third) = keys[0] to keys[2]
        keys.remove(1); keys.sync(2)
        assertEquals(first, keys[0]); assertEquals(third, keys[1])
        keys.sync(3)
        assertFalse(keys[2] == first || keys[2] == third)
    }
}
