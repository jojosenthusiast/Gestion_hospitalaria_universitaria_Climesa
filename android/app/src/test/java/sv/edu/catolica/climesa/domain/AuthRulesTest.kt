package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRulesTest {
    @Test fun acceptsValidCredentials() {
        assertTrue(AuthRules.validate("admin@climesa.test", "Segura#2026").isEmpty())
    }

    @Test fun acceptsDemoEmailWithoutDomainDot() {
        assertTrue(AuthRules.validate("enf@climesa", "Segura#2026").isEmpty())
    }

    @Test fun rejectsEmailWithSpacesOrTwoAtSigns() {
        assertEquals("Ingresa un correo válido.", AuthRules.validate("enf @climesa", "Segura#2026")["email"])
        assertEquals("Ingresa un correo válido.", AuthRules.validate("a@b@climesa", "Segura#2026")["email"])
    }

    @Test fun rejectsInvalidEmailAndShortPassword() {
        val errors = AuthRules.validate("correo-invalido", "123")
        assertEquals("Ingresa un correo válido.", errors["email"])
        assertEquals("La contraseña debe tener al menos 8 caracteres.", errors["password"])
    }
}
