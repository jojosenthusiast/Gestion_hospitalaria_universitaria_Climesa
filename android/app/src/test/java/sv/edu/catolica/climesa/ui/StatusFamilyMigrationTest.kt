package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.LabStage
import sv.edu.catolica.climesa.domain.StockStatus
import sv.edu.catolica.climesa.domain.VitalLevel

/** S13: screens that used hand-picked tones now read the shared family table (no red outside critical values). */
class StatusFamilyMigrationTest {
    @Test fun `stock states follow the shared families and are never critical`() {
        assertNull("agotado is the urgent priority, not a family", stockFamily(StockStatus.OUT))
        assertEquals(StatusFamily.ESPERA, stockFamily(StockStatus.LOW))
        assertEquals(StatusFamily.ESPERA, stockFamily(StockStatus.EXPIRING))
        assertEquals(StatusFamily.LISTO, stockFamily(StockStatus.OK))
        assertEquals(StatusFamily.CERRADO, stockFamily(StockStatus.INACTIVE))
        StockStatus.entries.forEach { assert(stockFamily(it) != StatusFamily.CRITICO) }
    }

    @Test fun `lab stages use the web stage table`() {
        assertEquals(StatusFamily.ESPERA, labStageFamily(LabStage.PENDING))
        assertEquals(StatusFamily.LLAMADO, labStageFamily(LabStage.IN_PROCESS))
        assertEquals(StatusFamily.ESPERA, labStageFamily(LabStage.TO_REVIEW))
        assertEquals(StatusFamily.LISTO, labStageFamily(LabStage.RELEASED))
        assertEquals(StatusFamily.CERRADO, labStageFamily(LabStage.CANCELLED))
    }

    @Test fun `only a critical vital sign is red`() {
        assertEquals(StatusFamily.CRITICO, vitalLevelFamily(VitalLevel.CRITICAL))
        assertNull(vitalLevelFamily(VitalLevel.ABNORMAL))
        assertEquals(StatusFamily.LISTO, vitalLevelFamily(VitalLevel.NORMAL))
    }

    @Test fun `link checks read as match or review`() {
        assertEquals(StatusFamily.LISTO, StatusFamily.of(LinkCheck.MATCH))
        assertEquals(StatusFamily.ESPERA, StatusFamily.of(LinkCheck.REVIEW))
    }

    // R3 / A-35: same table on web, Android and iOS. Only a called number or a lab sample in process uses the megaphone.
    @Test fun `each status value maps to the family shared with web and iOS`() {
        val expected = mapOf(
            "confirmada" to StatusFamily.ESPERA,
            "reprogramada" to StatusFamily.ESPERA,
            "bajo_minimo" to StatusFamily.ESPERA,
            "publicado" to StatusFamily.ESPERA,
            "llamado" to StatusFamily.LLAMADO,
            "en_proceso" to StatusFamily.LLAMADO,
            "limpieza" to StatusFamily.ATENCION,
            "en_atencion" to StatusFamily.ATENCION,
            "libre" to StatusFamily.LISTO,
            "cancelada" to StatusFamily.CERRADO,
            "critico_alto" to StatusFamily.CRITICO,
            "requiere_atencion" to StatusFamily.ATENCION,
        )
        expected.forEach { (value, family) -> assertEquals(value, family, StatusFamily.of(value)) }
        val called = listOf("confirmada", "reprogramada", "bajo_minimo", "limpieza", "publicado").filter { StatusFamily.of(it) == StatusFamily.LLAMADO }
        assertEquals(emptyList<String>(), called)
    }

    // Lab out of range and unusable stock are urgent (amber, double chevron); `sin_rango` is neutral; only critico* is red.
    @Test fun `out of range and unusable stock render as urgent priority`() {
        listOf("alto", "bajo", "agotado", "vencido").forEach { value ->
            assert(StatusFamily.urgent(value)) { value }
            assertNull(value, StatusFamily.resolve(value, StatusCatalog.tone(value)))
        }
        assertEquals(StatusIcon.DOUBLE_ARROW_UP, Priority.URGENTE.icon)
        listOf("sin_rango", "normal", "critico_alto", "requiere_atencion").forEach { assert(!StatusFamily.urgent(it)) { it } }
        assertNull(StatusFamily.resolve("sin_rango", StatusCatalog.tone("sin_rango")))
        val red = listOf("alto", "bajo", "agotado", "vencido", "sin_rango", "requiere_atencion", "critico_alto", "critico_bajo")
            .filter { StatusFamily.resolve(it, StatusCatalog.tone(it)) == StatusFamily.CRITICO }
        assertEquals(listOf("critico_alto", "critico_bajo"), red)
    }
}
