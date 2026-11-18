package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test

class HospitalizationRulesTest {
    @Test fun laPlantaVaciaDeEnfermeriaExplicaElTurno() {
        assertTrue(HospitalizationRules.wardFollowsShift(listOf("area")))
        assertFalse(HospitalizationRules.wardFollowsShift(listOf("area", "x")))
        assertFalse(HospitalizationRules.wardFollowsShift(listOf("relacion")))
        assertFalse(HospitalizationRules.wardFollowsShift(emptyList()))
    }

    private fun row(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }

    @Test fun parsesTheServerFieldsOfEachAdmission() {
        val rows = JSONArray().put(row(
            "id" to "ad1", "patientName" to "Ana", "state" to "hospitalizado", "bed" to "B-101", "requestedCategory" to "semiprivada",
            "isolation" to false, "version" to 4, "occupationId" to "oc1", "bedCategory" to "semiprivada", "authorized" to true,
            "attendingDoctorName" to "Dra. López", "attendingDoctorHasAccount" to true, "dischargeRequestedAt" to "2026-11-14T10:00:00Z",
            "discharge" to row("type" to "voluntaria", "signedAt" to "2026-11-14T11:00:00Z", "signedByName" to "Dra. López",
                "pending" to JSONArray().put(row("description" to "Control en 7 días", "responsible" to "Dra. López"))),
            "allowedActions" to JSONArray().put("firmar_alta").put("trasladar").put("anular").put("desconocida"),
        ))
        val a = AdmissionParser.admissions(rows).single()
        assertEquals("oc1", a.occupationId)
        assertEquals("semiprivada", a.bedCategory)
        assertTrue(a.authorized)
        assertEquals("Dra. López", a.attendingDoctorName)
        assertTrue(a.attendingDoctorHasAccount)
        assertEquals("2026-11-14T10:00:00Z", a.dischargeRequestedAt)
        assertEquals(DischargeType.VOLUNTARY, a.discharge?.type)
        assertEquals(listOf(DischargePending("Control en 7 días", "Dra. López")), a.discharge?.pending)
        assertEquals("only the actions Android offers; unknown and web-only ones are dropped", setOf(AdmissionAction.SIGN_DISCHARGE, AdmissionAction.TRANSFER), a.allowedActions)
    }

    @Test fun withoutACareRelationshipTheDischargeIsOperationalOnly() {
        val rows = JSONArray().put(row(
            "id" to "ad2", "state" to "alta_firmada",
            "discharge" to row("type" to null, "signedAt" to "2026-11-14T11:00:00Z", "signedByName" to "Dra. López", "pending" to null, "pendingCount" to 2, "specialHandling" to true),
        ))
        val d = AdmissionParser.admissions(rows).single().discharge!!
        assertNull("D-031: the type is clinical", d.type)
        assertNull("D-031: the pending descriptions are clinical", d.pending)
        assertEquals(2, d.pendingCount)
        assertTrue(d.specialHandling)
    }

    @Test fun anOlderRowWithoutTheNewFieldsOffersNoAction() {
        val a = AdmissionParser.admissions(JSONArray().put(row("id" to "ad1", "state" to "hospitalizado", "dischargeRequestedAt" to null, "discharge" to null))).single()
        assertTrue(a.allowedActions.isEmpty())
        assertNull(a.discharge)
        assertNull(a.dischargeRequestedAt)
        assertNull(a.attendingDoctorName)
        assertFalse(a.attendingDoctorHasAccount)
    }

    @Test fun waitingHintExplainsWhoSignsOrThatJefaturaMustReassign() {
        val base = HospitalAdmission("ad1", "Ana", "hospitalizado", "B-101", "vip", false, 4, attendingDoctorName = "Dr. Ramírez", attendingDoctorHasAccount = true)
        assertEquals("Esperando alta médica: la firma Dr. Ramírez desde la app.", HospitalizationRules.waitingDischargeHint(base))
        assertEquals("El médico tratante no tiene cuenta en la app; pide a Jefatura que reasigne el tratante.", HospitalizationRules.waitingDischargeHint(base.copy(attendingDoctorHasAccount = false)))
        assertNull("the signer sees the button, not the hint", HospitalizationRules.waitingDischargeHint(base.copy(allowedActions = setOf(AdmissionAction.SIGN_DISCHARGE))))
        assertNull(HospitalizationRules.waitingDischargeHint(base.copy(state = "pendiente_cama")))
    }

    @Test fun summaryIsOptionalButValidatedWhenWritten() {
        assertNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, "", emptyList(), false))
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, "corto", emptyList(), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, "Evolución favorable, sin fiebre.", emptyList(), false))
        assertFalse(HospitalizationRules.dischargeBody(2, DischargeType.MEDICAL, "  ", emptyList(), false).has("summary"))
    }

    @Test fun reasonBodiesCarryVersionAndTrimmedReason() {
        assertNotNull(HospitalizationRules.reasonError("corto"))
        val cancel = HospitalizationRules.reasonBody(3, "  Ingreso duplicado por error  ")
        assertEquals(3, cancel.getInt("version")); assertEquals("Ingreso duplicado por error", cancel.getString("reason"))
        val request = HospitalizationRules.dischargeRequestBody(5, "")
        assertEquals(5, request.getInt("version")); assertFalse(request.has("note"))
        assertEquals("Familia lista", HospitalizationRules.dischargeRequestBody(5, " Familia lista ").getString("note"))
        assertEquals("3/500", HospitalizationRules.counter(" abc ", ChangeReason.MAX))
    }

    @Test fun transferOffersFreeBedsOfTheSameCategoryExceptTheCurrentOne() {
        val beds = JSONArray()
            .put(row("id" to "b1", "code" to "B-101", "room" to "H1", "category" to "vip", "state" to "libre", "version" to 1))
            .put(row("id" to "b2", "code" to "B-102", "room" to "H1", "category" to "vip", "state" to "libre", "version" to 2))
            .put(row("id" to "b3", "code" to "B-103", "room" to "H2", "category" to "semiprivada", "state" to "libre", "version" to 1))
            .put(row("id" to "b4", "code" to "B-104", "room" to "H2", "category" to "vip", "state" to "ocupada", "version" to 1))
        val admission = HospitalAdmission("ad1", "Ana", "hospitalizado", "B-101", "vip", false, 4, bedCategory = "vip")
        assertEquals(listOf("b2"), HospitalizationRules.transferCandidates(AdmissionParser.beds(beds), admission).map { it.id })
        val body = HospitalizationRules.transferBody("b2", 4, " Cambio por aislamiento ")
        assertEquals("b2", body.getString("bedId")); assertEquals(4, body.getInt("version")); assertEquals("Cambio por aislamiento", body.getString("reason"))
    }

    @Test fun nursingNotesParseAndValidate() {
        val notes = AdmissionParser.notes(JSONArray().put(row("id" to "n1", "text" to "Paciente estable", "createdAt" to "2026-11-14T10:00:00Z", "authorName" to null)))
        assertEquals(NursingNote("n1", "Paciente estable", "2026-11-14T10:00:00Z", null), notes.single())
        assertNotNull(HospitalizationRules.noteError("   "))
        assertNull(HospitalizationRules.noteError("Toma de signos sin novedad"))
        assertEquals("Sin novedad", HospitalizationRules.noteBody(" Sin novedad ").getString("text"))
    }

    @Test fun problemCodesBecomeSpanishMessages() {
        assertEquals("La admisión cambió de estado; vuelve a cargar.", HospitalizationRules.problemMessage("transicion_invalida", "State changed"))
        assertEquals("La admisión cambió mientras la mirabas. Actualizamos la lista; revisa e intenta de nuevo.", HospitalizationRules.problemMessage("version_conflicto", null))
        assertEquals("El médico tratante no tiene cuenta.", HospitalizationRules.problemMessage("conflicto", "El médico tratante no tiene cuenta."))
        assertEquals("No se pudo completar la operación.", HospitalizationRules.problemMessage(null, null))
    }

    @Test fun eachPendingNeedsDescriptionAndResponsible() {
        val summary = "Evolución favorable, sin fiebre."
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending("Control en 7 días", "")), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending("Control en 7 días", "Dra. López")), false))
        assertNull("an empty row is ignored", HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending()), false))
    }

    @Test fun voluntaryDischargeNeedsConsent() {
        val summary = "Paciente solicita el alta voluntaria."
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.VOLUNTARY, summary, emptyList(), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.VOLUNTARY, summary, emptyList(), true))
    }

    @Test fun dischargeBodyCarriesTheTypedTextAndTheAdmissionVersion() {
        val body = HospitalizationRules.dischargeBody(6, DischargeType.MEDICAL, "  Evolución favorable.  ", listOf(DischargePending("Control", "Dra. López"), DischargePending()), false)
        assertEquals("medica", body.getString("type"))
        assertEquals("Evolución favorable.", body.getString("summary"))
        assertEquals(1, body.getJSONArray("pending").length())
        assertEquals("Control", body.getJSONArray("pending").getJSONObject(0).getString("description"))
        assertEquals("Dra. López", body.getJSONArray("pending").getJSONObject(0).getString("responsible"))
        assertEquals(6, body.getInt("version"))
        assertFalse(body.has("voluntaryConsent"))
    }

    @Test fun assignReasonIsOptionalButValidatedWhenWritten() {
        assertNull(HospitalizationRules.assignReasonError(""))
        assertNotNull(HospitalizationRules.assignReasonError("corto"))
        val body = HospitalizationRules.assignBody("b1", 7, "")
        assertEquals(7, body.getInt("version"))
        assertFalse(body.has("reason"))
        assertEquals("Cama aislada por indicación", HospitalizationRules.assignBody("b1", 7, " Cama aislada por indicación ").getString("reason"))
    }

    @Test fun exitNeedsAReasonAndSendsTheAdmissionVersion() {
        assertNotNull(HospitalizationRules.exitReasonError(""))
        val body = HospitalizationRules.exitBody(3, "Egreso con familiar responsable")
        assertEquals(3, body.getInt("version"))
        assertEquals("Egreso con familiar responsable", body.getString("reason"))
    }
}
