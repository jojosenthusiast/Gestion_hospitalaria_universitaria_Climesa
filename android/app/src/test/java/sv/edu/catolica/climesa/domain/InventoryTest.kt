package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryTest {
    private fun article(id: String, name: String, status: StockStatus, category: ArticleCategory = ArticleCategory.SUPPLY, code: String = id.uppercase()) =
        ArticleSummary(id, code, name, category, "unidad", 10.0, true, 1, 5.0, 0.0, 0.0, null, status)

    @Test fun searchIgnoresAccentsAndSortsByUrgency() {
        val rows = listOf(article("a", "Suero oral", StockStatus.OK), article("b", "Reactivo de creatinína", StockStatus.LOW, ArticleCategory.REAGENT), article("c", "Tubo", StockStatus.OUT, ArticleCategory.REAGENT))
        assertEquals(listOf("b"), filterArticles(rows, InventoryFilter(query = "creatinina")).map { it.id })
        assertEquals(listOf("c", "b", "a"), filterArticles(rows, InventoryFilter()).map { it.id })
        assertEquals(listOf("c", "b"), filterArticles(rows, InventoryFilter(categories = setOf(ArticleCategory.REAGENT))).map { it.id })
        assertEquals(listOf("a"), filterArticles(rows, InventoryFilter(statuses = setOf(StockStatus.OK))).map { it.id })
    }

    @Test fun gaugeFillsAtTwiceTheMinimum() {
        assertEquals(0.5f, gaugeFraction(10.0, 10.0), 0.001f)
        assertEquals(1f, gaugeFraction(50.0, 10.0), 0.001f)
        assertEquals(0f, gaugeFraction(0.0, 10.0), 0.001f)
    }

    private fun lot(id: String, number: String, expires: String?, expired: Boolean, vararg stock: Pair<String, Double>) =
        StockLot(id, number, expires, true, 1, expired, stock.sumOf { it.second }, stock.map { WarehouseStock(it.first, it.first, it.first, it.second) })

    @Test fun lotsAreFilteredByWarehouseAndOrderedFirstExpiredFirstOut() {
        val lots = listOf(lot("l1", "LATE", "2027-09-01", false, "w1" to 3.0), lot("l2", "EARLY", "2027-02-01", false, "w1" to 2.0, "w2" to 4.0), lot("l3", "OLD", "2026-01-01", true, "w1" to 1.0), lot("l4", "NONE", null, false, "w2" to 9.0))
        val inW1 = lotsFor(lots, "w1", includeExpired = false)
        assertEquals(listOf("EARLY", "LATE"), inW1.map { it.first.number })
        assertEquals("l2", fefoLot(inW1)?.id)
        assertEquals(listOf("OLD", "EARLY", "LATE"), lotsFor(lots, "w1", includeExpired = true).map { it.first.number })
        assertEquals(listOf("EARLY", "NONE"), lotsFor(lots, "w2", includeExpired = false).map { it.first.number })
        assertNull(fefoLot(emptyList()))
    }

    @Test fun eachKindAsksOnlyForItsFields() {
        assertTrue(MovementKind.ENTRY.needsDestination && !MovementKind.ENTRY.needsOrigin && MovementKind.ENTRY.needsNewLot)
        assertTrue(MovementKind.TRANSFER.needsOrigin && MovementKind.TRANSFER.needsDestination)
        assertTrue(MovementKind.WASTE.needsOrigin && !MovementKind.WASTE.needsDestination && MovementKind.WASTE.needsExistingLot)
        val consumption = MovementDraft(MovementKind.CONSUMPTION, originId = "w1", lotId = "l1", quantity = "2", reason = "Curación en planta")
        assertEquals(emptyMap<String, String>(), validateMovement(consumption, 5.0))
        val body = movementBody("a1", consumption)
        assertEquals("consumo", body.getString("type")); assertEquals("l1", body.getString("lotId")); assertFalse(body.has("destinationWarehouseId")); assertFalse(body.has("articleId"))
        val entry = MovementDraft(MovementKind.ENTRY, destinationId = "w1", lotNumber = "L-9", expiresAt = "2027-01-01", quantity = "5", reason = "Compra ficticia")
        val entryBody = movementBody("a1", entry)
        assertEquals("a1", entryBody.getString("articleId")); assertEquals("L-9", entryBody.getString("lotNumber")); assertFalse(entryBody.has("lotId")); assertFalse(entryBody.has("originWarehouseId"))
    }

    @Test fun validationReportsOneMessagePerField() {
        val errors = validateMovement(MovementDraft(MovementKind.TRANSFER, originId = "w1", destinationId = "w1", lotId = "", quantity = "9", reason = "x"), 3.0)
        assertEquals(setOf("destination", "lot", "quantity", "reason"), errors.keys)
        assertEquals("Solo hay 3 en ese lote.", errors["quantity"])
        assertEquals("La cantidad debe ser mayor que cero.", validateMovement(MovementDraft(MovementKind.WASTE, originId = "w1", lotId = "l1", quantity = "-1", reason = "Se rompió"), 3.0)["quantity"])
        assertEquals(null, validateMovement(MovementDraft(MovementKind.ADJUSTMENT, originId = "w1", lotId = "l1", quantity = "-2", reason = "Conteo físico"), 3.0)["quantity"])
    }

    @Test fun rolesOfferOnlyWhatTheApiAllows() {
        assertEquals(listOf(MovementKind.CONSUMPTION), parseAllowedMovements(listOf("consumo")))
        assertEquals(MovementKind.entries, parseAllowedMovements(listOf("entrada", "consumo", "traslado", "ajuste", "merma", "salida")))
        assertEquals(emptyList<MovementKind>(), parseAllowedMovements(emptyList()))
        assertTrue(canConfigureInventory(listOf("inventario.ver", "inventario.configurar")))
        assertFalse(canConfigureInventory(listOf("inventario.ver", "inventario.mover")))
    }

    @Test fun parsesTheArticleDetail() {
        val json = JSONObject("""{"id":"a1","code":"PAR","name":"Paracetamol","type":"insumo","unit":"tableta","minimum":100,"active":true,"version":2,"available":300,"expired":0,"expiringSoon":0,"nextExpiry":"2027-08-31","status":"ok",
            "lotList":[{"id":"l1","number":"DL","expiresAt":"2027-08-31","active":true,"version":1,"expired":false,"total":300,"warehouses":[{"warehouseId":"w1","warehouseCode":"BOD-CEN","warehouseName":"Bodega central","quantity":300}]}],
            "warehouses":[{"warehouseId":"w1","warehouseCode":"BOD-CEN","warehouseName":"Bodega central","quantity":300}],
            "allowedMovements":["consumo"],"movements":[{"id":"m1","type":"consumo","lotNumber":"DL","quantity":20,"reason":"Uso","originWarehouseCode":"BOD-CEN","authorName":"Ficticia","registeredAt":"2026-11-13T15:00:00Z"}]}""")
        val detail = parseDetail(json)!!
        assertEquals(StockStatus.OK, detail.summary.status); assertEquals("2027-08-31", detail.summary.nextExpiry)
        assertEquals("DL", detail.lots.single().number); assertEquals(300.0, detail.warehouses.single().quantity, 0.0)
        assertEquals(listOf(MovementKind.CONSUMPTION), detail.allowedMovements); assertEquals("BOD-CEN", detail.movements.single().origin); assertNull(detail.movements.single().destination)
    }
}
