package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.DocumentReader
import sv.edu.catolica.climesa.domain.ExternalRecordRules
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.ui.lab.ExternalRecordViewModel

/** Records JSON calls (with their body) and uploads; the catalog and the record answer from [responses]. */
private class RecordGateway : ApiGateway {
    val calls = mutableListOf<Triple<String, String, JSONObject?>>()
    val uploads = mutableListOf<String>()
    val responses = mutableMapOf<String, Any>()
    val failures = mutableMapOf<String, Exception>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += Triple(path, method, body)
        failures[path]?.let { throw it }
        return responses[path] ?: if (method == "GET") JSONArray() else JSONObject()
    }
    override suspend fun upload(path: String, field: String, fileName: String, mimeType: String, bytes: ByteArray): Any {
        uploads += path
        failures[path]?.let { throw it }
        return JSONObject().put("id", "f1").put("stored", true)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ExternalRecordViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val reader = DocumentReader { _, _ -> byteArrayOf(0x25, 0x50, 0x44, 0x46) }
    private val pdf = LabAttachment("informe.pdf", "application/pdf", 4, "ab".repeat(32), uri = "content://doc/1")
    private val catalog = JSONArray().put(JSONObject().put("id", "e1").put("code", "HB").put("name", "Hemoglobina").put("isPanel", false).put("unit", "g/dL").put("resultType", "numerico"))

    private fun gateway() = RecordGateway().apply { responses["/laboratorio/catalogo"] = catalog }

    private fun TestScope.filled(vm: ExternalRecordViewModel) {
        vm.open("p1"); runCurrent()
        vm.setPlace("Laboratorio Ejemplo"); vm.addExam("e1"); vm.setValue("e1", "13,1"); vm.setAttachment(pdf)
    }

    @Test fun recordsThenUploadsTheFileAndAsksTheRecordToRefresh() = runTest(dispatcher) {
        val api = gateway()
        api.responses[ExternalRecordRules.path("p1")] = JSONObject().put("id", "o1").put("attachmentId", "f1").put("consultationId", "c1")
        val vm = ExternalRecordViewModel(api, reader)
        filled(vm)
        vm.save(); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/laboratorio/pacientes/p1/resultado-externo", post.first)
        assertEquals("Laboratorio Ejemplo", post.third!!.getString("place"))
        assertEquals("e1", post.third!!.getJSONArray("results").getJSONObject(0).getString("examId"))
        assertEquals(13.1, post.third!!.getJSONArray("results").getJSONObject(0).getDouble("value"), 0.0)
        assertEquals(listOf("/laboratorio/adjuntos/f1/archivo"), api.uploads)
        val state = vm.state.value
        assertNull(state.draft)
        assertEquals(ExternalRecordRules.DONE, state.notice)
        assertEquals(1, state.saved)
    }

    @Test fun anInvalidFormSendsNothingAndSaysWhy() = runTest(dispatcher) {
        val api = gateway()
        val vm = ExternalRecordViewModel(api, reader)
        filled(vm)
        vm.setValue("e1", "alto")
        vm.save(); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("El valor de Hemoglobina debe ser un número.", vm.state.value.draft?.error)
        assertEquals(0, vm.state.value.saved)
    }

    @Test fun aRefusalKeepsTheFormWithTheApiMessage() = runTest(dispatcher) {
        val api = gateway()
        api.failures[ExternalRecordRules.path("p1")] = AuthRequestException("Para registrar un resultado externo necesitas una consulta tuya con este paciente.", 409, "sin_consulta")
        val vm = ExternalRecordViewModel(api, reader)
        filled(vm)
        vm.save(); runCurrent()
        val draft = vm.state.value.draft!!
        assertEquals("Laboratorio Ejemplo", draft.place)
        assertTrue(draft.error.orEmpty().isNotBlank())
        assertTrue(api.uploads.isEmpty())
        assertEquals(0, vm.state.value.saved)
    }

    @Test fun aFailedUploadKeepsTheSavedValuesAndSaysTheFileIsPending() = runTest(dispatcher) {
        val api = gateway()
        api.responses[ExternalRecordRules.path("p1")] = JSONObject().put("id", "o1").put("attachmentId", "f1")
        api.failures["/laboratorio/adjuntos/f1/archivo"] = java.io.IOException("gone")
        val vm = ExternalRecordViewModel(api, reader)
        filled(vm)
        vm.save(); runCurrent()
        assertNull(vm.state.value.draft)
        assertTrue(vm.state.value.uploadFailure.orEmpty().startsWith("Los valores se guardaron, pero el archivo no se subió"))
        assertEquals(1, vm.state.value.saved)
    }
}
