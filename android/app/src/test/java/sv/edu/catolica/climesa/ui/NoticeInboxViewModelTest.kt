package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
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
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.NoticeFilter
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class NoticeBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** Answers `/me/avisos/bandeja` with [inbox]; writes can be held with [gate] or fail with [writeFailure]. */
private class InboxGateway(var inbox: JSONObject) : ApiGateway {
    val calls = mutableListOf<Pair<String, String>>()
    var readFailure: Exception? = null
    var writeFailure: Exception? = null
    var gate: CompletableDeferred<Unit>? = null
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += path to method
        if (method == "GET") { readFailure?.let { throw it }; return inbox }
        gate?.await()
        writeFailure?.let { throw it }
        return JSONObject().put("avisoId", path.split('/')[3]).put("enteradoEn", "2026-11-16T12:31:00.000Z").put("recordarEn", JSONObject.NULL)
    }
    fun reads() = calls.count { it.first == "/me/avisos/bandeja" && it.second == "GET" }
    fun writes() = calls.filter { it.second == "POST" }.map { it.first }
}

@OptIn(ExperimentalCoroutinesApi::class)
class NoticeInboxViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun notice(id: String, critical: Boolean = true, destacado: Boolean = critical) = JSONObject()
        .put("id", id).put("titulo", "Aviso $id").put("cuerpo", "Texto").put("desde", "2026-11-16T12:00:00.000Z").put("hasta", "2099-11-20T12:00:00.000Z")
        .put("prioridad", "critico").put("publico", false).put("roles", JSONArray().put("MED")).put("nivel", if (critical) "critico" else "informativo")
        .put("areas", JSONArray()).put("publicadoEn", "2026-11-16T11:00:00.000Z").put("dirigido", true)
        .put("enteradoEn", JSONObject.NULL).put("recordarEn", JSONObject.NULL).put("destacado", destacado)

    private fun inbox(vararg notices: JSONObject) = JSONObject().put("actualizadoEn", "2026-11-16T12:30:00.000Z").put("avisos", JSONArray(notices.toList()))
        .put("noLeidos", notices.size).put("criticos", notices.size).put("recordatorioHoras", 4).put("proximoCambio", JSONObject.NULL)

    private fun event(type: String, entity: String, id: String = "x") = RealtimeSignal.Event(EventoDominio(type, entity, id, 1))

    @Test fun loadsTheInboxOnceAndReloadsOnNoticeEventsOnly() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"))); val bus = NoticeBus()
        val vm = NoticeInboxViewModel(api, bus)
        vm.start(listOf("rol:MED")); vm.start(listOf("rol:MED")); runCurrent()
        assertEquals(1, api.reads())
        assertEquals(listOf("a"), vm.state.value.inbox?.notices?.map { it.id })
        bus.signals.tryEmit(event("cama.estado_cambiado", "cama")); advanceUntilIdle()
        assertEquals(1, api.reads())
        bus.signals.tryEmit(event("aviso.publicado", "aviso")); advanceUntilIdle()
        assertEquals(2, api.reads())
        bus.signals.tryEmit(RealtimeSignal.Resync); advanceUntilIdle()
        assertEquals(3, api.reads())
    }

    @Test fun acknowledgeHidesTheBannerAtOnceAndReadsTheInboxAgain() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"), notice("b"))); val vm = NoticeInboxViewModel(api, NoticeBus())
        vm.start(emptyList()); runCurrent()
        assertEquals(listOf("a", "b"), vm.banner().map { it.id })
        api.gate = CompletableDeferred()
        vm.acknowledge("a"); runCurrent()
        assertEquals("a", vm.state.value.busyId)
        vm.snooze("b"); vm.acknowledge("b"); runCurrent()
        assertEquals("one busy flag: nothing else is sent while a write is pending", listOf("/me/avisos/a/enterado"), api.writes())
        api.inbox = inbox(notice("b"))
        api.gate!!.complete(Unit); runCurrent()
        assertEquals(listOf("/me/avisos/a/enterado"), api.writes())
        assertNull(vm.state.value.busyId)
        assertEquals(2, api.reads())
        assertEquals(listOf("b"), vm.banner().map { it.id })
    }

    @Test fun snoozePostsToPosponer() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"))); val vm = NoticeInboxViewModel(api, NoticeBus())
        vm.start(emptyList()); runCurrent()
        // The API answers the snoozed notice with `recordarEn` set and no longer `destacado`.
        api.inbox = inbox(notice("a", destacado = false).put("recordarEn", "2026-11-16T16:30:00.000Z"))
        vm.snooze("a"); runCurrent()
        assertEquals(listOf("/me/avisos/a/posponer"), api.writes())
        assertTrue(vm.banner().isEmpty())
    }

    @Test fun aRejectedAcknowledgeSaysWhyInSpanishAndRefreshes() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"))); val vm = NoticeInboxViewModel(api, NoticeBus())
        vm.start(emptyList()); runCurrent()
        api.writeFailure = AuthRequestException("x", 409, "aviso_retirado")
        api.inbox = inbox()
        vm.acknowledge("a"); runCurrent()
        assertEquals("Este aviso fue retirado; ya no necesita «Enterado». La lista se actualizó.", vm.state.value.actionError)
        assertNull(vm.state.value.busyId)
        assertEquals(2, api.reads())
        assertTrue(vm.state.value.inbox!!.notices.isEmpty())
    }

    @Test fun aFailedFirstReadShowsAnErrorAndAFailedRefetchDropsTheChangedNotice() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"), notice("b"))); val bus = NoticeBus()
        api.readFailure = IllegalStateException("JSONException")
        val vm = NoticeInboxViewModel(api, bus)
        vm.start(listOf("rol:MED")); runCurrent()
        assertEquals("No se pudieron cargar los avisos. Vuelve a intentar.", vm.state.value.error)
        api.readFailure = null
        vm.reload(); runCurrent()
        assertNull(vm.state.value.error)
        api.readFailure = AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")
        bus.signals.tryEmit(event("aviso.retirado", "aviso", "a")); advanceUntilIdle()
        assertEquals(listOf("b"), vm.state.value.inbox?.notices?.map { it.id })
        assertNull("a silent refetch keeps the list without an error", vm.state.value.error)
    }

    @Test fun theFilterAndSelectionLiveInTheViewModel() = runTest(dispatcher) {
        val api = InboxGateway(inbox(notice("a"), notice("b", critical = false))); val vm = NoticeInboxViewModel(api, NoticeBus())
        vm.start(emptyList()); runCurrent()
        vm.setFilter(NoticeFilter.CRITICAL)
        assertEquals(listOf("a"), vm.visible().map { it.id })
        vm.select("b"); assertEquals("b", vm.state.value.selectedId)
        vm.select(null); assertNull(vm.state.value.selectedId)
        vm.setFilter(NoticeFilter.ALL)
        assertEquals(listOf("a", "b"), vm.visible().map { it.id })
        assertFalse(NoticeInboxRules.canSnooze(vm.visible()[1]))
    }
}

/** Every rejected notice action or attachment call reads as clear Spanish (through `userMessage()`), never a raw code. */
class NoticeAndAttachmentMessagesTest {
    @Test fun noticeActions() {
        assertEquals("Este aviso ya venció; ya no necesita «Enterado». La lista se actualizó.", noticeActionMessage(AuthRequestException("x", 409, "aviso_vencido")))
        assertEquals("No se pudo guardar. Revisa tu conexión y vuelve a intentar.", noticeActionMessage(IllegalStateException("JSONException at 3")))
        assertEquals("Sin conexión. Conservamos el formulario; vuelve a intentar.", noticeActionMessage(AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")))
    }

    @Test fun attachmentLinks() {
        assertEquals("Solo hay la referencia del archivo: no se guardó en el sistema.", labLinkMessage(AuthRequestException("x", 409, "adjunto_sin_archivo")))
        assertEquals("No encontramos este archivo. Vuelve a cargar la orden.", labLinkMessage(AuthRequestException("x", 404, "no_encontrado")))
        assertEquals("Tu cuenta no puede abrir este archivo.", labLinkMessage(AuthRequestException("x", 403, "sin_permiso")))
        assertEquals("No se pudo abrir el archivo en este equipo. Vuelve a intentar.", labLinkMessage(sv.edu.catolica.climesa.domain.LabAttachmentRules.UnopenableLink()))
        assertEquals("No se pudo abrir el archivo. Vuelve a intentar.", labLinkMessage(IllegalStateException("JSONException")))
    }

    @Test fun attachmentUploads() {
        assertEquals("El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.", labUploadMessage(AuthRequestException("x", 415, "adjunto_tipo_invalido")))
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", labUploadMessage(AuthRequestException("x", 413, "adjunto_muy_grande")))
        assertEquals("Este adjunto ya tiene su archivo guardado; no se reemplaza.", labUploadMessage(AuthRequestException("x", 409, "adjunto_ya_almacenado")))
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", labUploadMessage(sv.edu.catolica.climesa.domain.LabAttachmentRules.FileTooLarge()))
        assertEquals("No se pudo leer el archivo en este equipo. Elígelo de nuevo.", labUploadMessage(java.io.FileNotFoundException("content://x")))
        assertEquals("No se pudo subir el archivo. Vuelve a intentar.", labUploadMessage(IllegalStateException("JSONException")))
    }
}
