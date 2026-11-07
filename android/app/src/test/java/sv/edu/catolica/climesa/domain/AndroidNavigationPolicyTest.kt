package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidNavigationPolicyTest {
    @Test fun elModoCambiaEnLosCortesCompactoMedioYAmplio() {
        assertEquals(AndroidNavigationMode.BOTTOM_BAR, AndroidNavigationPolicy.mode(599))
        assertEquals(AndroidNavigationMode.RAIL, AndroidNavigationPolicy.mode(600))
        assertEquals(AndroidNavigationMode.RAIL, AndroidNavigationPolicy.mode(839))
        assertEquals(AndroidNavigationMode.DRAWER, AndroidNavigationPolicy.mode(840))
    }

    @Test fun laBarraCompactaConservaHastaCuatroDestinosYElRestoEnMas() {
        val sections = listOf(
            AndroidSection.HOME,
            AndroidSection.PATIENTS,
            AndroidSection.QUEUE,
            AndroidSection.BEDS,
            AndroidSection.APPOINTMENTS,
            AndroidSection.PROFILE,
        )

        val partition = AndroidNavigationPolicy.compact(sections)

        assertEquals(4, partition.primary.size)
        assertTrue(AndroidSection.HOME in partition.primary)
        assertEquals(sections, partition.primary + partition.overflow)
    }

    @Test fun cincoDestinosOCuatroNoCreanUnMenuMasInnecesario() {
        val sections = listOf(
            AndroidSection.HOME,
            AndroidSection.SHIFTS,
            AndroidSection.RESULTS,
            AndroidSection.PROFILE,
        )

        val partition = AndroidNavigationPolicy.compact(sections)

        assertEquals(sections, partition.primary)
        assertTrue(partition.overflow.isEmpty())
    }
}
