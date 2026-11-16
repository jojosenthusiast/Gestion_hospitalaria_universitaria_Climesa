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
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.DocumentReader
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class NoAttachmentSignals : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

private data class Upload(val path: String, val field: String, val fileName: String, val mimeType: String, val bytes: ByteArray)

/** Records JSON calls and multipart uploads; answers per path from [responses] or fails from [failures]. */
private class AttachmentGateway : ApiGateway {
    val calls = mutableListOf<Pair<String, String>>()
    val uploads = mutableListOf<Upload>()
    val responses = mutableMapOf<String, Any>()
    val failures = mutableMapOf<String, Exception>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += path to method
        failures[path]?.let { throw it }
        return responses[path] ?: if (method == "GET") JSONArray() else JSONObject()
    }
    override suspend fun upload(path: String, field: String, fileName: String, mimeType: String, bytes: ByteArray): Any {
        uploads += Upload(path, field, fileName, mimeType, bytes)
        failures[path]?.let { throw it }
        return JSONObject().put("id", "f1").put("stored", true).put("mimeType", mimeType).put("sizeBytes", bytes.size).put("sha256", "ab".repeat(32))
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class LabAttachmentViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val bytes = byteArrayOf(0x25, 0x50, 0x44, 0x46)
    private val reads = mutableListOf<String>()
    private val reader = DocumentReader { uri, _ -> reads += uri; bytes }
    private val picked = LabAttachment("informe.pdf", "application/pdf", 4, "ab".repeat(32), uri = "content://doc/1")

    private fun externalOrder() = LaboratoryOrder(
        "o1", "Ana", "rutina", "pendiente", 2, listOf(LaboratoryItem("i1", "HB", "Hemoglobina", null, unit = "g/dL", resultType = "numerico")), false,
        external = true, externalActions = setOf("cargar_externo"),
    )

    private fun vm(api: AttachmentGateway) = LaboratoryViewModel(api, NoAttachmentSignals(), reader)

    @Test fun savesTheValuesFirstThenUploadsTheFileInTheArchivoField() = runTest(dispatcher) {
        val api = AttachmentGateway()
        api.responses["/laboratorio/ordenes/o1/resultado-externo"] = JSONObject().put("id", "o1").put("attachmentId", "f1")
        val vm = vm(api)
        vm.openExternalLoad("o1"); vm.setAttachment(picked); vm.setExternalValue("i1", "12,5"); vm.confirmExternalLoad(externalOrder()); runCurrent()
        assertEquals("/laboratorio/ordenes/o1/resultado-externo" to "POST", api.calls.first { it.second == "POST" })
        val upload = api.uploads.single()
        assertEquals("/laboratorio/adjuntos/f1/archivo", upload.path)
        assertEquals("archivo", upload.field)
        assertEquals("informe.pdf", upload.fileName)
        assertEquals("application/pdf", upload.mimeType)
        assertArrayEquals(bytes, upload.bytes)
        assertEquals(listOf("content://doc/1"), reads)
        assertNull(vm.state.value.externalLoad)
        assertNull(vm.state.value.uploadFailure)
        assertEquals("Resultado externo guardado con su archivo; la orden espera la revisión médica.", vm.state.value.notice)
    }

    @Test fun ifTheUploadFailsItSaysTheValuesWereSavedButTheFileWasNot() = runTest(dispatcher) {
        val api = AttachmentGateway()
        api.responses["/laboratorio/ordenes/o1/resultado-externo"] = JSONObject().put("id", "o1").put("attachmentId", "f1")
        api.failures["/laboratorio/adjuntos/f1/archivo"] = AuthRequestException("x", 415, "adjunto_tipo_invalido")
        val vm = vm(api)
        vm.openExternalLoad("o1"); vm.setAttachment(picked); vm.setExternalValue("i1", "12"); vm.confirmExternalLoad(externalOrder()); runCurrent()
        assertNull(vm.state.value.externalLoad)
        assertEquals("Los valores se guardaron, pero el archivo no se subió: El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.", vm.state.value.uploadFailure)
        vm.dismissUploadFailure()
        assertNull(vm.state.value.uploadFailure)
    }

    @Test fun anOfflineUploadDoesNotPromiseAFormThatAlreadyClosed() = runTest(dispatcher) {
        val api = AttachmentGateway()
        api.responses["/laboratorio/ordenes/o1/resultado-externo"] = JSONObject().put("id", "o1").put("attachmentId", "f1")
        api.failures["/laboratorio/adjuntos/f1/archivo"] = AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")
        val vm = vm(api)
        vm.openExternalLoad("o1"); vm.setAttachment(picked); vm.setExternalValue("i1", "12"); vm.confirmExternalLoad(externalOrder()); runCurrent()
        assertNull(vm.state.value.externalLoad)
        assertEquals("Los valores se guardaron, pero el archivo no se subió: Sin conexión.", vm.state.value.uploadFailure)
    }

    @Test fun oneBusyFlagCoversSavingAndUploading() = runTest(dispatcher) {
        val api = AttachmentGateway()
        api.responses["/laboratorio/ordenes/o1/resultado-externo"] = JSONObject().put("id", "o1").put("attachmentId", "f1")
        val vm = vm(api)
        vm.openExternalLoad("o1"); vm.setAttachment(picked); vm.setExternalValue("i1", "12")
        vm.confirmExternalLoad(externalOrder()); vm.confirmExternalLoad(externalOrder()); runCurrent()
        assertEquals(1, api.calls.count { it.second == "POST" })
        assertEquals(1, api.uploads.size)
    }

    @Test fun aFileOverTenMegabytesIsRejectedBeforeAnythingIsSent() = runTest(dispatcher) {
        val api = AttachmentGateway(); val vm = vm(api)
        vm.openExternalLoad("o1"); vm.setAttachment(picked.copy(sizeBytes = 10L * 1024 * 1024 + 1)); vm.setExternalValue("i1", "12"); vm.confirmExternalLoad(externalOrder()); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertTrue(api.uploads.isEmpty())
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", vm.state.value.externalLoad?.error)
    }

    @Test fun loadsTheAttachmentsOfACompletedExternalOrder() = runTest(dispatcher) {
        val api = AttachmentGateway()
        api.responses["/laboratorio/ordenes/o1"] = JSONObject().put("id", "o1").put("attachments", JSONArray().put(JSONObject()
            .put("id", "f1").put("fileName", "a.pdf").put("mimeType", "application/pdf").put("sizeBytes", 2048).put("sha256", JSONObject.NULL)
            .put("stored", false).put("note", JSONObject.NULL).put("uploadedAt", "2026-11-16T12:00:00.000Z").put("uploadedByName", JSONObject.NULL)))
        val vm = vm(api)
        vm.loadAttachments("o1", 4); vm.loadAttachments("o1", 4); runCurrent()
        assertEquals(1, api.calls.count { it.first == "/laboratorio/ordenes/o1" })
        assertEquals(listOf("f1"), vm.state.value.attachments["o1"]?.files?.map { it.id })
    }

    @Test fun eachTapAsksForAFreshLinkAndOnlyHttpsOrHttpIsOpened() = runTest(dispatcher) {
        val api = AttachmentGateway(); val vm = vm(api)
        api.responses["/laboratorio/adjuntos/f1/enlace"] = JSONObject().put("url", "https://x.test/a.pdf?token=1").put("expiresInSeconds", 300)
        vm.openAttachment("o1", "f1"); runCurrent()
        assertEquals("https://x.test/a.pdf?token=1", vm.state.value.openUrl)
        vm.urlOpened()
        assertNull(vm.state.value.openUrl)
        vm.openAttachment("o1", "f1"); runCurrent()
        assertEquals(2, api.calls.count { it.first == "/laboratorio/adjuntos/f1/enlace" })
        vm.urlOpened()
        api.responses["/laboratorio/adjuntos/f1/enlace"] = JSONObject().put("url", "javascript:alert(1)")
        vm.openAttachment("o1", "f1"); runCurrent()
        assertNull(vm.state.value.openUrl)
        assertEquals("No se pudo abrir el archivo en este equipo. Vuelve a intentar.", vm.state.value.attachments["o1"]?.error)
    }

    @Test fun aReferenceOnlyAttachmentSaysSo() = runTest(dispatcher) {
        val api = AttachmentGateway(); val vm = vm(api)
        api.failures["/laboratorio/adjuntos/f1/enlace"] = AuthRequestException("x", 409, "adjunto_sin_archivo")
        vm.openAttachment("o1", "f1"); runCurrent()
        assertEquals("Solo hay la referencia del archivo: no se guardó en el sistema.", vm.state.value.attachments["o1"]?.error)
        assertNull(vm.state.value.attachmentBusy)
    }

    @Test fun uploadingToAReferenceChecksTheSizeAndReloadsTheList() = runTest(dispatcher) {
        val api = AttachmentGateway(); val vm = vm(api)
        vm.uploadAttachment("o1", 4, "f1", picked.copy(sizeBytes = 11L * 1024 * 1024)); runCurrent()
        assertTrue(api.uploads.isEmpty())
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", vm.state.value.attachments["o1"]?.error)
        vm.uploadAttachment("o1", 4, "f1", picked); runCurrent()
        assertEquals("/laboratorio/adjuntos/f1/archivo", api.uploads.single().path)
        assertEquals(1, api.calls.count { it.first == "/laboratorio/ordenes/o1" && it.second == "GET" })
        assertNull(vm.state.value.attachments["o1"]?.error)
    }
}

/** A reader for tests that never upload: any read fails as an unreadable document. */
internal val NoDocuments = DocumentReader { uri, _ -> throw java.io.FileNotFoundException(uri) }
