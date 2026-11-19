package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.PatientDetails
import sv.edu.catolica.climesa.data.PatientRepository
import sv.edu.catolica.climesa.data.PatientSearchResult
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.PatientAction
import sv.edu.catolica.climesa.domain.PatientDraft
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.Registry
import sv.edu.catolica.climesa.domain.SlotStatus
import java.time.LocalDate

private class QuietBus : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }

@OptIn(ExperimentalCoroutinesApi::class)
class ReceptionAppointmentsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun gateway() = FakeGateway().apply {
        responses["/citas/catalogos?date=2026-11-20"] = JSONObject("""{"doctors":[
            {"id":"d1","givenNames":"Ana","surnames":"Ruiz","active":true,"tieneTurno":true},
            {"id":"d2","givenNames":"Luis","surnames":"Mena","active":true,"tieneTurno":false,"motivo":"Sin turno ese día"}]}""")
        responses["/citas/disponibilidad?doctorId=d1&date=2026-11-20"] = JSONObject("""{"franjas":[
            {"start":"2026-11-20T14:00:00Z","end":"2026-11-20T14:20:00Z","estado":"ocupado","motivo":"Ocupado"},
            {"start":"2026-11-20T14:20:00Z","end":"2026-11-20T14:40:00Z","estado":"libre","motivo":null}]}""")
        responses["/pacientes/selector?query=mar%C3%ADa&limit=10&offset=0"] = JSONObject("""{"items":[{"id":"p1","record":"0000001-X","fullName":"María Alejandra","age":34}],"offset":0,"limit":10,"hasMore":false}""")
    }
    private fun model(api: FakeGateway) = ReceptionAppointmentsViewModel(api, QuietBus()).also { it.debounceMs = 0; it.selectDate(LocalDate.of(2026, 11, 20)) }

    @Test fun searchWaitsForTwoCharactersAndShowsAllMatches() = runTest(dispatcher) {
        val api = gateway(); val vm = model(api); vm.openScheduling(); advanceUntilIdle()
        vm.query("m"); advanceUntilIdle()
        assertTrue(api.calls.none { it.first.startsWith("/pacientes/selector") })
        vm.query("maría"); advanceUntilIdle()
        assertEquals(listOf("María Alejandra"), vm.state.value.results.map { it.name })
    }

    @Test fun aDoctorWithoutShiftCannotBePickedAndSlotsKeepTheirState() = runTest(dispatcher) {
        val api = gateway(); val vm = model(api); vm.openScheduling(); vm.selectDate(LocalDate.of(2026, 11, 20)); advanceUntilIdle()
        val noShift = vm.state.value.doctors.first { it.id == "d2" }
        assertFalse(noShift.hasShift)
        vm.pickDoctor(noShift); advanceUntilIdle()
        assertNull(vm.state.value.doctor)
        vm.pickDoctor(vm.state.value.doctors.first { it.id == "d1" }); advanceUntilIdle()
        assertEquals(listOf(SlotStatus.BUSY, SlotStatus.FREE), vm.state.value.slots.map { it.status })
        vm.pickSlot(vm.state.value.slots[0]); assertNull(vm.state.value.slot)
        vm.pickSlot(vm.state.value.slots[1]); assertEquals("2026-11-20T14:20:00Z", vm.state.value.slot?.start)
    }

    @Test fun confirmingPostsTheAppointment() = runTest(dispatcher) {
        val api = gateway(); val vm = model(api); vm.openScheduling(); vm.selectDate(LocalDate.of(2026, 11, 20))
        vm.query("maría"); advanceUntilIdle(); vm.pickPatient(vm.state.value.results.single())
        vm.pickDoctor(vm.state.value.doctors.first { it.id == "d1" }); advanceUntilIdle()
        assertFalse(vm.state.value.canConfirm)
        vm.pickSlot(vm.state.value.slots[1]); vm.reason("control"); assertTrue(vm.state.value.canConfirm)
        vm.confirm(); advanceUntilIdle()
        val body = api.calls.single { it.first == "/citas" && it.second == "POST" }.third!!
        assertEquals("p1", body.getString("patientId")); assertEquals("d1", body.getString("doctorId")); assertEquals("2026-11-20T14:20:00Z", body.getString("start"))
        assertFalse(vm.state.value.scheduling)
    }

    @Test fun aFailedConfirmationKeepsTheFormAndReloadsTheDay() = runTest(dispatcher) {
        val api = gateway(); val vm = model(api); vm.openScheduling(); vm.selectDate(LocalDate.of(2026, 11, 20))
        vm.query("maría"); advanceUntilIdle(); vm.pickPatient(vm.state.value.results.single())
        vm.pickDoctor(vm.state.value.doctors.first { it.id == "d1" }); advanceUntilIdle(); vm.pickSlot(vm.state.value.slots[1])
        api.failures["/citas"] = AuthRequestException("La franja ya fue ocupada.", 409)
        vm.confirm(); advanceUntilIdle()
        assertTrue(vm.state.value.scheduling)
        assertEquals("La franja ya fue ocupada.", vm.state.value.error)
        assertNull(vm.state.value.slot)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ReceptionRegistrationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class Repo : PatientRepository {
        override val remote = true
        var searches = 0; var saves = mutableListOf<Boolean>(); val emails = mutableListOf<String?>(); var failWith: Exception? = null
        override suspend fun load() = Registry(emptyList())
        override suspend fun update(transform: (Registry) -> Registry) = throw UnsupportedOperationException()
        override suspend fun search(query: String) = PatientSearchResult(Registry(emptyList()), "tok", java.time.Instant.now().epochSecond + 600).also { searches++ }
        override suspend fun save(draft: PatientDraft, id: String?, version: Int?, reason: String, token: String?, query: String, confirmNew: Boolean): PatientDetails {
            saves += confirmNew; emails += draft.email; failWith?.let { throw it }
            return PatientDetails(sv.edu.catolica.climesa.domain.Patient(id = "p9", record = "9", givenNames = draft.givenNames, surnames = draft.surnames, dui = null, birth = null, sex = draft.sex, phone = ""), emptyList())
        }
        override suspend fun detail(id: String) = throw UnsupportedOperationException()
    }

    @Test fun registeringSearchesFirstAndPrefillsTheForm() = runTest(dispatcher) {
        val repo = Repo(); val vm = ReceptionViewModel(repo, QuietBus()); vm.setPermissions(listOf("pacientes.buscar", "pacientes.registrar"))
        vm.query("Pedro Gomez"); vm.newPatient(); advanceUntilIdle()
        assertEquals(1, repo.searches)
        assertTrue(vm.state.value.formOpen)
        assertEquals("Pedro", vm.state.value.draft.givenNames); assertEquals("Gomez", vm.state.value.draft.surnames)
    }

    @Test fun anEmailConflictIsShownOnceOnTheEmailField() = runTest(dispatcher) {
        val repo = Repo(); val vm = ReceptionViewModel(repo, QuietBus()); vm.setPermissions(listOf("pacientes.buscar", "pacientes.registrar"))
        vm.query("Ana Ficticia"); vm.newPatient(); advanceUntilIdle()
        assertEquals("the new-patient form asks for the email", "", vm.state.value.draft.email)
        vm.draft(vm.state.value.draft.copy(email = "ana@example.test"))
        val inUse = "Ese correo ya está en el expediente activo 0000002-5. Cada correo puede estar en un solo expediente activo: revisa si es la misma persona o usa otro correo."
        repo.failWith = AuthRequestException(inUse, 409, "correo_en_uso")
        vm.save(); advanceUntilIdle()
        assertEquals(inUse, vm.state.value.fields["email"])
        assertNull("not repeated as a banner", vm.state.value.error)
        assertTrue(vm.state.value.formOpen)
        val other = "Ese correo es de una cuenta de la app que ya está unida al expediente 0000003-1. Revisa si es la misma persona antes de usarlo aquí."
        repo.failWith = AuthRequestException(other, 409, "correo_de_otra_cuenta")
        vm.save(); advanceUntilIdle()
        assertEquals(other, vm.state.value.fields["email"])
        assertNull(vm.state.value.error)
        assertEquals(listOf("ana@example.test", "ana@example.test"), repo.emails)
    }

    @Test fun anInvalidEmailIsNotSent() = runTest(dispatcher) {
        val repo = Repo(); val vm = ReceptionViewModel(repo, QuietBus()); vm.setPermissions(listOf("pacientes.buscar", "pacientes.registrar"))
        vm.query("Ana Ficticia"); vm.newPatient(); advanceUntilIdle()
        vm.draft(vm.state.value.draft.copy(email = "sin-arroba"))
        vm.save(); advanceUntilIdle()
        assertEquals("Revisa el correo: falta el @ o el dominio.", vm.state.value.fields["email"])
        assertTrue(repo.saves.isEmpty())
    }

    @Test fun registeringWithoutAnythingTypedExplainsWhatToDo() = runTest(dispatcher) {
        val repo = Repo(); val vm = ReceptionViewModel(repo, QuietBus()); vm.setPermissions(listOf("pacientes.buscar", "pacientes.registrar"))
        vm.newPatient(); advanceUntilIdle()
        assertFalse(vm.state.value.formOpen); assertEquals(0, repo.searches)
        assertTrue(vm.state.value.error!!.contains("mínimo 2 caracteres"))
    }

    @Test fun aPossibleDuplicateKeepsTheSearchAndCanBeConfirmed() = runTest(dispatcher) {
        val repo = Repo(); val vm = ReceptionViewModel(repo, QuietBus()); vm.setPermissions(listOf("pacientes.buscar", "pacientes.registrar"))
        vm.query("Luis Prueba"); vm.newPatient(); advanceUntilIdle()
        repo.failWith = AuthRequestException("Ya hay un paciente igual.", 409, "posible_duplicado", """{"codigo":"posible_duplicado","candidatos":[{"id":"p1","record":"EXP-1","fullName":"Luis Prueba"}]}""")
        vm.save(); advanceUntilIdle()
        assertEquals(listOf("Luis Prueba · EXP-1"), vm.state.value.similar)
        assertTrue(vm.state.value.formOpen)
        repo.failWith = null
        vm.save(true); advanceUntilIdle()
        assertEquals(listOf(false, true), repo.saves)
        assertEquals(1, repo.searches)
        assertFalse(vm.state.value.formOpen)
    }
}
