package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class DoctorShiftsTest {
    private fun doctor(id: String, shift: Boolean) = SchedulingDoctor(id, "Médico $id", null, shift, if (shift) null else "Sin turno ese día")
    private val hasShift: (SchedulingDoctor) -> Boolean = { it.hasShift }
    private val alphabetical = listOf(doctor("a", false), doctor("b", true), doctor("c", false), doctor("d", true))

    @Test fun doctorsWithShiftComeFirstKeepingTheirOrder() {
        assertEquals(listOf("b", "d", "a", "c"), DoctorShifts.ordered(alphabetical, hasShift).map { it.id })
    }

    @Test fun withShiftChipHidesDoctorsWithoutShift() {
        assertEquals(listOf("b", "d"), DoctorShifts.visible(alphabetical, DoctorShiftFilter.WITH_SHIFT, hasShift).map { it.id })
        assertEquals(2, DoctorShifts.withShift(alphabetical, hasShift))
    }

    @Test fun allChipShowsEveryDoctorWithShiftFirst() {
        assertEquals(listOf("b", "d", "a", "c"), DoctorShifts.visible(alphabetical, DoctorShiftFilter.ALL, hasShift).map { it.id })
    }

    @Test fun chosenDoctorStaysVisible() {
        assertEquals(listOf("b", "d", "a"), DoctorShifts.visible(alphabetical, DoctorShiftFilter.WITH_SHIFT, hasShift) { it.id == "a" }.map { it.id })
    }

    @Test fun nobodyOnShiftFallsBackToAll() {
        val none = listOf(doctor("a", false), doctor("c", false))
        assertEquals(DoctorShiftFilter.ALL, DoctorShifts.effective(DoctorShiftFilter.WITH_SHIFT, none, hasShift))
        assertEquals(listOf("a", "c"), DoctorShifts.visible(none, DoctorShiftFilter.WITH_SHIFT, hasShift).map { it.id })
        assertEquals(DoctorShiftFilter.WITH_SHIFT, DoctorShifts.effective(DoctorShiftFilter.WITH_SHIFT, alphabetical, hasShift))
    }

    @Test fun shortDayHasNoYear() {
        val today = LocalDate.of(2026, 11, 18)
        assertEquals("Hoy · mié 18 nov", ShortDay.of(today, today))
        assertEquals("Mañana · jue 19 nov", ShortDay.of(today.plusDays(1), today))
        assertEquals("Jue 26 nov", ShortDay.of(LocalDate.of(2026, 11, 26), today))
    }
}
