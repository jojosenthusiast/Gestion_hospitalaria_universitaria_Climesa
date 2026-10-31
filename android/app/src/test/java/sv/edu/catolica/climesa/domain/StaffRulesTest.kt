package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StaffRulesTest {
    private val valido = StaffDraft(givenNames = "Ana Lucía", surnames = "Ejemplo Pérez", type = "enfermero", phone = "7000-0000")

    @Test fun validaNombresFuncionYTelefono() {
        assertTrue(StaffRules.validate(valido).isEmpty())
        assertTrue("givenNames" in StaffRules.validate(valido.copy(givenNames = "A")))
        assertTrue("givenNames" in StaffRules.validate(valido.copy(givenNames = "1234")))
        assertTrue("type" in StaffRules.validate(valido.copy(type = "director")))
        assertTrue("phone" in StaffRules.validate(valido.copy(phone = "123")))
    }

    @Test fun validaDuiConVerificador() {
        assertTrue("dui" in StaffRules.validate(valido.copy(dui = "00000000-0")))
        assertFalse("dui" in StaffRules.validate(valido.copy(dui = "")))
    }

    @Test fun inactivarEsUnPatchConActivoFalseVersionYMotivo() {
        val body = StaffRules.updateBody(valido, active = false, version = 3, reason = "  Cambio de turno de jornada  ")
        assertEquals(false, body.getBoolean("active"))
        assertEquals(3, body.getInt("version"))
        assertEquals("Cambio de turno de jornada", body.getString("reason"))
        assertEquals("enfermero", body.getString("type"))
    }

    @Test fun altaNoLlevaVersionNiMotivo() {
        val body = StaffRules.createBody(valido)
        assertFalse(body.has("version"))
        assertFalse(body.has("reason"))
        assertEquals(JSONObject.NULL, body.get("areaId"))
    }

    @Test fun permisosDeGestionSeCombinanConVer() {
        assertTrue(StaffRules.canView(listOf("personal.ver")))
        assertFalse(StaffRules.canManage(listOf("personal.ver")))
        assertTrue(StaffRules.canManage(listOf("personal.ver", "personal.gestionar")))
        assertFalse(StaffRules.canSeePersonalData(listOf("personal.ver")))
    }

    @Test fun parseaLaRespuestaTolerandoCamposOpcionales() {
        val rows = JSONArray("""[{"id":"s1","givenNames":"Luis","surnames":"Ejemplo","type":"paramedico","active":false,"version":4,"areaId":null}]""")
        val staff = StaffRules.parse(rows).single()
        assertEquals("s1", staff.id)
        assertFalse(staff.active)
        assertEquals(4, staff.version)
        assertNull(staff.areaId)
        assertEquals("Paramédico", StaffRules.typeLabel(staff.type))
    }
}
