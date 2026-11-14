package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionIndication
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.AppointmentSlot
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.DischargePending
import sv.edu.catolica.climesa.domain.DischargeType
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.IndicationContext
import sv.edu.catolica.climesa.domain.IndicationDraft
import sv.edu.catolica.climesa.domain.IsolationType
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.SchedulingDoctor
import sv.edu.catolica.climesa.domain.SlotStatus
import sv.edu.catolica.climesa.domain.VitalMeasure
import sv.edu.catolica.climesa.domain.VitalsForm
import sv.edu.catolica.climesa.domain.VitalsRules

/**
 * MOV-04: every critical body the app sends equals its fixture in `src/test/resources/contract/<name>.json`
 * (`{ method, path, body }`, path as in `contrato/openapi.json`). The API CI validates the same fixtures against the OpenAPI
 * schema, so a DTO change that Android does not follow fails a build instead of reaching a person as a "uuid" error.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ContractFixturesTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private companion object {
        const val PATIENT = "11111111-1111-4111-8111-111111111111"
        const val CONSULTATION = "22222222-2222-4222-8222-222222222222"
        const val STAFF = "33333333-3333-4333-8333-333333333333"
        const val DOCTOR = "44444444-4444-4444-8444-444444444444"
        const val APPOINTMENT = "55555555-5555-4555-8555-555555555555"
        const val ADMISSION = "66666666-6666-4666-8666-666666666666"
        const val START = "2026-11-20T14:00:00Z"
        const val END = "2026-11-20T14:20:00Z"
    }

    private val noRealtime = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<sv.edu.catolica.climesa.domain.RealtimeSignal>() }

    private fun fixture(name: String): JSONObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("contract/$name.json") ?: error("Missing fixture contract/$name.json")
        return JSONObject(stream.bufferedReader(Charsets.UTF_8).use { it.readText() })
    }

    /** [path] is what the app calls (without `/api/v1`); [ids] are replaced by `{id}` to compare with the OpenAPI path. */
    private fun assertContract(name: String, method: String, path: String, body: JSONObject?, vararg ids: String) {
        val expected = fixture(name)
        val template = ids.fold("/api/v1$path") { p, id -> p.replace(id, "{id}") }
        assertEquals("$name: method", expected.getString("method"), method)
        assertEquals("$name: path", expected.getString("path"), template)
        val actual = body ?: error("$name: the app built no body")
        assertTrue("$name: body\nexpected ${expected.getJSONObject("body")}\nactual   $actual", same(expected.getJSONObject("body"), actual))
    }

    /** Structural JSON equality: same keys, same values, numbers compared by value (37.2 == 37.2, 80 == 80). */
    private fun same(a: Any?, b: Any?): Boolean = when {
        a is JSONObject && b is JSONObject -> a.keys().asSequence().toSet() == b.keys().asSequence().toSet() && a.keys().asSequence().all { same(a.get(it), b.get(it)) }
        a is JSONArray && b is JSONArray -> a.length() == b.length() && (0 until a.length()).all { same(a.get(it), b.get(it)) }
        a is Number && b is Number -> a.toDouble() == b.toDouble()
        else -> a == b
    }

    @Test fun admissionIndicationFromAConsultation() {
        val body = AdmissionIndication.body(
            IndicationContext(PATIENT, "Ana Ejemplo", CONSULTATION, STAFF, "Dra. Prueba"),
            IndicationDraft(motive = "  Dolor abdominal persistente con fiebre ", category = "semiprivada", isolation = true, isolationType = IsolationType.DROPLET, unstable = true),
        )
        assertContract("admision-indicacion", "POST", AdmissionIndication.PATH, body)
    }

    @Test fun appointmentCreatedByReception() {
        val body = ReceptionScheduling.createBody(PickerPatient(PATIENT, "0000001", "Ana Ejemplo", 30), SchedulingDoctor(DOCTOR, "Dr. Prueba", null, true, null), DaySlot(START, END, SlotStatus.FREE, null), " Control de presión arterial ")
        assertContract("cita-crear", "POST", "/citas", body)
    }

    @Test fun appointmentRequestedByThePatient() {
        assertContract("cita-solicitar", "POST", "/citas/solicitudes", PatientAppointmentRules.requestBody(DOCTOR, AppointmentSlot(START, END), "Control de presión arterial"))
    }

    @Test fun appointmentConfirmRejectAndCancel() {
        assertContract("cita-confirmar", "POST", AppointmentActions.path(AppointmentAction.CONFIRM, APPOINTMENT), AppointmentActions.body(AppointmentAction.CONFIRM, 2, ""), APPOINTMENT)
        assertContract("cita-rechazar", "POST", AppointmentActions.path(AppointmentAction.REJECT, APPOINTMENT), AppointmentActions.body(AppointmentAction.REJECT, 2, " El médico no atiende ese día "), APPOINTMENT)
        assertContract("cita-cancelar", "POST", AppointmentActions.path(AppointmentAction.CANCEL, APPOINTMENT), AppointmentActions.body(AppointmentAction.CANCEL, 3, "El paciente pidió reprogramar"), APPOINTMENT)
    }

    private fun agenda() = JSONArray().put(JSONObject()
        .put("appointmentId", APPOINTMENT).put("patientId", PATIENT).put("patientName", "Ana Ejemplo")
        .put("start", START).put("end", END).put("appointmentState", "confirmada").put("version", 1))

    @Test fun consultationStartAndPrescription() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        val vm = ConsultationViewModel(api, noRealtime)
        vm.load(); runCurrent()
        vm.start(vm.state.value.appointments.single(), " Dolor de cabeza desde ayer "); runCurrent()
        val start = api.calls.first { it.second == "POST" }
        assertContract("consulta-iniciar", start.second, start.first, start.third)

        api.rows = JSONArray().put(agenda().getJSONObject(0).put("consultationId", CONSULTATION).put("consultationState", "abierta"))
        vm.load(); runCurrent()
        vm.prescription(vm.state.value.appointments.single(), "Paracetamol", "500 mg", "Oral", "Cada 8 horas", "5 días", "Tomar con alimentos"); runCurrent()
        val prescription = api.calls.last { it.second == "POST" }
        assertContract("consulta-receta", prescription.second, prescription.first, prescription.third, CONSULTATION)
    }

    @Test fun vitalSigns() {
        val form = VitalsForm().with(VitalMeasure.TEMPERATURE, "37.2").with(VitalMeasure.HEART_RATE, "80").with(VitalMeasure.SYSTOLIC, "120")
            .with(VitalMeasure.DIASTOLIC, "80").with(VitalMeasure.OXYGEN, "98").copy(note = " Paciente tranquilo ")
        assertContract("signos-vitales", "POST", "/pacientes/$PATIENT/signos", VitalsRules.body(form, ADMISSION), PATIENT)
    }

    @Test fun discharge() {
        val body = HospitalizationRules.dischargeBody(4, DischargeType.MEDICAL, "Evolución favorable, alta con control en consulta externa", listOf(DischargePending("Retirar puntos", "Enfermería de planta"), DischargePending("", "")), false)
        assertContract("admision-alta", "POST", "/admisiones/$ADMISSION/alta", body, ADMISSION)
    }

    @Test fun ownPatientContactData() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/me/paciente"] = JSONObject().put("id", PATIENT).put("fullName", "Ana Ejemplo").put("record", "0000001")
            .put("phone", "70001111").put("email", "ana@example.test").put("address", "Calle 1").put("version", 3)
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        vm.save("7000-2222", "nuevo@example.test", "Calle 2"); runCurrent()
        val patch = api.calls.single { it.second == "PATCH" }
        assertContract("me-paciente", patch.second, patch.first, patch.third)
    }
}
