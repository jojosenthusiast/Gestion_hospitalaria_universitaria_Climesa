package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.LaboratoryResult
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class R3Bus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** R3: Android view-model behaviour behind the audit fixes (A-16, A-23, A-1). */
@OptIn(ExperimentalCoroutinesApi::class)
class AndroidR3ViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun order(id: String) = LaboratoryOrder(id, "Ana", "rutina", "completado", 3, emptyList(), false, allowedActions = setOf("revisar"))

    // A-16: only the row being reviewed is busy; another order can be reviewed meanwhile.
    @Test fun labReviewIsBusyPerRow() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, R3Bus(), NoDocuments)
        vm.review(order("o1"))
        assertEquals(setOf("o1"), vm.state.value.busyIds)
        vm.review(order("o2")); vm.review(order("o1"))
        assertEquals(setOf("o1", "o2"), vm.state.value.busyIds)
        runCurrent()
        assertTrue(vm.state.value.busyIds.isEmpty())
        assertEquals(2, api.calls.count { it.second == "POST" })
    }

    // A-16: "Revisar" first opens a confirmation; it closes only when the release succeeds.
    @Test fun labReviewConfirmationClosesOnlyOnSuccess() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, R3Bus(), NoDocuments)
        vm.openReview("o1")
        assertEquals("o1", vm.state.value.reviewOrderId)
        assertTrue("opening sends nothing", api.calls.none { it.second == "POST" })
        api.failures["/laboratorio/ordenes/o1/revisar"] = AuthRequestException("El resultado cambió; vuelve a abrirlo.", 409)
        vm.review(order("o1")); runCurrent()
        assertEquals("o1", vm.state.value.reviewOrderId)
        assertEquals("El resultado cambió; vuelve a abrirlo.", vm.state.value.error)
        api.failures.clear()
        vm.review(order("o1")); runCurrent()
        assertNull(vm.state.value.reviewOrderId)
    }

    @Test fun reviewSummarySaysWhatThePatientWillSee() {
        val item = LaboratoryItem("i1", "HB", "Hemoglobina", LaboratoryResult(value = 9.5, text = null, mark = "bajo", version = 1), unit = "g/dL")
        val order = LaboratoryOrder("o1", "Ana", "rutina", "completado", 3, listOf(item, item.copy(id = "i2", name = "Glucosa", result = null)), false)
        assertEquals(listOf("Hemoglobina: 9.5 g/dL · Bajo", "Glucosa: Sin resultado"), LabReviewSummary.lines(order))
    }
}
