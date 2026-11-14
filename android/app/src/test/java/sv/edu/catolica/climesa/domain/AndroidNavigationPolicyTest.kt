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

    private val everything = AndroidSection.entries.map(AndroidSection::permission).toSet()

    @Test fun laBarraTomaInicioYLasTareasNucleoDelRol() {
        val rec = AndroidNavigationPolicy.compact("REC", AndroidSections.visible("REC", everything))
        assertEquals(listOf(AndroidSection.HOME, AndroidSection.QUEUE, AndroidSection.PATIENTS, AndroidSection.APPOINTMENTS), rec.primary)
        val pac = AndroidNavigationPolicy.compact("PAC", AndroidSections.visible("PAC", everything))
        assertEquals(listOf(AndroidSection.HOME, AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS), pac.primary)
        val med = AndroidNavigationPolicy.compact("MED", AndroidSections.visible("MED", everything))
        assertEquals(listOf(AndroidSection.HOME, AndroidSection.MEDICAL_DAY, AndroidSection.RESULT_REVIEW, AndroidSection.HOSPITALIZED), med.primary)
    }

    @Test fun cadaSeccionVisibleEstaEnLaBarraOEnMasExactamenteUnaVez() {
        AndroidSections.roles.forEach { role ->
            val sections = AndroidSections.visible(role, everything)
            val nav = AndroidNavigationPolicy.compact(role, sections)
            val all = nav.primary + nav.overflow
            assertEquals("Duplicados en $role", all.size, all.toSet().size)
            assertEquals("Faltan secciones en $role", sections.toSet(), all.toSet())
            // Four tasks plus "Más" never exceed the five destinations Material allows.
            assertTrue("Barra demasiado larga en $role", nav.primary.size + 1 <= 5)
            assertEquals(AndroidSection.HOME, nav.primary.first())
        }
    }

    @Test fun masAgrupaTareasHospitalYCuenta() {
        val nav = AndroidNavigationPolicy.compact("PAC", AndroidSections.visible("PAC", everything))
        assertEquals(listOf(MoreGroup.TASKS, MoreGroup.HOSPITAL, MoreGroup.ACCOUNT), nav.more.map { it.group })
        assertEquals(listOf(AndroidSection.LINK_RECORD, AndroidSection.HISTORY, AndroidSection.AMBULANCE_REQUEST), nav.more[0].sections)
        assertEquals(listOf(AndroidSection.HOSPITAL_INFO, AndroidSection.MY_ACCESS), nav.more[1].sections)
        assertEquals(listOf(AndroidSection.PROFILE), nav.more[2].sections)
    }

    @Test fun conPocosPermisosLaBarraSeCompletaConLoQueHay() {
        val perms = listOf("sesion.perfil", "turnos.ver", "fila.llamar")
        val nav = AndroidNavigationPolicy.compact("AST", AndroidSections.visible("AST", perms))
        assertEquals(listOf(AndroidSection.HOME, AndroidSection.ASSISTANT_STATION, AndroidSection.SHIFTS), nav.primary)
        assertEquals(listOf(AndroidSection.PROFILE), nav.overflow)
    }

    @Test fun sinInicioCabenCuatroTareas() {
        val sections = listOf(AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS, AndroidSection.HISTORY, AndroidSection.PROFILE)
        val nav = AndroidNavigationPolicy.compact("PAC", sections)
        assertEquals(listOf(AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS, AndroidSection.HISTORY), nav.primary)
    }
}
