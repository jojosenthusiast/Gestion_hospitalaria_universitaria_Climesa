package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.PickerPatient

private class IntakeBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class AdmissionIntakeViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun gateway() = FakeGateway().apply {
        responses["/pacientes/selector?query=nueve&limit=10&offset=0"] = JSONObject("""{"items":[{"id":"p9","record":"EXP-9","fullName":"Paciente Ficticio Nueve","age":41}],"hasMore":false}""")
        responses["/admisiones/origenes?patientId=p9"] = JSONArray("""[{"id":"c1","origin":"cita","label":"Cita del 19/11/2026","detail":"Dra. Ficticia"}]""")
        responses["/admisiones/mapa-camas?patientId=p9"] = JSONObject("""{"categories":[{"category":"semiprivada","free":2,"compatible":1},{"category":"vip","free":0,"compatible":0}],"beds":[]}""")
        responses["/admisiones/mapa-camas?patientId=p9&isolation=false&category=semiprivada"] = JSONObject("""{"categories":[],"beds":[
            {"id":"b1","version":3,"code":"C-201","roomId":"r1","room":"H-201","floor":2,"category":"semiprivada","capacity":2,"compatible":true,"reason":null,"suggested":true},
            {"id":"b2","version":1,"code":"C-202","roomId":"r1","room":"H-201","floor":2,"category":"semiprivada","capacity":2,"compatible":false,"reason":"Ocupada","suggested":false}]}""")
        responses["/admisiones"] = JSONObject().put("id", "nuevo")
    }

    @Test fun walksTheStepsValidatingEachOneAndConfirmsWithTheSuggestedBed() = runTest(dispatcher) {
        val api = gateway(); val vm = AdmissionIntakeViewModel(api, IntakeBus()); vm.debounceMs = 0
        vm.open()
        assertNotNull(vm.error(true)); vm.next(true); assertEquals(0, vm.state.value.step) // no patient: cannot advance
        vm.query("nueve"); advanceUntilIdle()
        vm.pickPatient(vm.state.value.results.single()); vm.next(true); runCurrent()
        assertEquals(1, vm.state.value.step); assertEquals(1, vm.state.value.origins.size)
        vm.pickOrigin(OriginKind.APPOINTMENT); vm.pickRecord(vm.state.value.origins.single()); vm.next(true)
        assertEquals(1, vm.state.value.step) // motive missing
        vm.motive("Dolor abdominal con fiebre"); vm.next(true)
        // Step 3: a doctor without shift cannot be picked.
        vm.at(AdmissionIntake.nowLocal()); advanceUntilIdle()
        val instant = AdmissionIntake.instantOf(vm.state.value.draft.at)!!
        api.responses["/admisiones/medicos-disponibles?at=${java.net.URLEncoder.encode(instant.toString(), "UTF-8")}"] = JSONArray("""[{"id":"d1","name":"Dra. Ficticia","specialty":null,"available":true,"reason":null},{"id":"d2","name":"Dr. Sin Turno","specialty":null,"available":false,"reason":"Sin turno en ese horario"}]""")
        vm.at(AdmissionIntake.nowLocal()); advanceUntilIdle()
        val off = vm.state.value.doctors.first { !it.available }
        vm.pickDoctor(off); assertNull(vm.state.value.draft.doctor)
        vm.pickDoctor(vm.state.value.doctors.first { it.available }); vm.next(true); runCurrent()
        // Step 4: VIP has no free beds.
        vm.pickCategory("vip"); assertNull(vm.state.value.draft.category)
        vm.pickCategory("semiprivada"); vm.next(true); vm.next(true); runCurrent()
        // Step 6: the suggestion arrives chosen; an incompatible bed cannot be picked.
        assertEquals("b1", vm.state.value.draft.bed?.id)
        vm.pickBed(vm.state.value.bedMap!!.beds.first { !it.compatible }); assertEquals("b1", vm.state.value.draft.bed?.id)
        vm.next(true); vm.next(true)
        assertEquals(7, vm.state.value.step)
    }

    @Test fun confirmDoesNothingUntilEveryStepIsValid() = runTest(dispatcher) {
        val api = gateway(); val vm = AdmissionIntakeViewModel(api, IntakeBus()); vm.debounceMs = 0
        api.responses["/admisiones/factibilidad"] = JSONObject()
        vm.open()
        vm.pickPatient(PickerPatient("p9", "EXP-9", "Paciente Ficticio Nueve", 41))
        // Not feasible yet: confirm must not reach the API.
        vm.confirm(false); runCurrent()
        assertTrue(api.calls.none { it.first == "/admisiones" })
        assertFalse(vm.state.value.finished)
    }

    @Test fun closingDropsTheDraft() = runTest(dispatcher) {
        val api = gateway(); api.failures["/admisiones"] = AuthRequestException("Otra persona tomó esta cama.", 409)
        val vm = AdmissionIntakeViewModel(api, IntakeBus()); vm.debounceMs = 0
        vm.open(); vm.pickPatient(PickerPatient("p9", "EXP-9", "Paciente Ficticio Nueve", 41))
        assertEquals("Paciente Ficticio Nueve", vm.state.value.draft.patient?.name)
        vm.close(); assertNull(vm.state.value.draft.patient); assertFalse(vm.state.value.open)
    }

    @Test fun aShiftChangedElsewhereReloadsTheDoctorsOnScreenButOtherEventsDoNot() = runTest(dispatcher) {
        val api = gateway(); val bus = IntakeBus(); val vm = AdmissionIntakeViewModel(api, bus); vm.debounceMs = 0
        vm.startLive(listOf("rol:REC")); runCurrent()
        vm.open()
        vm.query("nueve"); advanceUntilIdle()
        vm.pickPatient(vm.state.value.results.single()); vm.next(true); runCurrent()
        vm.pickOrigin(OriginKind.APPOINTMENT); vm.pickRecord(vm.state.value.origins.single()); vm.motive("Dolor abdominal con fiebre"); vm.next(true)
        vm.at(AdmissionIntake.nowLocal()); advanceUntilIdle()
        val instant = AdmissionIntake.instantOf(vm.state.value.draft.at)!!
        val doctors = "/admisiones/medicos-disponibles?at=${java.net.URLEncoder.encode(instant.toString(), "UTF-8")}"
        assertEquals(2, vm.state.value.step)
        val before = api.gets(doctors)
        bus.signals.emit(RealtimeSignal.Event(EventoDominio("orden_laboratorio.actualizado", "orden_laboratorio", "o1", 2))); advanceUntilIdle()
        assertEquals(before, api.gets(doctors))
        api.responses[doctors] = JSONArray("""[{"id":"d1","name":"Dra. Ficticia","specialty":null,"available":true,"reason":null}]""")
        bus.signals.emit(RealtimeSignal.Event(EventoDominio("turno.actualizado", "turno", "t1", 3))); advanceUntilIdle()
        assertEquals(before + 1, api.gets(doctors))
        assertTrue(vm.state.value.doctors.single().available)
        vm.close()
        bus.signals.emit(RealtimeSignal.Resync); advanceUntilIdle()
        assertEquals("a closed guide asks for nothing", before + 1, api.gets(doctors))
    }
}
