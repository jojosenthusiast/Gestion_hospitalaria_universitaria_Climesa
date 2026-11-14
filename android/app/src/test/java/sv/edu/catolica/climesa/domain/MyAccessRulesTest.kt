package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MyAccessRulesTest {
    @Test fun parsesRoleDateAndReasonWithoutNames() {
        val rows = JSONArray()
            .put(JSONObject().put("fecha", "2026-11-14T16:32:00.000Z").put("rol", "Médico").put("tipoDato", "consulta").put("motivo", "atención").put("accesoExcepcional", false))
            .put(JSONObject().put("fecha", "2026-11-14T17:00:00.000Z").put("rol", "Jefe de Operaciones").put("tipoDato", "consulta").put("motivo", "acceso excepcional").put("accesoExcepcional", true))
            .put(JSONObject().put("rol", "Sin fecha"))
        val entries = MyAccessRules.parse(rows)
        assertEquals(listOf("Médico", "Jefe de Operaciones"), entries.map { it.role })
        assertTrue(entries[1].exceptional)
        assertEquals("consulta", entries[0].dataKind)
    }

    @Test fun showsHospitalLocalTime() {
        val text = MyAccessRules.displayDate("2026-11-14T16:32:00Z")
        assertTrue(text, text.startsWith("14 ") && text.endsWith("10:32"))
        assertEquals("no-es-fecha", MyAccessRules.displayDate("no-es-fecha"))
    }

    @Test fun anythingButAnArrayIsEmpty() {
        assertTrue(MyAccessRules.parse(JSONObject()).isEmpty())
    }

    @Test fun theSectionIsReadyForPatients() {
        assertTrue(AndroidSection.MY_ACCESS.ready)
        assertTrue(AndroidSection.MY_ACCESS in AndroidSections.visible("PAC", listOf("sesion.perfil", "auditoria.mis_accesos")))
    }
}
