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

    @Test fun laBarraCompactaPriorizaTresOperacionesYPerfil() {
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
        assertTrue(AndroidSection.PROFILE in partition.primary)
        assertTrue(AndroidSection.HOME !in partition.primary)
        assertEquals(sections.toSet(), (partition.primary + partition.overflow).toSet())
    }

    @Test fun inicioYHospitalQuedanEnElMenuSecundario() {
        val sections = listOf(
            AndroidSection.HOME,
            AndroidSection.SHIFTS,
            AndroidSection.RESULTS,
            AndroidSection.PROFILE,
        )

        val partition = AndroidNavigationPolicy.compact(sections)

        assertEquals(listOf(AndroidSection.SHIFTS, AndroidSection.RESULTS, AndroidSection.PROFILE), partition.primary)
        assertEquals(listOf(AndroidSection.HOME), partition.overflow)
    }
}
