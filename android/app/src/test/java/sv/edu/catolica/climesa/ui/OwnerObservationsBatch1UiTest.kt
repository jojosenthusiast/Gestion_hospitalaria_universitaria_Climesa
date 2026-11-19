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
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.RealtimeSignal

private object Batch1NoRealtime : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

/** Owner observations batch 1 on Android: shared CRUD/read-only pieces, spinner motion and the kept admission draft. */
@OptIn(ExperimentalCoroutinesApi::class)
class OwnerObservationsBatch1UiTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun readOnlyBadgeSaysWhatCanBeSeenAndWhoChangesIt() {
        assertEquals("Solo lectura", ReadOnlyCopy.LABEL)
        assertEquals("Puedes consultar la fila del día. Para hacer cambios, contacta a Recepción, Asistencia o Medicina.", ReadOnlyCopy.explain("Recepción, Asistencia o Medicina", "la fila del día"))
        assertEquals("Puedes consultar esta información. Para hacer cambios, contacta a Enfermería.", ReadOnlyCopy.explain("Enfermería"))
    }

    @Test fun eachCrudVerbHasItsOwnIcon() {
        val icons = CrudKind.entries.map { it.icon().name }
        assertEquals(icons.size, icons.toSet().size)
        assertTrue(CrudKind.Create.icon().name.contains("Add"))
        assertTrue(CrudKind.Edit.icon().name.contains("Edit"))
        assertTrue(CrudKind.Deactivate.icon().name.contains("Delete"))
        assertTrue(CrudKind.View.icon().name.contains("Visibility"))
    }

    @Test fun spinnerMovesFromTheRawFrameClock() {
        assertEquals(0f, SpinnerMotion.angle(0), 0.01f)
        assertEquals(180f, SpinnerMotion.angle(SpinnerMotion.TURN_NANOS / 2), 0.01f)
        assertEquals(0f, SpinnerMotion.angle(SpinnerMotion.TURN_NANOS), 0.01f)
        assertEquals(1f, SpinnerMotion.sweep(SpinnerMotion.SWEEP_NANOS / 2), 0.01f)
        assertEquals(0.5f, SpinnerMotion.sweep(SpinnerMotion.SWEEP_NANOS / 4), 0.01f)
    }

    private fun gateway() = FakeGateway().apply {
        responses["/pacientes/selector?query=nueve&limit=10&offset=0"] = JSONObject("""{"items":[{"id":"p9","record":"EXP-9","fullName":"Paciente Ficticio Nueve","age":41}],"hasMore":false}""")
        responses["/admisiones/origenes?patientId=p9"] = JSONArray("[]")
    }

    @Test fun cancellingTheIntakeKeepsTheDraftToContinueOrStartOver() = runTest(dispatcher) {
        val vm = AdmissionIntakeViewModel(gateway(), Batch1NoRealtime); vm.debounceMs = 0
        // Nothing chosen: leaving just closes, there is nothing to offer.
        vm.open(); vm.leave()
        assertFalse(vm.state.value.open); assertNull(vm.state.value.resumeName)
        vm.open(); vm.query("nueve"); advanceUntilIdle()
        vm.pickPatient(vm.state.value.results.single()); vm.motive("Dolor abdominal")
        vm.leave()
        assertFalse(vm.state.value.open)
        assertEquals("Paciente Ficticio Nueve", vm.state.value.resumeName)
        // «Continuar ingreso de X» reopens with everything chosen.
        vm.open()
        assertTrue(vm.state.value.open)
        assertEquals("p9", vm.state.value.draft.patient?.id)
        assertEquals("Dolor abdominal", vm.state.value.draft.motive)
        assertNull(vm.state.value.resumeName)
        // «Empezar de nuevo» drops it.
        vm.leave(); vm.restart()
        assertTrue(vm.state.value.open)
        assertNull(vm.state.value.draft.patient)
        assertNull(vm.state.value.resumeName)
    }
}
