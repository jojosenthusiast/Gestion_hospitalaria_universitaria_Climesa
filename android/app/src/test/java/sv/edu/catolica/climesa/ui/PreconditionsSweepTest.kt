package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.ForbiddenMessages
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionAction
import sv.edu.catolica.climesa.domain.AdmissionParser
import sv.edu.catolica.climesa.domain.AmbulanceParser
import sv.edu.catolica.climesa.domain.AmbulanceRules
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.ClinicalHistoryParser
import sv.edu.catolica.climesa.domain.ConsultationRecordRules
import sv.edu.catolica.climesa.domain.ExternalRecordRules
import sv.edu.catolica.climesa.domain.PatientGate
import sv.edu.catolica.climesa.domain.PickPurpose
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.VitalsParser

/** Preconditions sweep: every action the API would refuse for a known precondition is blocked (or hidden) before the tap. */
@OptIn(ExperimentalCoroutinesApi::class)
class PreconditionsSweepTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() { Dispatchers.setMain(dispatcher); ForbiddenMessages.clear() }
    @After fun tearDown() = Dispatchers.resetMain()

    private object NoSignals : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }

    private fun selectorRow(id: String, extra: JSONObject.() -> Unit = {}) =
        JSONObject().put("id", id).put("record", "9900$id").put("fullName", "[DEMO] Paciente $id").apply(extra)
    private fun page(vararg rows: JSONObject) = JSONObject().put("items", JSONArray(rows.toList())).put("hasMore", false)

    // S1 ---------------------------------------------------------------------------------------------------------------

    @Test fun s1SelectorParsesTheNewFlagsAndDefaultsToTodayWhenAbsent() {
        val items = ReceptionScheduling.pickerPage(page(
            selectorRow("1"),
            selectorRow("2") { put("active", false).put("activeAdmission", true).put("careContext", false) },
        )).items
        assertTrue(items[0].active); assertFalse(items[0].activeAdmission); assertTrue(items[0].careContext)
        assertFalse(items[1].active); assertTrue(items[1].activeAdmission); assertFalse(items[1].careContext)
    }

    @Test fun s1GateGivesTheReasonPerPurpose() {
        val (plain, inactive, admitted, noCare) = ReceptionScheduling.pickerPage(page(
            selectorRow("1"),
            selectorRow("2") { put("active", false) },
            selectorRow("3") { put("activeAdmission", true) },
            selectorRow("4") { put("careContext", false) },
        )).items
        assertNull(PatientGate.blockedReason(plain, PickPurpose.CARE))
        assertNull(PatientGate.blockedReason(plain, PickPurpose.ADMISSION))
        assertNull(PatientGate.blockedReason(plain, PickPurpose.VITALS))
        assertEquals("Paciente inactivo: actívalo en Pacientes para atenderlo.", PatientGate.blockedReason(inactive, PickPurpose.CARE))
        assertEquals("Paciente inactivo: actívalo en Pacientes para atenderlo.", PatientGate.blockedReason(inactive, PickPurpose.ADMISSION))
        assertEquals("Ya tiene una admisión activa.", PatientGate.blockedReason(admitted, PickPurpose.ADMISSION))
        assertNull(PatientGate.blockedReason(admitted, PickPurpose.CARE))
        assertEquals("Solo puedes registrar signos de pacientes que atiendes.", PatientGate.blockedReason(noCare, PickPurpose.VITALS))
    }

    @Test fun s1BlockedRowIsNeverPickedByTheSharedSearch() {
        var state = PatientSearchState()
        val search = PatientSelectorSearch(FakeGateway(), TestScope(dispatcher), { state }) { state = it(state) }
        val rows = ReceptionScheduling.pickerPage(page(selectorRow("1") { put("active", false) }, selectorRow("2"))).items
        search.pick(rows[0])
        assertNull(state.patient)
        search.pick(rows[1])
        assertEquals("2", state.patient?.id)
    }

    @Test fun s1AdmissionIntakeAndAppointmentsRefuseBlockedPatients() = runTest(dispatcher) {
        val rows = ReceptionScheduling.pickerPage(page(selectorRow("1") { put("activeAdmission", true) }, selectorRow("2") { put("active", false) })).items
        val intake = AdmissionIntakeViewModel(FakeGateway(JSONObject()), NoSignals)
        intake.pickPatient(rows[0]); runCurrent()
        assertNull(intake.state.value.draft.patient)
        val booking = ReceptionAppointmentsViewModel(FakeGateway(JSONObject()), NoSignals)
        booking.pickPatient(rows[1]); runCurrent()
        assertNull(booking.state.value.patient)
    }

    @Test fun s1VitalsSearchMarksPatientsWithoutCareContextAndRanksThemLast() {
        val parsed = VitalsParser.search(page(selectorRow("1") { put("careContext", false) }, selectorRow("2"), selectorRow("3")))
        assertEquals("Solo puedes registrar signos de pacientes que atiendes.", parsed[0].blockedReason)
        assertNull(parsed[1].blockedReason)
        assertEquals(listOf("3", "2", "1"), VitalsParser.rankByContext(parsed, setOf("3")).map { it.patientId })
    }

    // S2 ---------------------------------------------------------------------------------------------------------------

    @Test fun s2ExpedienteListsRelatedPatientsFirstAndBlocksTheRest() = runTest(dispatcher) {
        val rows = JSONArray()
            .put(JSONObject().put("id", "p1").put("fullName", "[DEMO] Sin relación").put("record", "9900001").put("careRelation", false))
            .put(JSONObject().put("id", "p2").put("fullName", "[DEMO] Atendido").put("record", "9900002").put("careRelation", true))
            .put(JSONObject().put("id", "p3").put("fullName", "[DEMO] API antigua").put("record", "9900003"))
        val vm = ClinicalHistoryViewModel(FakeGateway(rows), NoSignals)
        vm.search("demo"); runCurrent()
        val found = vm.state.value.candidates
        assertEquals(listOf("p2", "p3", "p1"), found.map { it.id })
        assertNull(found[0].blockedReason); assertNull(found[1].blockedReason)
        assertEquals("Se habilita cuando hay una cita, consulta u hospitalización a tu cargo.", found[2].blockedReason)
    }

    // S3 ---------------------------------------------------------------------------------------------------------------

    @Test fun s3NursingNotesOnlyWhenTheAdmissionAllowsThem() {
        fun row(vararg actions: String) = JSONObject().put("id", "a1").put("state", "hospitalizado").put("allowedActions", JSONArray(actions.toList()))
        val list = AdmissionParser.admissions(JSONArray().put(row("nota_enfermeria")).put(row()))
        assertTrue(AdmissionAction.NURSING_NOTE in list[0].allowedActions)
        assertFalse(AdmissionAction.NURSING_NOTE in list[1].allowedActions)
    }

    // S4 ---------------------------------------------------------------------------------------------------------------

    @Test fun s4ExternalResultOnlyFromTheHistoryAllowedActions() {
        val perms = listOf(ExternalRecordRules.PERMISSION)
        fun history(actions: JSONArray?) = ClinicalHistoryParser.parse(JSONObject().put("patient", JSONObject().put("fullName", "[DEMO] P").put("record", "9900001"))
            .apply { actions?.let { put("allowedActions", it) } })!!
        assertTrue(ExternalRecordRules.canOffer(perms, history(JSONArray().put("resultado_externo")).allowedActions))
        assertFalse(ExternalRecordRules.canOffer(perms, history(JSONArray()).allowedActions))
        assertNull(history(null).allowedActions)
        assertTrue("older API keeps the permission rule", ExternalRecordRules.canOffer(perms, history(null).allowedActions))
        assertFalse(ExternalRecordRules.canOffer(emptyList(), history(JSONArray().put("resultado_externo")).allowedActions))
    }

    // S5 ---------------------------------------------------------------------------------------------------------------

    private fun ambulanceStatus(actions: JSONArray?) = AmbulanceParser.status(JSONObject()
        .put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "en_servicio"))
        .put("activeService", JSONObject().put("id", "s1").put("type", "emergencia").apply { actions?.let { put("allowedActions", it) } }))!!.activeService!!

    @Test fun s5CrewActionsFollowAllowedActions() {
        val crew = ambulanceStatus(JSONArray().put("hito").put("deshacer_hito").put("reportar"))
        assertTrue(crew.canAdvance && crew.canUndo && crew.canReport); assertFalse(crew.readOnly)
        val other = ambulanceStatus(JSONArray())
        assertFalse(other.canAdvance || other.canUndo || other.canReport); assertTrue(other.readOnly)
        assertEquals("No estás en la tripulación de este servicio.", AmbulanceService.NOT_CREW)
        val older = ambulanceStatus(null)
        assertNull(older.allowedActions); assertTrue(older.canAdvance && older.canReport); assertFalse(older.readOnly)
    }

    // S6 ---------------------------------------------------------------------------------------------------------------

    @Test fun s6UnlinkedPatientGetsTheLinkNoticeInsteadOfTheForm() {
        assertEquals("Vincula tu expediente para pedir una ambulancia. En una emergencia llama al 911.", AmbulanceRules.requestBlocker(null))
        assertEquals(AmbulanceRules.UNLINKED, AmbulanceRules.requestBlocker(" "))
        assertNull(AmbulanceRules.requestBlocker("p1"))
    }

    // S7 ---------------------------------------------------------------------------------------------------------------

    @Test fun s7SignIsBlockedUntilMotiveAndPlan() {
        assertEquals("Completa el motivo y el plan para firmar.", ConsultationRecordRules.signBlocker("", " "))
        assertEquals("Completa el motivo para firmar.", ConsultationRecordRules.signBlocker("", "Reposo"))
        assertEquals("Completa el plan para firmar.", ConsultationRecordRules.signBlocker("Tos", ""))
        assertNull(ConsultationRecordRules.signBlocker("Tos", "Reposo"))
    }

    // S8 ---------------------------------------------------------------------------------------------------------------

    @Test fun s8RefusalTextsAreRememberedButOtherFailuresKeepRetry() {
        val refused = AuthRequestException("No puedes ver este inventario.", 403)
        assertTrue(ForbiddenMessages.isForbidden(refused.message))
        assertEquals("No puedes ver este inventario.", userMessage(refused, "No se pudo cargar el inventario."))
        assertFalse("a screen fallback is never a refusal", ForbiddenMessages.isForbidden("No se pudo cargar el inventario."))
        val down = AuthRequestException("El servidor no pudo completar la operación.", 503)
        assertFalse(ForbiddenMessages.isForbidden(userMessage(down, "No se pudo cargar.")))
        assertFalse(ForbiddenMessages.isForbidden(null))
    }

    @Test fun s8DeniedHistoryIsAnInfoState() = runTest(dispatcher) {
        val api = FakeGateway().also { it.failures["/pacientes/p2/historial"] = AuthRequestException("El historial requiere una relación de atención.", 403) }
        val vm = ClinicalHistoryViewModel(api, NoSignals)
        vm.open("p2"); runCurrent()
        assertTrue(ForbiddenMessages.isForbidden(vm.state.value.error))
    }
}
