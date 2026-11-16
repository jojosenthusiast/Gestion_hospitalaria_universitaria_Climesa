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
        assertEquals(StatusFamily.CERRADO, stockFamily(StockStatus.OUT))
        assertEquals(StatusFamily.LLAMADO, stockFamily(StockStatus.LOW))
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
}
