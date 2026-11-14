package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AmbulanceEvents
import sv.edu.catolica.climesa.domain.AmbulanceLogEntry
import sv.edu.catolica.climesa.domain.AmbulanceParser
import sv.edu.catolica.climesa.domain.AmbulanceRequestRow
import sv.edu.catolica.climesa.domain.AmbulanceRules
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.AmbulanceStatus
import sv.edu.catolica.climesa.domain.LogFilters
import sv.edu.catolica.climesa.domain.PrehospitalForm
import sv.edu.catolica.climesa.domain.PrehospitalView
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Solicitud propia del paciente (A09). No hay lectura de la solicitud para el paciente: se sigue con los eventos de su canal. */
data class OwnAmbulanceRequest(val id: String, val state: String, val updates: List<String> = emptyList())
data class ProvisionalPatient(val id: String, val record: String)
/** Reporte prehospital en cola: el mismo cuerpo se reenvía para conservar la clave de idempotencia (RN-34). */
data class QueuedPrehospital(val serviceId: String, val body: String)

data class AmbulanceUiState(
    val loading: Boolean = false,
    val status: AmbulanceStatus? = null,
    val log: List<AmbulanceLogEntry> = emptyList(),
    val logFilters: LogFilters = LogFilters(),
    val arrival: PrehospitalView? = null,
    val arrivalServiceId: String? = null,
    val ownRequest: OwnAmbulanceRequest? = null,
    val prehospital: PrehospitalForm = PrehospitalForm(),
    val queued: QueuedPrehospital? = null,
    val provisional: ProvisionalPatient? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val formError: String? = null,
    val notice: String? = null,
)

enum class AmbulanceMode { STATUS, LOG, ARRIVAL, REQUEST, PARAMEDIC }

@HiltViewModel
class AmbulanceViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(AmbulanceUiState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var mode: AmbulanceMode? = null
    private var readsStatus = false

    /** Abre una sección: STATUS (A36, A70, A71, A72), LOG (A74), ARRIVAL (A25, A54) o REQUEST (A09, sin lectura). */
    fun open(mode: AmbulanceMode, canReadStatus: Boolean = true) {
        this.mode = mode; readsStatus = canReadStatus
        load(silent = false)
    }

    fun load(silent: Boolean = true) {
        val current = mode ?: return
        if (current == AmbulanceMode.REQUEST) return
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                when (current) {
                    AmbulanceMode.STATUS -> mutable.value = mutable.value.copy(loading = false, status = AmbulanceParser.status(api.request("/ambulancia")))
                    AmbulanceMode.LOG -> mutable.value = mutable.value.copy(loading = false, log = AmbulanceParser.log(api.request(AmbulanceRules.logPath(mutable.value.logFilters))))
                    AmbulanceMode.ARRIVAL -> loadArrival()
                    AmbulanceMode.PARAMEDIC -> loadParamedic()
                    AmbulanceMode.REQUEST -> Unit
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) else mutable.value = mutable.value.copy(loading = false) }
        }
    }

    /** Pantalla "Servicio activo": estado de la unidad y, aparte, los últimos servicios; si la bitácora falla, el estado se muestra igual. */
    private suspend fun loadParamedic() {
        mutable.value = mutable.value.copy(loading = false, status = AmbulanceParser.status(api.request("/ambulancia")))
        val recent = runCatching { AmbulanceParser.log(api.request(AmbulanceRules.logPath(LogFilters()))) }.getOrNull()
        if (recent != null) mutable.value = mutable.value.copy(log = recent)
    }

    /** MED tiene `ambulancia.ver_estado` y encuentra el servicio activo; ENF lo conoce por el evento `ambulancia.prehospital`. */
    private suspend fun loadArrival() {
        if (readsStatus) {
            val status = AmbulanceParser.status(api.request("/ambulancia"))
            status?.activeService?.id?.let { mutable.value = mutable.value.copy(arrivalServiceId = it) }
            mutable.value = mutable.value.copy(status = status)
        }
        val id = mutable.value.arrivalServiceId
        val view = id?.let { AmbulanceParser.prehospital(api.request("/ambulancia/servicios/$it/prehospital")) }
        mutable.value = mutable.value.copy(loading = false, arrival = view)
    }

    /** Idempotente por lista de canales. Un evento de ambulancia vuelve a pedir; al reconectar se reenvía el prehospital en cola. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (AmbulanceEvents.matches(signal.event)) {
                    if (AmbulanceEvents.isPrehospital(signal.event)) mutable.value = mutable.value.copy(arrivalServiceId = signal.event.id)
                    mutable.value.ownRequest?.let { own -> mutable.value = mutable.value.copy(ownRequest = own.copy(updates = (own.updates + ownUpdate(signal.event.type, signal.event.entity)).takeLast(10))) }
                    load()
                }
                RealtimeSignal.Resync -> { load(); retryQueued() }
                else -> Unit
            }
        }
    }

    private fun ownUpdate(type: String, entity: String) = when {
        type == "ambulancia.estado_cambiado" && entity == "unidad" -> "Despacho confirmó tu solicitud: la ambulancia va en camino."
        type == "ambulancia.estado_cambiado" && entity == "solicitud" -> "Despacho revisó tu solicitud. Si necesitas ayuda, llama al 911."
        type == "ambulancia.hito" -> "La ambulancia registró un avance en su servicio."
        else -> "Hay novedades de tu solicitud."
    }

    /** A09 / FR-109-02: queda "por confirmar" y muestra el aviso del 911. */
    /** One request form = one intent: a retry after a lost answer reuses the key and never asks for two ambulances. */
    private val requestIntent = SubmissionIntent()

    fun submitRequest(address: String, municipality: String, reason: String, contactPhone: String) {
        AmbulanceRules.requestError(address, reason, contactPhone)?.let { mutable.value = mutable.value.copy(formError = it); return }
        write {
            val created = requestIntent.send { api.request("/ambulancia/solicitudes", "POST", AmbulanceRules.requestBody(address, municipality, reason, contactPhone)) } as? JSONObject
            mutable.value = mutable.value.copy(ownRequest = OwnAmbulanceRequest(created?.optString("id").orEmpty(), created?.optString("state")?.ifBlank { null } ?: "por_confirmar"), notice = AmbulanceRules.NOTICE_911)
        }
    }

    /** A36 / FR-109-04: confirma por teléfono y despacha con la versión de la unidad que se vio Disponible. */
    fun dispatch(request: AmbulanceRequestRow, type: String, priority: String, destination: String) {
        val unit = mutable.value.status?.unit ?: return
        if (destination.trim().length < 3) { mutable.value = mutable.value.copy(formError = "Indica el destino."); return }
        write(notice = "Ambulancia despachada.") { api.request("/ambulancia/servicios", "POST", AmbulanceRules.dispatchBody(unit.version, request.id, type, priority, destination)) }
    }

    fun discard(request: AmbulanceRequestRow, reason: String) {
        if (reason.trim().length < 5) { mutable.value = mutable.value.copy(formError = "Indica el motivo, de al menos 5 caracteres."); return }
        write(notice = "Solicitud descartada.") { api.request("/ambulancia/solicitudes/${request.id}/descartar", "POST", JSONObject().put("version", request.version).put("reason", reason.trim())) }
    }

    /** A71 / FR-109-07: el hito siguiente; finalizar antes del hospital exige estado final y motivo. */
    fun advance(service: AmbulanceService, type: String, finalState: String? = null, reason: String = "", notice: String = "Hito registrado.") {
        if (type == "finalizado" && AmbulanceRules.finishNeedsReason(service) && (finalState == null || reason.trim().length < 5)) {
            mutable.value = mutable.value.copy(formError = "Para terminar sin traslado elige el estado final y escribe el motivo."); return
        }
        write(notice = notice) { api.request("/ambulancia/servicios/${service.id}/hitos", "POST", AmbulanceRules.milestoneBody(type, finalState, reason)) }
    }

    /** A74: búsqueda y filtros de la bitácora; cada cambio vuelve a pedir con la consulta nueva. */
    fun setLogFilters(filters: LogFilters) {
        mutable.value = mutable.value.copy(logFilters = filters)
        if (mode == AmbulanceMode.LOG) load()
    }

    /** `POST /ambulancia/ubicacion`: un punto del teléfono; la API lo rechaza si no hay servicio activo. */
    fun sendLocation(latitude: Double, longitude: Double, capturedAt: Instant = Instant.now()) {
        write(notice = "Ubicación enviada a despacho.") { api.request("/ambulancia/ubicacion", "POST", AmbulanceRules.locationBody(latitude, longitude, capturedAt)) }
    }

    fun reportLocationUnavailable() { mutable.value = mutable.value.copy(formError = "No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.") }

    fun updatePrehospital(form: PrehospitalForm) { mutable.value = mutable.value.copy(prehospital = form, formError = null) }

    /** A72 / FR-109-10: sin señal el reporte queda en cola con el mismo cuerpo; se reenvía al reconectar o con "Reintentar". */
    fun sendPrehospital(serviceId: String, capturedAt: Instant = Instant.now()) {
        AmbulanceRules.prehospitalError(mutable.value.prehospital)?.let { mutable.value = mutable.value.copy(formError = it); return }
        val body = AmbulanceRules.prehospitalBody(mutable.value.prehospital, capturedAt, mutable.value.provisional?.id)
        deliver(QueuedPrehospital(serviceId, body.toString()))
    }

    fun retryQueued() { mutable.value.queued?.let { deliver(it) } }

    private fun deliver(item: QueuedPrehospital) {
        mutable.value = mutable.value.copy(busy = true, formError = null, notice = null)
        viewModelScope.launch {
            try {
                api.request("/ambulancia/servicios/${item.serviceId}/prehospital", "POST", JSONObject(item.body))
                mutable.value = mutable.value.copy(busy = false, queued = null, prehospital = PrehospitalForm(), provisional = null, notice = "Reporte enviado a emergencia.")
                load()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                mutable.value = if (isOffline(e)) mutable.value.copy(busy = false, queued = item, notice = "Sin señal: el reporte quedó en cola y se enviará al volver la conexión.")
                else mutable.value.copy(busy = false, queued = null, formError = message(e))
            }
        }
    }

    /** A73 / FR-109-12: identidad provisional con búsqueda previa; se vincula al servicio en el siguiente reporte prehospital. */
    fun registerUnidentified(sex: String, estimatedAge: String, description: String) {
        AmbulanceRules.unidentifiedError(sex, estimatedAge, description)?.let { mutable.value = mutable.value.copy(formError = it); return }
        write(notice = "Paciente provisional registrado. Se vinculará al servicio con el reporte prehospital.") {
            val query = "Persona sin identidad"
            val search = api.request("/pacientes/busquedas", "POST", JSONObject().put("query", query)) as JSONObject
            val body = JSONObject().put("givenNames", "").put("surnames", "").put("sex", sex).put("description", description.trim())
                .put("searchToken", search.getString("token")).put("searchQuery", query)
                .apply { estimatedAge.toIntOrNull()?.let { put("estimatedAge", it) } }
            val created = api.request("/pacientes/provisionales", "POST", body) as JSONObject
            mutable.value = mutable.value.copy(provisional = ProvisionalPatient(created.getString("id"), created.optString("record")))
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, formError = null, notice = null) }

    private fun write(notice: String? = null, work: suspend () -> Unit) {
        mutable.value = mutable.value.copy(busy = true, formError = null, notice = null)
        viewModelScope.launch {
            try { work(); mutable.value = mutable.value.copy(busy = false, notice = notice ?: mutable.value.notice); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, formError = message(e)); load() }
        }
    }

    private fun isOffline(error: Exception) = error is AuthRequestException && error.statusCode == null

    /** El mensaje sale del `codigo` de la API cuando es una regla conocida; si no, del texto que devolvió. */
    private fun message(error: Exception): String {
        val code = (error as? AuthRequestException)?.code
        return when (code) {
            "ambulancia_ya_despachada" -> "La ambulancia ya fue despachada."
            "sin_paramedico_de_turno" -> "No hay un paramédico con turno en curso."
            "sin_motorista_de_turno" -> "No hay un motorista con turno en curso."
            "sin_tripulacion_de_turno" -> "No hay paramédico ni motorista con turno en curso."
            "cuenta_no_verificada" -> "Tu cuenta aún no está vinculada a tu expediente; recepción debe verificarla."
            "hito_fuera_de_orden" -> "Ese hito no sigue al último registrado. Se actualizó el servicio."
            "version_conflicto" -> "La unidad o la solicitud cambió. Revisa el estado actual e intenta de nuevo."
            else -> error.message ?: "No se pudo completar la operación."
        }
    }
}
