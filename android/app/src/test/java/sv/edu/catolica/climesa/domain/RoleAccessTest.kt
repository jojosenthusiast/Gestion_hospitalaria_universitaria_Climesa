package sv.edu.catolica.climesa.domain
import org.junit.Assert.*
import org.junit.Test
class RoleAccessTest {
    private fun profile(roles:List<String>,verified:Boolean=true,platforms:List<String> = listOf("android"))=AccessProfile(roles=roles,permissions=listOf("sesion.perfil"),verifiedByBackend=verified,platforms=platforms)
    @Test fun exposesExactlyEightAndroidRoles(){assertEquals(8,RoleAccess.allowed(profile(RoleAccess.androidRoles+"ADM"),"android").size)}
    @Test fun operationsChiefUsesAndroid(){
        assertTrue("JOP" in RoleAccess.androidRoles)
        assertEquals(listOf("JOP"),RoleAccess.allowed(profile(listOf("JOP")),"android"))
        assertEquals("Jefe de Operaciones",RoleAccess.label("JOP"))
    }
    @Test fun rejectsUnverifiedProfileAndWrongPlatform(){assertTrue(RoleAccess.allowed(profile(listOf("MED"),false),"android").isEmpty());assertTrue(RoleAccess.allowed(profile(listOf("MED"),platforms=listOf("ios")),"android").isEmpty())}
    @Test fun medicalAndPatientTabsDiffer(){
        val medico=AndroidSections.visible(listOf("sesion.perfil","turnos.ver","consulta.iniciar"))
        val paciente=AndroidSections.visible(listOf("sesion.perfil","citas.ver","resultados.ver"))
        assertTrue(AndroidSection.SHIFTS in medico);assertFalse(AndroidSection.SHIFTS in paciente)
    }
    @Test fun registrationEnforcesConfirmationAndStrongPassword(){assertTrue(RegistrationRules.validate("Cuenta Ejemplo","ejemplo@example.test","Segura#2026","Segura#2026").isEmpty());assertEquals(4,RegistrationRules.validate("A","correo","123","456").size)}
}
