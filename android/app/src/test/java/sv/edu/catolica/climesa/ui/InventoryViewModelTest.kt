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
import sv.edu.catolica.climesa.domain.MovementKind
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.StockStatus

private class QuietRealtime : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }

@OptIn(ExperimentalCoroutinesApi::class)
class InventoryViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun summary(id: String, name: String, status: String) = JSONObject().put("id", id).put("code", id.uppercase()).put("name", name).put("type", "insumo").put("unit", "unidad").put("minimum", 10).put("active", true).put("version", 1)
        .put("available", 5).put("expired", 0).put("expiringSoon", 0).put("status", status)
    private fun lot(id: String, number: String, expires: String, vararg stock: Pair<String, Int>) = JSONObject().put("id", id).put("number", number).put("expiresAt", expires).put("active", true).put("version", 1).put("expired", false).put("total", stock.sumOf { it.second })
        .put("warehouses", JSONArray().apply { stock.forEach { put(JSONObject().put("warehouseId", it.first).put("warehouseCode", it.first).put("warehouseName", "Bodega ${it.first}").put("quantity", it.second)) } })
    private fun detail() = summary("a1", "Gasa", "bajo_minimo").put("lotList", JSONArray().put(lot("l-late", "LATE", "2027-09-01", "w1" to 3)).put(lot("l-early", "EARLY", "2027-02-01", "w1" to 2, "w2" to 4)))
        .put("warehouses", JSONArray().put(JSONObject().put("warehouseId", "w1").put("warehouseCode", "w1").put("warehouseName", "Bodega w1").put("quantity", 5)).put(JSONObject().put("warehouseId", "w2").put("warehouseCode", "w2").put("warehouseName", "Bodega w2").put("quantity", 4)))
        .put("movements", JSONArray()).put("allowedMovements", JSONArray(listOf("entrada", "consumo", "traslado", "ajuste", "merma")))

    private fun gateway(): FakeGateway {
        val api = FakeGateway(JSONArray().put(summary("a1", "Gasa", "bajo_minimo")).put(summary("a2", "Suero", "ok")))
        api.responses["/inventario/articulos/a1"] = detail()
        api.responses["/inventario/bodegas"] = JSONArray().put(JSONObject().put("id", "w1").put("code", "w1").put("name", "Bodega w1")).put(JSONObject().put("id", "w2").put("code", "w2").put("name", "Bodega w2"))
        return api
    }

    @Test fun listsArticlesWithAlertsAndFilters() = runTest(dispatcher) {
        val vm = InventoryViewModel(gateway(), QuietRealtime()); vm.load(); runCurrent()
        assertEquals(listOf("a1"), vm.state.value.lowStock.map { it.id })
        vm.setQuery("sue"); assertEquals(listOf("a2"), vm.state.value.shown.map { it.id })
        vm.clearFilters(); vm.toggleStatus(StockStatus.LOW); assertEquals(listOf("a1"), vm.state.value.shown.map { it.id })
    }

    @Test fun choosingTheOriginPicksTheLotThatExpiresFirst() = runTest(dispatcher) {
        val vm = InventoryViewModel(gateway(), QuietRealtime()); vm.load(); runCurrent()
        vm.select("a1"); runCurrent()
        vm.openMovement(MovementKind.CONSUMPTION); runCurrent()
        vm.editMovement { it.copy(originId = "w1") }
        assertEquals("l-early", vm.state.value.movement?.lotId)
        assertEquals(listOf("EARLY", "LATE"), vm.state.value.lotChoices.map { it.first.number })
        assertEquals(2.0, vm.state.value.chosenLotQuantity!!, 0.0)
    }

    @Test fun anInvalidMovementNeverReachesTheApiAndAValidOneClosesTheFlow() = runTest(dispatcher) {
        val api = gateway(); val vm = InventoryViewModel(api, QuietRealtime()); vm.load(); runCurrent(); vm.select("a1"); runCurrent()
        vm.openMovement(MovementKind.CONSUMPTION); runCurrent()
        vm.editMovement { it.copy(originId = "w1", quantity = "9", reason = "Curación en planta") }
        vm.submitMovement(); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("Solo hay 2 en ese lote.", vm.state.value.movementErrors["quantity"])
        vm.editMovement { it.copy(quantity = "2") }
        vm.submitMovement(); assertTrue(vm.state.value.busy); runCurrent()
        val post = api.calls.first { it.second == "POST" }
        assertEquals("consumo", post.third?.getString("type")); assertEquals("l-early", post.third?.getString("lotId")); assertEquals("w1", post.third?.getString("originWarehouseId"))
        assertNull(vm.state.value.movement); assertEquals("Movimiento registrado.", vm.state.value.notice)
    }

    @Test fun theFlowStaysOpenWhenTheApiRejectsTheMovement() = runTest(dispatcher) {
        val api = gateway(); api.failures["/inventario/movimientos"] = IllegalStateException("La existencia no puede quedar negativa.")
        val vm = InventoryViewModel(api, QuietRealtime()); vm.load(); runCurrent(); vm.select("a1"); runCurrent()
        vm.openMovement(MovementKind.WASTE); runCurrent()
        vm.editMovement { it.copy(originId = "w1", quantity = "1", reason = "Frasco roto") }
        vm.submitMovement(); runCurrent()
        assertEquals("La existencia no puede quedar negativa.", vm.state.value.dialogError)
        assertEquals(MovementKind.WASTE, vm.state.value.movement?.kind)
    }

    @Test fun anEntryCarriesTheNewLotAndNoOrigin() = runTest(dispatcher) {
        val api = gateway(); val vm = InventoryViewModel(api, QuietRealtime()); vm.load(); runCurrent(); vm.select("a1"); runCurrent()
        vm.openMovement(MovementKind.ENTRY); runCurrent()
        vm.editMovement { it.copy(destinationId = "w2", lotNumber = "N-1", expiresAt = "2028-01-01", quantity = "10", reason = "Compra ficticia") }
        vm.submitMovement(); runCurrent()
        val body = api.calls.first { it.second == "POST" }.third!!
        assertEquals("a1", body.getString("articleId")); assertEquals("N-1", body.getString("lotNumber")); assertTrue(!body.has("originWarehouseId"))
    }

    @Test fun savesAnArticleWithVersionAndReason() = runTest(dispatcher) {
        val api = gateway(); val vm = InventoryViewModel(api, QuietRealtime()); vm.load(); runCurrent()
        vm.openArticle(vm.state.value.articles.first { it.id == "a1" })
        vm.editArticle { it.copy(minimum = "20", reason = "Sube el mínimo por demanda") }
        vm.saveArticle(); runCurrent()
        val call = api.calls.first { it.second == "PUT" }
        assertEquals("/inventario/articulos/a1", call.first); assertEquals(1, call.third?.getInt("version")); assertEquals(20.0, call.third?.getDouble("minimum")!!, 0.0)
        assertNull(vm.state.value.article)
    }
}
