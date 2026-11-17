package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionAction
import sv.edu.catolica.climesa.domain.AdmissionDraft
import sv.edu.catolica.climesa.domain.BedMap
import sv.edu.catolica.climesa.domain.CategoryCount
import sv.edu.catolica.climesa.domain.ConsultationPrimary
import sv.edu.catolica.climesa.domain.ConsultationResume
import sv.edu.catolica.climesa.domain.HospitalAdmission
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.IntakeDoctor
import sv.edu.catolica.climesa.domain.IntakeField
import sv.edu.catolica.climesa.domain.IntakePrefill
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.OriginRecord
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.domain.RealtimeSignal

private object A2Bus : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

/** S13 A2 (clinical and ward): one primary action per screen, prefill, one busy flag over multi-step writes. */
@OptIn(ExperimentalCoroutinesApi::class)
class RoleFlowsA2Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun admission(id: String, vararg actions: AdmissionAction) =
        HospitalAdmission(id, "Paciente $id", "hospitalizado", "B-1", "semiprivada", false, 1, allowedActions = actions.toSet())

    @Test fun `an admission card has at most one primary, the state's main action`() {
        assertEquals(AdmissionAction.ASSIGN_BED, HospitalizationRules.primaryAction(setOf(AdmissionAction.ASSIGN_BED, AdmissionAction.CANCEL)))
        assertEquals(AdmissionAction.SIGN_DISCHARGE, HospitalizationRules.primaryAction(setOf(AdmissionAction.SIGN_DISCHARGE, AdmissionAction.REGISTER_EXIT, AdmissionAction.TRANSFER)))
        assertEquals(AdmissionAction.REGISTER_EXIT, HospitalizationRules.primaryAction(setOf(AdmissionAction.REGISTER_EXIT, AdmissionAction.REVOKE_DISCHARGE)))
        // Secondary actions alone never look primary.
        assertNull(HospitalizationRules.primaryAction(setOf(AdmissionAction.NURSING_NOTE, AdmissionAction.REQUEST_DISCHARGE, AdmissionAction.CANCEL)))
    }

    @Test fun `the hospitalization list has one primary, the first card with a main action`() {
        val rows = listOf(admission("a", AdmissionAction.NURSING_NOTE), admission("b", AdmissionAction.ASSIGN_BED), admission("c", AdmissionAction.SIGN_DISCHARGE))
        assertEquals("b", HospitalizationRules.primaryAdmission(rows))
        assertNull(HospitalizationRules.primaryAdmission(listOf(admission("a", AdmissionAction.TRANSFER))))
    }

    private fun ticket(id: String, number: Int, state: String, consultation: String? = null, service: String? = "consulta_general", byMe: Boolean = false, byColleague: Boolean = false) =
        QueueConsultation(id, number, "P$number", state, consultation, if (consultation == null) null else "abierta", service, calledByMe = byMe, calledByColleague = byColleague)

    @Test fun `a ticket in attention is the doctor's own only when it carries consultationId`() {
        val queue = listOf(ticket("t1", 3, "en_atencion"), ticket("t2", 5, "llamado", byMe = true), ticket("t3", 2, "llamado", service = "laboratorio", byMe = true))
        // t1 is someone else's (no consultationId), t3 belongs to another service: the next step is calling-in t2,
        // because the API says this doctor called t2 (`calledByMe`).
        assertEquals(ConsultationPrimary.StartTicket("t2"), ConsultationPrimary.pick(queue, unsigned = emptyList(), canCallNext = false))
        val mine = queue + ticket("t4", 9, "en_atencion", consultation = "c4")
        assertEquals(ConsultationPrimary.ResumeTicket("t4"), ConsultationPrimary.pick(mine, unsigned = listOf("c8"), canCallNext = false))
        assertEquals(ConsultationPrimary.ResumeUnsigned("c8"), ConsultationPrimary.pick(queue.take(1), unsigned = listOf("c8"), canCallNext = false))
        // After signing, calling the proposed number is the one main action.
        assertEquals(ConsultationPrimary.CallNext, ConsultationPrimary.pick(mine, unsigned = listOf("c8"), canCallNext = true))
        assertNull(ConsultationPrimary.pick(listOf(ticket("t1", 3, "en_atencion")), unsigned = emptyList(), canCallNext = false))
    }

    @Test fun `a called number another doctor called is never this doctor's main action`() {
        // /fila lists the called numbers of every office; t2 was called by a colleague, t6 by this doctor.
        val queue = listOf(ticket("t2", 5, "llamado", byColleague = true), ticket("t6", 7, "llamado", byMe = true))
        assertNull(ConsultationPrimary.pick(queue.take(1), unsigned = emptyList(), canCallNext = false))
        assertTrue(queue[0].calledElsewhere)
        assertEquals(ConsultationPrimary.StartTicket("t6"), ConsultationPrimary.pick(queue, unsigned = emptyList(), canCallNext = false))
    }

    @Test fun `the queue reads the ticket service from the API's service field`() {
        // GET /fila sends `service` (api/src/attention/queue.service.ts: t.servicio AS service).
        val rows = ConsultationResume.parseQueue(JSONArray().put(JSONObject().put("id", "t1").put("numero", 4).put("patientName", "Ana").put("state", "llamado").put("service", "laboratorio").put("calledByMe", true)))
        assertEquals("laboratorio", rows.single().service)
        assertNull(ConsultationPrimary.pick(rows, unsigned = emptyList(), canCallNext = false))
    }

    @Test fun `signing is one busy sequence, a second tap sends nothing and the sign uses the saved version`() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(JSONObject()
            .put("appointmentId", "a1").put("patientId", "p1").put("patientName", "Ana")
            .put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T14:20:00Z").put("appointmentState", "confirmada")
            .put("consultationId", "c1").put("consultationState", "abierta").put("version", 3)))
        api.responses["/consultas/c1"] = JSONObject().put("version", 7)
        val vm = ConsultationViewModel(api, A2Bus)
        vm.load(); runCurrent()
        val item = vm.state.value.appointments.single()
        vm.sign(item, "Dolor", "", "Reposo")
        vm.sign(item, "Dolor", "", "Reposo")
        vm.save(item, "Dolor", "", "Reposo")
        runCurrent()
        assertEquals(1, api.calls.count { it.first == "/consultas/c1" && it.second == "PATCH" })
        assertEquals(1, api.calls.count { it.first == "/consultas/c1/firmar" })
        assertEquals(7, api.calls.single { it.first == "/consultas/c1/firmar" }.third!!.getInt("version"))
    }

    @Test fun `the admission guide preselects what has a single answer and says only what it chose`() {
        val record = OriginRecord("r1", OriginKind.entries.first(), "Consulta 12/11", "Dolor torácico")
        val draft = AdmissionDraft()
        val (withOrigin, origin) = IntakePrefill.origin(draft, listOf(record))
        assertEquals(record, withOrigin.originRecord)
        assertEquals(record.origin, withOrigin.origin)
        assertEquals(listOf(IntakeField.ORIGIN), origin)
        // Two records: nothing is chosen for the person.
        assertEquals(emptyList<IntakeField>(), IntakePrefill.origin(draft, listOf(record, record.copy(id = "r2"))).second)

        val doctors = listOf(IntakeDoctor("d1", "Dra. Uno", null, true, null), IntakeDoctor("d2", "Dr. Dos", null, false, "Sin turno"))
        val (withDoctor, doctor) = IntakePrefill.doctor(draft, doctors)
        assertEquals("d1", withDoctor.doctor?.id)
        assertEquals(listOf(IntakeField.DOCTOR), doctor)
        // A doctor already chosen is never replaced.
        val chosen = draft.copy(doctor = doctors[1])
        assertEquals(chosen, IntakePrefill.doctor(chosen, doctors).first)

        val map = BedMap(listOf(CategoryCount("general", 3, 3), CategoryCount("vip", 0, 0)), emptyList())
        val (withCategory, category) = IntakePrefill.category(draft, map)
        assertEquals("general", withCategory.category)
        assertEquals(listOf(IntakeField.CATEGORY), category)
    }
}
