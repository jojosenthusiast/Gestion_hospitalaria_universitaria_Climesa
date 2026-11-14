package sv.edu.catolica.climesa.domain
import org.junit.Assert.*
import org.junit.Test
class RoleAccessTest {
    private val allSections = AndroidSection.entries.map(AndroidSection::permission)
    private fun profile(roles:List<String>,verified:Boolean=true,platforms:List<String> = listOf("android"),permissions:List<String> = allSections)=AccessProfile(roles=roles,permissions=permissions,verifiedByBackend=verified,platforms=platforms)
    @Test fun exposesExactlySixAndroidRoles(){
        assertEquals(listOf("REC","AST","ENF","MED","PAR","PAC"),AndroidSections.roles)
        assertEquals(6,RoleAccess.allowed(profile(AndroidSections.roles+"ADM"),"android").size)
    }
    @Test fun operationsChiefAndLaboratoryDoNotUseAndroid(){
        assertTrue(RoleAccess.allowed(profile(listOf("JOP"),permissions=listOf("sesion.perfil","turnos.ver")),"android").isEmpty())
        assertTrue(RoleAccess.allowed(profile(listOf("LAB")),"android").isEmpty())
        assertEquals("Jefe de Operaciones",RoleAccess.label("JOP"))
    }
    @Test fun rejectsUnverifiedProfileAndWrongPlatform(){assertTrue(RoleAccess.allowed(profile(listOf("MED"),false),"android").isEmpty());assertTrue(RoleAccess.allowed(profile(listOf("MED"),platforms=listOf("ios")),"android").isEmpty())}
    @Test fun theBackendPlatformDecidesEntryNotALocalRoleList(){
        // Without "android" in the backend platforms, no role enters, even with permissions.
        assertTrue(RoleAccess.allowed(profile(listOf("MED","PAC"),platforms=listOf("web")),"android").isEmpty())
        // A web-only role (ADM) never enters, even when another role of the account brings "android".
        assertEquals(listOf("MED"),RoleAccess.allowed(profile(listOf("ADM","MED")),"android"))
        // This client only answers for Android.
        assertTrue(RoleAccess.allowed(profile(listOf("MED"),platforms=listOf("android","ios")),"ios").isEmpty())
    }
    @Test fun aRoleWithoutOperationalPermissionsDoesNotEnter(){
        assertTrue(RoleAccess.allowed(profile(listOf("MED"),permissions=listOf("sesion.perfil")),"android").isEmpty())
        assertEquals(listOf("MED"),RoleAccess.allowed(profile(listOf("MED"),permissions=listOf("sesion.perfil","consulta.iniciar")),"android"))
        assertTrue(RoleAccess.allowed(profile(listOf("MED"),permissions=listOf("consulta.iniciar")),"android").isEmpty())
    }
    @Test fun keepsTheCatalogOrderForTheRoleSelector(){
        assertEquals(listOf("MED","PAC"),RoleAccess.allowed(profile(listOf("PAC","MED")),"android"))
    }
    @Test fun medicalAndPatientTabsDiffer(){
        val medico=AndroidSections.visible("MED",listOf("sesion.perfil","turnos.ver","consulta.iniciar"))
        val paciente=AndroidSections.visible("PAC",listOf("sesion.perfil","citas.ver","resultados.ver"))
        assertTrue(AndroidSection.SHIFTS in medico);assertFalse(AndroidSection.SHIFTS in paciente)
    }
    @Test fun registrationEnforcesConfirmationAndStrongPassword(){assertTrue(RegistrationRules.validate("Cuenta Ejemplo","ejemplo@example.test","Segura#2026","Segura#2026").isEmpty());assertEquals(4,RegistrationRules.validate("A","correo","123","456").size)}
}
