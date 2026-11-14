package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidSectionsTest {
    private val paramedico = listOf("sesion.perfil", "pacientes.buscar", "pacientes.registrar_provisional", "turnos.ver", "ambulancia.ver_estado", "ambulancia.operar", "ambulancia.reportar_prehospital", "ambulancia.ver_bitacora")

    @Test fun paramedicoVeSoloSusDestinosCatalogados() {
        assertEquals(
            listOf(AndroidSection.UNIT, AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT, AndroidSection.UNIDENTIFIED_PATIENT, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            AndroidSections.visible("PAR", paramedico),
        )
    }

    @Test fun lasSeccionesSalenDelPermisoDentroDelCatalogoDelRol() {
        val enfermeria = AndroidSections.visible("ENF", listOf("sesion.perfil", "admision.ver", "camas.registrar_limpieza", "turnos.ver", "ambulancia.ver_estado"))
        assertTrue(AndroidSection.WARD in enfermeria)
        assertTrue(AndroidSection.CLEANING in enfermeria)
        assertFalse(AndroidSection.BEDS in enfermeria)
        assertFalse(AndroidSection.UNIT in enfermeria)
        assertEquals(AndroidSection.WARD, enfermeria.first())
        assertEquals(AndroidSection.PROFILE, enfermeria.last())
    }

    @Test fun sinPermisoDeCamasNoHayTablero() {
        assertFalse(AndroidSection.BEDS in AndroidSections.visible("REC", listOf("sesion.perfil", "turnos.ver")))
    }

    @Test fun soloHospitalYPerfilSignificaQueElRolNoTieneFlujoOperativo() {
        assertFalse(AndroidSections.hasAppScreens("JOP", listOf("sesion.perfil")))
        assertTrue(AndroidSections.hasAppScreens("JOP", listOf("sesion.perfil", "turnos.ver")))
    }

    @Test fun elJefeDeOperacionesSoloVeDestinosAndroidCatalogados() {
        val jefe = AndroidSections.visible(
            "JOP",
            listOf("sesion.perfil", "camas.ver_tablero", "admision.crear", "inventario.mover", "turnos.ver", "turnos.ver_borradores", "turnos.planificar", "turnos.publicar"),
        )
        assertEquals(
            listOf(AndroidSection.ADMISSION, AndroidSection.BEDS, AndroidSection.SUPPLIES, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            jefe,
        )
        assertFalse(AndroidSection.PLANNING in jefe)
        assertFalse(AndroidSection.UNIT in jefe)
        assertFalse(AndroidSection.STAFF in jefe)
    }

    @Test fun losOchoRolesQuedanLimitadosASuCatalogoDePantallas() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet() + setOf("turnos.ver_borradores", "turnos.publicar")
        val expected = mapOf(
            "JOP" to listOf(AndroidSection.ADMISSION, AndroidSection.BEDS, AndroidSection.SUPPLIES, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "REC" to listOf(AndroidSection.PATIENTS, AndroidSection.QUEUE, AndroidSection.APPOINTMENTS, AndroidSection.LINKING, AndroidSection.ADMISSION, AndroidSection.BEDS, AndroidSection.DISPATCH, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "AST" to listOf(AndroidSection.ASSISTANT_STATION, AndroidSection.VITAL_SIGNS, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "ENF" to listOf(AndroidSection.WARD, AndroidSection.VITAL_SIGNS, AndroidSection.INPATIENT_CARE, AndroidSection.CLEANING, AndroidSection.SUPPLIES, AndroidSection.AMBULANCE_RECEPTION, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "MED" to listOf(AndroidSection.MEDICAL_DAY, AndroidSection.CONSULTATIONS, AndroidSection.RECORD, AndroidSection.RESULT_REVIEW, AndroidSection.HOSPITALIZED, AndroidSection.AMBULANCE_ARRIVAL, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "LAB" to listOf(AndroidSection.LAB, AndroidSection.SAMPLE, AndroidSection.CAPTURE_RESULTS, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "PAR" to listOf(AndroidSection.UNIT, AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT, AndroidSection.UNIDENTIFIED_PATIENT, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "PAC" to listOf(AndroidSection.HOME, AndroidSection.LINK_RECORD, AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS, AndroidSection.HISTORY, AndroidSection.AMBULANCE_REQUEST, AndroidSection.HOSPITAL_INFO, AndroidSection.MY_ACCESS, AndroidSection.PROFILE),
        )
        val principalScreens = mapOf("JOP" to "A34", "REC" to "A30", "AST" to "A40", "ENF" to "A50", "MED" to "A20", "LAB" to "A60", "PAR" to "A70", "PAC" to "A04")

        assertEquals(RoleAccess.androidRoles.toSet(), expected.keys)
        expected.forEach { (role, sections) ->
            assertEquals("Catálogo incorrecto para $role", sections, AndroidSections.visible(role, permissions))
            assertEquals("Destino principal incorrecto para $role", principalScreens[role], sections.first().screenId)
            assertTrue("Destino sin código Axx para $role", sections.all { it.screenId.matches(Regex("A\\d{2}")) })
        }
    }

    @Test fun lasSeccionesSinPantallaQuedanComoProximaEntrega() {
        assertFalse(AndroidSection.SERVICE.ready)
        assertFalse(AndroidSection.LOG.ready)
        assertTrue(AndroidSection.UNIT.ready)
        assertTrue(AndroidSection.BEDS.ready)
    }
}
