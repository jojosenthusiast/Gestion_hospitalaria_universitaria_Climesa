package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class CrewCoverageTest {
    private fun shift(id: String, staffId: String, start: String, end: String, state: String = "publicado") =
        PlannedShift(id, staffId, "Persona $id", "a1", "Ambulancia", start, end, "diurno", state, null, 1)

    private val types = mapOf("p1" to "paramedico", "p2" to "paramedico", "m1" to "motorista", "d1" to "medico")

    @Test fun reportsTheHoursWithoutParamedicAndWithoutDriver() {
        val shifts = listOf(
            shift("1", "p1", "2026-11-14T00:00:00Z", "2026-11-14T12:00:00Z"),
            shift("2", "m1", "2026-11-14T06:00:00Z", "2026-11-14T18:00:00Z", state = "en_curso"),
            shift("3", "d1", "2026-11-14T00:00:00Z", "2026-11-14T18:00:00Z"),
        )
        val gaps = CrewCoverage.gaps(shifts, types)
        assertEquals(
            listOf(
                CrewGap("paramedico", Instant.parse("2026-11-14T12:00:00Z"), Instant.parse("2026-11-14T18:00:00Z")),
                CrewGap("motorista", Instant.parse("2026-11-14T00:00:00Z"), Instant.parse("2026-11-14T06:00:00Z")),
            ),
            gaps,
        )
    }

    @Test fun draftsAndCancelledShiftsDoNotCover() {
        val shifts = listOf(
            shift("1", "p1", "2026-11-14T00:00:00Z", "2026-11-14T12:00:00Z"),
            shift("2", "m1", "2026-11-14T00:00:00Z", "2026-11-14T12:00:00Z"),
            shift("3", "p2", "2026-11-14T12:00:00Z", "2026-11-14T18:00:00Z", state = "borrador"),
            shift("4", "m1", "2026-11-14T12:00:00Z", "2026-11-14T18:00:00Z", state = "cancelado"),
        )
        val gaps = CrewCoverage.gaps(shifts, types)
        // The range ends at the last non-cancelled shift (18:00, the draft); the cancelled one does not widen it.
        assertEquals(
            listOf(
                CrewGap("paramedico", Instant.parse("2026-11-14T12:00:00Z"), Instant.parse("2026-11-14T18:00:00Z")),
                CrewGap("motorista", Instant.parse("2026-11-14T12:00:00Z"), Instant.parse("2026-11-14T18:00:00Z")),
            ),
            gaps,
        )
    }

    @Test fun overlappingShiftsMergeAndFullCoverageHasNoGaps() {
        val shifts = listOf(
            shift("1", "p1", "2026-11-14T00:00:00Z", "2026-11-14T10:00:00Z"),
            shift("2", "p2", "2026-11-14T08:00:00Z", "2026-11-14T20:00:00Z"),
            shift("3", "m1", "2026-11-14T00:00:00Z", "2026-11-14T20:00:00Z"),
        )
        assertTrue(CrewCoverage.gaps(shifts, types).isEmpty())
    }

    @Test fun withoutStaffTypesOrShiftsThereIsNoFalseAlarm() {
        val shifts = listOf(shift("1", "p1", "2026-11-14T00:00:00Z", "2026-11-14T10:00:00Z"))
        assertTrue(CrewCoverage.gaps(shifts, emptyMap()).isEmpty())
        assertTrue(CrewCoverage.gaps(emptyList(), types).isEmpty())
        assertTrue(CrewCoverage.gaps(listOf(shift("x", "p1", "mal", "2026-11-14T10:00:00Z")), types).isEmpty())
    }
}
