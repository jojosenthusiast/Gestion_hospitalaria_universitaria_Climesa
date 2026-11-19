package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.LabFlag
import sv.edu.catolica.climesa.domain.LabRange
import sv.edu.catolica.climesa.domain.LabResultView
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryResult

/** Lote 5 S13: result flags (out of range, critical) and the line each component shows. */
class Lote5MedLabTest {
    private val range = LabRange(12.0, 15.5, 7.0, 20.0)
    private fun item(value: Double?, mark: String = "", text: String? = null, r: LabRange? = range) =
        LaboratoryItem("i", "HB", "Hemoglobina", if (value == null && text == null) null else LaboratoryResult(value, text, mark, 1), unit = "g/dL", range = r)

    @Test fun serverMarkWins() {
        assertEquals(LabFlag.CRITICAL_LOW, LabResultView.flag(item(13.0, "critico_bajo")))
        assertEquals(LabFlag.NORMAL, LabResultView.flag(item(30.0, "normal")))
    }

    @Test fun withoutMarkTheFlagComesFromTheRange() {
        assertEquals(LabFlag.CRITICAL_HIGH, LabResultView.flag(item(21.0)))
        assertEquals(LabFlag.CRITICAL_LOW, LabResultView.flag(item(6.0)))
        assertEquals(LabFlag.HIGH, LabResultView.flag(item(16.0)))
        assertEquals(LabFlag.LOW, LabResultView.flag(item(11.0)))
        assertEquals(LabFlag.NORMAL, LabResultView.flag(item(13.5)))
        assertEquals(LabFlag.NO_RANGE, LabResultView.flag(item(13.5, r = null)))
        assertEquals(LabFlag.PENDING, LabResultView.flag(item(null)))
        assertEquals(LabFlag.TEXT, LabResultView.flag(item(null, "sin_rango", text = "Negativo")))
    }

    @Test fun lineCarriesValueUnitAndRange() {
        val line = LabResultView.line(item(16.2, "alto"))
        assertEquals("16.2", line.value)
        assertEquals("g/dL", line.unit)
        assertEquals("12–15.5 · crítico < 7 o > 20", line.range)
        assertTrue(line.flag.outOfRange)
        assertEquals("12–15.5", LabResultView.line(item(16.2, "alto"), withRange = false).range)
    }

    @Test fun summaryCountsOutOfRangeAndCritical() {
        assertEquals("2 fuera de rango · 1 crítico", LabResultView.summary(listOf(item(16.0), item(6.0), item(13.0))))
        assertNull(LabResultView.summary(listOf(item(13.0), item(null))))
    }
}
