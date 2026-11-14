package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LabFlowTest {
    private fun item(id: String, done: Boolean) = LaboratoryItem(id, "C$id", "Examen $id", if (done) LaboratoryResult(1.0, null, "normal", 1) else null)
    private fun order(state: String, reviewed: Boolean = false, priority: String = "rutina", vararg items: LaboratoryItem, id: String = "o") =
        LaboratoryOrder(id, "Paciente", priority, state, 1, items.toList(), reviewed)

    private fun statuses(order: LaboratoryOrder) = LabFlow.steps(order).map { it.status }
    private val done = LabStepStatus.DONE
    private val now = LabStepStatus.CURRENT
    private val later = LabStepStatus.PENDING

    @Test fun losSeisPasosSiguenElOrdenDelProducto() {
        assertEquals(listOf("Solicitada", "Muestra", "En proceso", "Completada", "Revisada", "Visible al paciente"), LabFlow.stepLabels)
    }

    @Test fun cadaEstadoMarcaElPasoActual() {
        assertEquals(listOf(done, now, later, later, later, later), statuses(order("pendiente")))
        assertEquals(listOf(done, done, now, later, later, later), statuses(order("en_proceso")))
        assertEquals(listOf(done, done, done, done, now, later), statuses(order("completado", reviewed = false)))
        assertEquals(List(6) { done }, statuses(order("completado", reviewed = true)))
        assertTrue(LabFlow.steps(order("cancelado")).isEmpty())
    }

    @Test fun elSiguienteActorDependeDelEstadoYDeQuienMira() {
        assertTrue(LabFlow.nextStep(order("pendiente")).contains("laboratorio toma la muestra"))
        assertTrue(LabFlow.nextStep(order("en_proceso", items = arrayOf(item("1", true), item("2", false)))).contains("1 resultado"))
        assertTrue(LabFlow.nextStep(order("en_proceso", items = arrayOf(item("1", true)))).contains("completa la orden"))
        assertTrue(LabFlow.nextStep(order("completado", reviewed = false)).contains("médico revisa"))
        assertTrue(LabFlow.nextStep(order("completado", reviewed = false), ownView = true).contains("antes de que los veas"))
        assertTrue(LabFlow.nextStep(order("completado", reviewed = true), ownView = true).contains("puedes verlos"))
    }

    @Test fun completarExigeTodosLosResultados() {
        assertEquals("Para completar faltan 2 resultado(s) por capturar.", LabFlow.completionBlocker(order("en_proceso", items = arrayOf(item("1", false), item("2", false)))))
        assertNull(LabFlow.completionBlocker(order("en_proceso", items = arrayOf(item("1", true)))))
        assertNull(LabFlow.completionBlocker(order("pendiente", items = arrayOf(item("1", false)))))
    }

    @Test fun losFiltrosSeparanLasEtapasYCadaSeccionAbreEnLaSuya() {
        val orders = listOf(order("pendiente", id = "a"), order("en_proceso", id = "b"), order("completado", false, id = "c"), order("completado", true, id = "d"))
        assertEquals(listOf("a"), orders.filter(LabFilter.REQUESTED::matches).map { it.id })
        assertEquals(listOf("b"), orders.filter(LabFilter.IN_PROCESS::matches).map { it.id })
        assertEquals(listOf("c"), orders.filter(LabFilter.TO_REVIEW::matches).map { it.id })
        assertEquals(listOf("d"), orders.filter(LabFilter.RELEASED::matches).map { it.id })
        assertEquals(LabFilter.REQUESTED, LabFlow.defaultFilter(AndroidSection.SAMPLE))
        assertEquals(LabFilter.IN_PROCESS, LabFlow.defaultFilter(AndroidSection.CAPTURE_RESULTS))
        assertEquals(LabFilter.TO_REVIEW, LabFlow.defaultFilter(AndroidSection.RESULT_REVIEW))
        assertEquals(LabFilter.ALL, LabFlow.defaultFilter(AndroidSection.LAB))
    }

    @Test fun laAccionRapidaTomaPrimeroLaUrgente() {
        val orders = listOf(order("pendiente", id = "rutina"), order("pendiente", priority = "urgente", id = "urgente"))
        assertEquals("urgente", LabFlow.nextToSample(orders)?.id)
        assertNull(LabFlow.nextToSample(listOf(order("en_proceso"))))
        val capture = LabFlow.nextToCapture(listOf(order("en_proceso", items = arrayOf(item("1", true), item("2", false)), id = "x")))
        assertEquals("x" to "2", capture?.let { it.first.id to it.second.id })
    }
}
