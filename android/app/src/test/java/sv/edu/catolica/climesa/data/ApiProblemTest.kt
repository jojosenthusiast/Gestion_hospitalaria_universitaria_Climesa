package sv.edu.catolica.climesa.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiProblemTest {
    @Test fun fieldMessagesGoToTheirFieldAndTheBannerKeepsTheSpanishDetail() {
        val body = """{"codigo":"validacion","detail":"Revisa los datos del formulario.","requestId":"req-1ua","errors":[{"field":"motive","message":"El motivo debe tener entre 10 y 500 caracteres."}]}"""
        val problem = ApiProblems.parse(body, 400)
        assertEquals(mapOf("motive" to "El motivo debe tener entre 10 y 500 caracteres."), problem.fields)
        assertEquals("Revisa los datos del formulario.\nCódigo de soporte: req-1ua", problem.message)
    }

    @Test fun rawEnglishValidationNeverReachesTheScreen() {
        val body = """{"codigo":"validacion","detail":"motive must be a string motive must be longer than or equal to 10 characters","campo":"motive","requestId":"req-9"}"""
        val problem = ApiProblems.parse(body, 400)
        assertTrue(problem.fields.isEmpty())
        assertEquals("Revisa los datos del formulario e intenta de nuevo.\nCódigo de soporte: req-9", problem.message)
        assertFalse(ApiProblems.readable("originId must be a UUID"))
        assertFalse(ApiProblems.readable("El identificador uuid no es válido"))
    }

    @Test fun theOlderSingleFieldShapeStillMapsToTheField() {
        val problem = ApiProblems.parse("""{"detail":"El médico tratante no está activo.","campo":"attendingDoctorId"}""", 400)
        assertEquals("El médico tratante no está activo.", problem.fields["attendingDoctorId"])
        assertEquals("El médico tratante no está activo.", problem.message)
    }

    @Test fun withoutABodyTheStatusExplainsTheFailure() {
        assertEquals("No tienes permiso para esta acción.", ApiProblems.parse("<html>", 403).message)
        assertEquals("El servidor no pudo completar la operación. Intenta de nuevo en un momento.", apiErrorMessage("", 502))
    }

    @Test fun fieldErrorsAreReadFromTheException() {
        val e = AuthRequestException("x", 400, "validacion", """{"errors":[{"field":"rejectionReason","message":"Indica el motivo del rechazo."}]}""")
        assertEquals("Indica el motivo del rechazo.", ApiProblems.fieldErrors(e)["rejectionReason"])
        assertTrue(ApiProblems.fieldErrors(IllegalStateException()).isEmpty())
    }
}
