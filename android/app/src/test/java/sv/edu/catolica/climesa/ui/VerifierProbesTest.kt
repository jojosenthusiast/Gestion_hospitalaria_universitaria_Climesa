package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.FormDrafts
import sv.edu.catolica.climesa.domain.RealtimeSignal
import kotlin.coroutines.coroutineContext

@OptIn(ExperimentalCoroutinesApi::class)
class VerifierProbesTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun ticket(version: Int, state: String) = JSONArray().put(JSONObject().put("id", "t1").put("numero", 7).put("service", "consulta_general").put("area", "CON")
        .put("state", state).put("priority", "normal").put("version", version)
        .put("allowedActions", if (state == "llamado") JSONArray().put("no_se_presento") else JSONArray()).put("patientName", "Ana").put("createdAt", "2026-11-15T14:00:00Z"))

    /** Records the Idempotency-Key of each POST like ApiClient does. */
    private class KeyedGateway : ApiGateway {
        val posts = mutableListOf<Triple<String, String?, JSONObject?>>()
        val responses = mutableMapOf<String, Any>()
        var onPost: (Int) -> Unit = {}
        override suspend fun request(path: String, method: String, body: JSONObject?): Any {
            if (method == "POST") { posts += Triple(path, coroutineContext[RequestIntent]?.idempotencyKey, body); onPost(posts.size) }
            return responses[path] ?: if (method == "GET") JSONArray() else JSONObject()
        }
    }

    // P1: a definitive rejection (409 transicion_invalida: the doctor started attending inside the 8 s) is retried forever.
    @Test fun aDefinitivelyRejectedAbsenceLeavesTheStore() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = KeyedGateway(); api.responses["/fila"] = ticket(4, "llamado")
        api.onPost = { throw AuthRequestException("Este número ya no permite marcar que no se presentó.", 409, "transicion_invalida") }
        val vm = QueueViewModel(api, quiet, drafts)
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        advanceTimeBy(8_001); runCurrent()
        vm.resume(); runCurrent(); vm.resume(); runCurrent()
        assertEquals("a definitive 409 should not be resent on every resume", 1, api.posts.size)
        assertNull("nor kept stored with no way to discard it", drafts.load("rec-1", FormDrafts.DEFERRED_ABSENCE))
    }

    // P2: the server applied the absence but the answer was lost; the retry reuses the key with a NEW version -> idempotencia_conflicto.
    @Test fun aRetryAfterALostAnswerSendsTheSameBodyWithTheSameKey() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = KeyedGateway(); api.responses["/fila"] = ticket(4, "llamado")
        api.onPost = { n -> if (n == 1) { api.responses["/fila"] = ticket(5, "no_se_presento"); throw AuthRequestException("Sin conexión.") } }
        val vm = QueueViewModel(api, quiet, drafts)
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        advanceTimeBy(8_001); runCurrent()
        vm.load(silent = true); runCurrent() // realtime fila.actualizada reload
        vm.resume(); runCurrent()
        assertEquals(2, api.posts.size)
        assertEquals("same idempotency key", api.posts[0].second, api.posts[1].second)
        assertEquals("same key must carry the same body (server: huella != hash -> 409 idempotencia_conflicto)", api.posts[0].third.toString(), api.posts[1].third.toString())
    }
}
