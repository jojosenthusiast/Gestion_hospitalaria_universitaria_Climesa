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

    @Test fun laBarraCompactaPriorizaInicioDosOperacionesYPerfil() {
        val sections = listOf(
            AndroidSection.HOME,
            AndroidSection.PATIENTS,
            AndroidSection.QUEUE,
            AndroidSection.BEDS,
            AndroidSection.APPOINTMENTS,
            AndroidSection.PROFILE,
        )

        val partition = AndroidNavigationPolicy.compact(sections)

        assertEquals(listOf(AndroidSection.HOME, AndroidSection.PATIENTS, AndroidSection.QUEUE, AndroidSection.PROFILE), partition.primary)
        assertEquals(sections.toSet(), (partition.primary + partition.overflow).toSet())
    }

    @Test fun sinInicioCaenTresOperacionesYElHospitalQuedaEnElMenuSecundario() {
        val sections = listOf(
            AndroidSection.SHIFTS,
            AndroidSection.RESULTS,
            AndroidSection.HISTORY,
            AndroidSection.MY_ACCESS,
            AndroidSection.HOSPITAL_INFO,
            AndroidSection.PROFILE,
        )

        val partition = AndroidNavigationPolicy.compact(sections)

        assertEquals(listOf(AndroidSection.SHIFTS, AndroidSection.RESULTS, AndroidSection.HISTORY, AndroidSection.PROFILE), partition.primary)
        assertEquals(listOf(AndroidSection.MY_ACCESS, AndroidSection.HOSPITAL_INFO), partition.overflow)
    }
}
