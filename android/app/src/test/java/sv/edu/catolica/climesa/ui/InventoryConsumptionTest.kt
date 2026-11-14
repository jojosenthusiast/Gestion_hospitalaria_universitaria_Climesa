package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
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
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class SilentRealtime : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class InventoryConsumptionTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun stock(below: Boolean) = JSONArray()
        .put(JSONObject().put("lotId", "lot-1").put("codigo", "GAS-01").put("nombre", "Gasa").put("warehouseId", "w-1").put("quantity", 9).put("unidad", "unidad").put("minimo", 10).put("bajo_minimo", below))
        .put(JSONObject().put("lotId", "lot-2").put("codigo", "GAS-01").put("nombre", "Gasa").put("warehouseId", "w-2").put("quantity", 1).put("unidad", "unidad").put("minimo", 10).put("bajo_minimo", below))

    @Test fun theFormStaysOpenWhenTheApiRejectsTheConsumption() = runTest(dispatcher) {
        val api = FakeGateway(stock(false)); api.failures["/inventario/movimientos"] = IllegalStateException("La existencia no puede quedar negativa.")
        val vm = InventoryViewModel(api, SilentRealtime())
        vm.load(); runCurrent()
        vm.openConsumption("lot-1")
        vm.move(vm.state.value.stock.first(), "20", "Curación en planta", null)
        assertTrue("busy while the API answers", vm.state.value.busy)
        assertEquals("lot-1", vm.state.value.consumptionLotId)
        runCurrent()
        assertEquals("lot-1", vm.state.value.consumptionLotId)
        assertEquals("La existencia no puede quedar negativa.", vm.state.value.error)
    }

    @Test fun theFormClosesOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway(stock(false))
        val vm = InventoryViewModel(api, SilentRealtime())
        vm.load(); runCurrent()
        vm.openConsumption("lot-1")
        vm.move(vm.state.value.stock.first(), "2", "Curación en planta", null)
        assertEquals("lot-1", vm.state.value.consumptionLotId)
        runCurrent()
        assertNull(vm.state.value.consumptionLotId)
        assertEquals("Consumo registrado.", vm.state.value.notice)
        assertEquals(2, api.gets("/inventario/existencias"))
        assertEquals("consumo", api.calls.first { it.second == "POST" }.third?.getString("type"))
    }

    @Test fun lowStockComesFromTheApiFlagOncePerArticle() = runTest(dispatcher) {
        val api = FakeGateway(stock(true))
        val vm = InventoryViewModel(api, SilentRealtime())
        vm.load(); runCurrent()
        assertEquals(listOf("GAS-01"), vm.state.value.lowStock.map { it.code })
        api.rows = stock(false); vm.load(); runCurrent()
        assertTrue(vm.state.value.lowStock.isEmpty())
    }

    @Test fun anInvalidQuantityNeverReachesTheApi() = runTest(dispatcher) {
        val api = FakeGateway(stock(false))
        val vm = InventoryViewModel(api, SilentRealtime())
        vm.load(); runCurrent(); vm.openConsumption("lot-1")
        vm.move(vm.state.value.stock.first(), "0", "Curación en planta", null); runCurrent()
        assertEquals("lot-1", vm.state.value.consumptionLotId)
        assertTrue(api.calls.none { it.second == "POST" })
    }
}
