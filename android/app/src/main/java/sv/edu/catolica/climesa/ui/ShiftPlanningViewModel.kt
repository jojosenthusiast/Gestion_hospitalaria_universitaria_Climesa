package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AreaOption
import sv.edu.catolica.climesa.domain.LiveEntities
import sv.edu.catolica.climesa.domain.PlannedShift
import sv.edu.catolica.climesa.domain.PublishSummary
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ShiftForm
import sv.edu.catolica.climesa.domain.ShiftPlanning
import sv.edu.catolica.climesa.domain.StaffOption
import javax.inject.Inject

/** Acceso a la API de turnos; separado de [sv.edu.catolica.climesa.data.ApiClient] para poder probar el ViewModel. */
interface PlanningDataSource {
    suspend fun get(path: String): Any
    suspend fun send(path: String, method: String, body: JSONObject): Any
}

/** Estado de la última acción de escritura; `conflict` es un 409 de versión (el turno cambió y nada se guardó). */
data class PlanningAction(val busy: Boolean = false, val error: String? = null, val conflict: Boolean = false, val done: Boolean = false)

data class PlanningState(
    val loading: Boolean = true,
    val shifts: List<PlannedShift> = emptyList(),
    val people: List<StaffOption> = emptyList(),
    val areas: List<AreaOption> = emptyList(),
    val error: String? = null,
    val filter: String = "todos",
    val canPlan: Boolean = false,
    val canPublish: Boolean = false,
    val action: PlanningAction = PlanningAction(),
    val summary: PublishSummary? = null,
) {
    val visibleShifts get() = if (filter == "todos") shifts else shifts.filter { it.state == filter }
}

@HiltViewModel
class ShiftPlanningViewModel @Inject constructor(
    private val source: PlanningDataSource,
    realtime: RealtimeRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(PlanningState())
    val state: StateFlow<PlanningState> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var permissions: Set<String>? = null
    private var loadJob: Job? = null

    /** Idempotente: recarga solo si cambian los permisos y se suscribe a los eventos de turnos, personal y espacios. */
    fun start(granted: Set<String>, channels: List<String>) {
        if (granted != permissions) {
            permissions = granted
            mutable.update { it.copy(canPlan = ShiftPlanning.canPlan(granted), canPublish = ShiftPlanning.canPublish(granted)) }
            load(silent = false)
        }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (LiveEntities.matches(signal.event, "turno", "personal", "espacio")) load(silent = true)
                RealtimeSignal.Resync -> load(silent = true)
                else -> Unit
            }
        }
    }

    fun load(silent: Boolean = false) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            if (!silent) mutable.update { it.copy(loading = true, error = null) }
            try {
                val shifts = ShiftPlanning.parseShifts(source.get("/turnos") as JSONArray)
                val plan = mutable.value.canPlan
                val people = if (plan) ShiftPlanning.parseStaff(source.get("/personal") as JSONArray) else emptyList()
                val areas = if (plan || mutable.value.canPublish) ShiftPlanning.parseAreas(source.get("/espacios") as JSONArray) else emptyList()
                mutable.update { it.copy(loading = false, error = null, shifts = shifts, people = people, areas = areas) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (silent && mutable.value.shifts.isNotEmpty()) return@launch
                mutable.update { it.copy(loading = false, error = e.message ?: "No se pudo cargar la planificación.") }
            }
        }
    }

    fun setFilter(filter: String) = mutable.update { it.copy(filter = filter) }
    fun resetAction() = mutable.update { it.copy(action = PlanningAction()) }
    fun dismissSummary() = mutable.update { it.copy(summary = null) }

    /** Crea un borrador (`POST /turnos`) o edita uno existente (`PATCH /turnos/{id}`, con versión y motivo). */
    fun save(form: ShiftForm, editing: PlannedShift?, reason: String) {
        if (!mutable.value.canPlan) return
        val problem = ShiftPlanning.formError(form) ?: if (editing != null) ShiftPlanning.reasonError(reason) else null
        if (problem != null) { fail(problem); return }
        write {
            if (editing == null) source.send("/turnos", "POST", ShiftPlanning.createBody(form))
            else source.send("/turnos/${editing.id}", "PATCH", ShiftPlanning.editBody(form, editing, reason))
        }
    }

    fun cancel(shift: PlannedShift, reason: String) {
        if (!mutable.value.canPlan) return
        ShiftPlanning.reasonError(reason)?.let { fail(it); return }
        write { source.send("/turnos/${shift.id}", "PATCH", ShiftPlanning.cancelBody(shift, reason)) }
    }

    fun publish(from: String, to: String, areaId: String?) {
        if (!mutable.value.canPublish) return
        ShiftPlanning.publishError(from, to)?.let { fail(it); return }
        write {
            val result = source.send("/turnos/publicar", "POST", ShiftPlanning.publishBody(from, to, areaId))
            (result as? JSONObject)?.let { json -> mutable.update { it.copy(summary = ShiftPlanning.parseSummary(json)) } }
        }
    }

    private fun fail(message: String) = mutable.update { it.copy(action = PlanningAction(error = message)) }

    private fun write(call: suspend () -> Unit) {
        mutable.update { it.copy(action = PlanningAction(busy = true)) }
        viewModelScope.launch {
            try {
                call()
                mutable.update { it.copy(action = PlanningAction(done = true)) }
                load(silent = true)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val conflict = (e as? AuthRequestException)?.let { it.statusCode == 409 && it.code == "version_conflicto" } == true
                mutable.update {
                    it.copy(action = PlanningAction(
                        conflict = conflict,
                        error = if (conflict) "El turno cambió. Cierra y vuelve a abrirlo para ver su estado actual; el cambio no se guardó."
                        else e.message ?: "No se pudo guardar. Intenta de nuevo.",
                    ))
                }
            }
        }
    }
}
