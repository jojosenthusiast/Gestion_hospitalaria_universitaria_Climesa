package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Records the intent key of every write; the first [failures] writes are lost on the network. */
private class IntentGateway(var failures: Int = 0) : ApiGateway {
    val writeKeys = mutableListOf<String?>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        if (method == "GET") return JSONObject()
        writeKeys += currentCoroutineContext()[RequestIntent]?.idempotencyKey
        if (failures-- > 0) throw AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")
        return JSONObject().put("id", "s1").put("state", "por_confirmar")
    }
}

private object NoSignalsRealtime : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class SubmissionIntentViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun retryingTheSameAmbulanceRequestReusesItsKeyAndANewRequestGetsANewOne() = runTest(dispatcher) {
        val api = IntentGateway(failures = 1)
        val vm = AmbulanceViewModel(api, NoSignalsRealtime)
        vm.open(AmbulanceMode.REQUEST); runCurrent()
        vm.submitRequest("Colonia Ficticia 12", "San Salvador", "Caída en casa", "7000-0001"); runCurrent()
        vm.submitRequest("Colonia Ficticia 12", "San Salvador", "Caída en casa, mareo", "7000-0001"); runCurrent()
        vm.submitRequest("Colonia Ficticia 12", "San Salvador", "Otra solicitud", "7000-0001"); runCurrent()
        assertEquals(3, api.writeKeys.size)
        assertEquals("el reintento conserva la clave aunque cambie el motivo", api.writeKeys[0], api.writeKeys[1])
        assertNotEquals("una intención nueva recibe otra clave", api.writeKeys[1], api.writeKeys[2])
        assertEquals(3, api.writeKeys.filterNotNull().size)
    }
}
