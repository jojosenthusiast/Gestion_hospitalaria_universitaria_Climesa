package sv.edu.catolica.climesa.domain
import org.junit.Assert.*
import org.junit.Test
class RoleAccessTest {
    private fun profile(roles:List<String>,verified:Boolean=true,platforms:List<String> = listOf("android"))=AccessProfile(roles=roles,permissions=listOf("sesion.perfil"),verifiedByBackend=verified,platforms=platforms)
    @Test fun exposesExactlySevenAndroidRoles(){assertEquals(7,RoleAccess.allowed(profile(RoleAccess.androidRoles+"ADM"),"android").size)}
    @Test fun rejectsUnverifiedProfileAndWrongPlatform(){assertTrue(RoleAccess.allowed(profile(listOf("MED"),false),"android").isEmpty());assertTrue(RoleAccess.allowed(profile(listOf("MED"),platforms=listOf("ios")),"android").isEmpty())}
    @Test fun medicalAndPatientTabsDiffer(){assertTrue("Mis turnos" in RoleAccess.sections("MED"));assertFalse("Mis turnos" in RoleAccess.sections("PAC"))}
    @Test fun registrationEnforcesConfirmationAndStrongPassword(){assertTrue(RegistrationRules.validate("Cuenta Ejemplo","ejemplo@example.test","Segura#2026","Segura#2026").isEmpty());assertEquals(4,RegistrationRules.validate("A","correo","123","456").size)}
}
