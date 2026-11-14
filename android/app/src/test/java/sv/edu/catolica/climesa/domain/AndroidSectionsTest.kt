package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidSectionsTest {
    private val paramedico = listOf("sesion.perfil", "pacientes.buscar", "pacientes.registrar_provisional", "turnos.ver", "ambulancia.ver_estado", "ambulancia.operar", "ambulancia.reportar_prehospital", "ambulancia.ver_bitacora")

    @Test fun paramedicoVeSoloSusDestinosCatalogados() {
        assertEquals(
            listOf(AndroidSection.HOME, AndroidSection.SERVICE, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            AndroidSections.visible("PAR", paramedico),
        )
    }

    @Test fun lasSeccionesSalenDelPermisoDentroDelCatalogoDelRol() {
        val enfermeria = AndroidSections.visible("ENF", listOf("sesion.perfil", "admision.ver", "camas.registrar_limpieza", "turnos.ver", "ambulancia.ver_estado"))
        assertTrue(AndroidSection.WARD in enfermeria)
        assertTrue(AndroidSection.CLEANING in enfermeria)
        assertFalse(AndroidSection.BEDS in enfermeria)
        assertFalse(AndroidSection.UNIT in enfermeria)
        assertEquals(AndroidSection.HOME, enfermeria.first())
        assertEquals(AndroidSection.WARD, enfermeria[1])
        assertEquals(AndroidSection.PROFILE, enfermeria.last())
    }

    @Test fun sinPermisoDeCamasNoHayTablero() {
        assertFalse(AndroidSection.BEDS in AndroidSections.visible("REC", listOf("sesion.perfil", "turnos.ver")))
    }

    @Test fun soloHospitalYPerfilSignificaQueElRolNoTieneFlujoOperativo() {
        assertFalse(AndroidSections.hasAppScreens("MED", listOf("sesion.perfil")))
        assertTrue(AndroidSections.hasAppScreens("MED", listOf("sesion.perfil", "consulta.iniciar")))
    }

    @Test fun jefeDeOperacionesYLaboratorioNoUsanAndroid() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet()
        assertFalse("JOP" in AndroidSections.roles)
        assertFalse("LAB" in AndroidSections.roles)
        assertTrue(AndroidSections.visible("JOP", permissions).isEmpty())
        assertTrue(AndroidSections.visible("LAB", permissions).isEmpty())
        assertFalse(AndroidSections.hasAppScreens("JOP", permissions))
        assertFalse(AndroidSections.hasAppScreens("LAB", permissions))
    }

    @Test fun asistenteYEnfermeriaComparteUnSoloCatalogoFiltradoPorPermisos() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet()
        assertEquals(AndroidSections.visible("AST", permissions), AndroidSections.visible("ENF", permissions))
        val asistente = AndroidSections.visible("AST", listOf("sesion.perfil", "fila.llamar", "signos.registrar", "turnos.ver"))
        assertEquals(listOf(AndroidSection.HOME, AndroidSection.VITAL_SIGNS, AndroidSection.ASSISTANT_STATION, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE), asistente)
        // "Paciente hospitalizado" opens the same screen as "Mi planta": it is not a second entry.
        assertFalse(AndroidSection.INPATIENT_CARE in AndroidSections.visible("ENF", permissions))
    }

    @Test fun elMedicoTieneUnaSolaEntradaALaConsulta() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet()
        val medico = AndroidSections.visible("MED", permissions)
        assertTrue(AndroidSection.MEDICAL_DAY in medico)
        assertFalse(AndroidSection.CONSULTATIONS in medico)
    }

    @Test fun losRolesDeAndroidQuedanLimitadosASuCatalogoDePantallas() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet() + setOf("turnos.ver_borradores", "turnos.publicar")
        val station = listOf(AndroidSection.HOME, AndroidSection.VITAL_SIGNS, AndroidSection.ASSISTANT_STATION, AndroidSection.WARD, AndroidSection.CLEANING, AndroidSection.SUPPLIES, AndroidSection.AMBULANCE_RECEPTION, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE)
        val expected = mapOf(
            "REC" to listOf(AndroidSection.HOME, AndroidSection.QUEUE, AndroidSection.PATIENTS, AndroidSection.APPOINTMENTS, AndroidSection.LINKING, AndroidSection.ADMISSION, AndroidSection.BEDS, AndroidSection.DISPATCH, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "AST" to station,
            "ENF" to station,
            "MED" to listOf(AndroidSection.HOME, AndroidSection.MEDICAL_DAY, AndroidSection.RESULT_REVIEW, AndroidSection.HOSPITALIZED, AndroidSection.RECORD, AndroidSection.VITAL_SIGNS, AndroidSection.AMBULANCE_ARRIVAL, AndroidSection.UNIT, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "PAR" to listOf(AndroidSection.HOME, AndroidSection.SERVICE, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
            "PAC" to listOf(AndroidSection.HOME, AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS, AndroidSection.LINK_RECORD, AndroidSection.HISTORY, AndroidSection.AMBULANCE_REQUEST, AndroidSection.HOSPITAL_INFO, AndroidSection.MY_ACCESS, AndroidSection.PROFILE),
        )
        // Every role lands on the dashboard ("Inicio", A04 in the catalog).
        val principalScreens = AndroidSections.roles.associateWith { "A04" }

        assertEquals(AndroidSections.roles.toSet(), expected.keys)
        expected.forEach { (role, sections) ->
            assertEquals("Catálogo incorrecto para $role", sections, AndroidSections.visible(role, permissions))
            assertEquals("Destino principal incorrecto para $role", principalScreens[role], sections.first().screenId)
            assertTrue("Destino sin código Axx para $role", sections.all { it.screenId.matches(Regex("A\\d{2}")) })
        }
    }

    @Test fun todosLosRolesAterrizanEnSuTableroDeInicio() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet()
        AndroidSections.roles.forEach { role -> assertEquals("Inicio de $role", AndroidSection.HOME, AndroidSections.visible(role, permissions).first()) }
    }

    @Test fun planificacionYPersonalSiguenFueraDeAndroidPorqueNoEstanCatalogados() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission).toSet()
        AndroidSections.roles.forEach { role ->
            assertFalse(AndroidSections.visible(role, permissions).any { it.permission == "turnos.planificar" || it.permission == "personal.ver" })
        }
    }

    @Test fun lasSeccionesSinPantallaQuedanComoProximaEntrega() {
        assertTrue(AndroidSection.SERVICE.ready)
        assertTrue(AndroidSection.LOG.ready)
        assertTrue(AndroidSection.UNIT.ready)
        assertTrue(AndroidSection.BEDS.ready)
    }
}
