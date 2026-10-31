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
import sv.edu.catolica.climesa.domain.ChangeReason
import sv.edu.catolica.climesa.domain.LiveEntities
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.StaffDraft
import sv.edu.catolica.climesa.domain.StaffMember
import sv.edu.catolica.climesa.domain.StaffRules
import javax.inject.Inject

/** Acceso a la API de personal; separado de [sv.edu.catolica.climesa.data.ApiClient] para poder probar el ViewModel. */
interface StaffDataSource {
    suspend fun get(path: String): Any
    suspend fun send(path: String, method: String, body: JSONObject): Any
}

/** Formulario abierto: `editingId` nulo significa alta. */
data class StaffForm(
    val editingId: String? = null, val editingVersion: Int = 1, val editingActive: Boolean = true,
    val draft: StaffDraft = StaffDraft(), val reason: String = "", val fields: Map<String, String> = emptyMap(),
)

data class StaffState(
    val loading: Boolean = true,
    val error: String? = null,
    val members: List<StaffMember> = emptyList(),
    val showInactive: Boolean = false,
    val selectedId: String? = null,
    val canManage: Boolean = false,
    val canSeePersonalData: Boolean = false,
    val form: StaffForm? = null,
    val saving: Boolean = false,
    val formError: String? = null,
    val message: String? = null,
) {
    val visible get() = members.filter { showInactive || it.active }.sortedBy { it.fullName }
    val selected get() = members.firstOrNull { it.id == selectedId }
}

/**
 * Personal (FR-103): lista, ficha, alta, edición con motivo e inactivación con motivo. Cambios en vivo por el canal
 * `personal`; sin sondeo. Un 409 `version_conflicto` no guarda nada: se recarga la lista y el formulario se conserva.
 */
@HiltViewModel
class StaffViewModel @Inject constructor(
    private val source: StaffDataSource,
    realtime: RealtimeRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(StaffState())
    val state: StateFlow<StaffState> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var permissions: Set<String>? = null
    private var loadJob: Job? = null

    /** Idempotente: recarga solo si cambian los permisos y se suscribe a los eventos de personal. */
    fun start(granted: Set<String>, channels: List<String>) {
        if (granted != permissions) {
            permissions = granted
            mutable.update { it.copy(canManage = StaffRules.canManage(granted), canSeePersonalData = StaffRules.canSeePersonalData(granted)) }
            if (StaffRules.canView(granted)) load(silent = false)
        }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (LiveEntities.matches(signal.event, "personal")) load(silent = true)
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
                val members = StaffRules.parse(source.get("/personal") as JSONArray)
                mutable.update { it.copy(loading = false, error = null, members = members) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (silent && mutable.value.members.isNotEmpty()) return@launch
                mutable.update { it.copy(loading = false, error = e.message ?: "No se pudo cargar el personal.") }
            }
        }
    }

    fun toggleInactive() = mutable.update { it.copy(showInactive = !it.showInactive) }
    fun select(id: String?) = mutable.update { it.copy(selectedId = id, message = null) }
    fun clearMessage() = mutable.update { it.copy(message = null) }

    fun newMember() {
        if (!mutable.value.canManage) return
        mutable.update { it.copy(form = StaffForm(), formError = null) }
    }

    fun edit(m: StaffMember) {
        if (!mutable.value.canManage) return
        mutable.update { it.copy(form = StaffForm(m.id, m.version, m.active, StaffDraft.from(m)), formError = null) }
    }

    fun draft(d: StaffDraft) = mutable.update { s -> s.form?.let { s.copy(form = it.copy(draft = d, fields = emptyMap()), formError = null) } ?: s }
    fun reason(text: String) = mutable.update { s -> s.form?.let { s.copy(form = it.copy(reason = text.take(ChangeReason.MAX))) } ?: s }
    fun closeForm() {
        if (!mutable.value.saving) mutable.update { it.copy(form = null, formError = null) }
    }

    fun save() {
        val s = mutable.value
        val form = s.form ?: return
        if (!s.canManage || s.saving) return
        val fields = StaffRules.validate(form.draft)
        if (fields.isNotEmpty()) {
            mutable.update { it.copy(form = form.copy(fields = fields), formError = "Revisa los campos señalados.") }
            return
        }
        if (form.editingId != null) {
            ChangeReason.error(form.reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
            mutate("Personal actualizado") {
                source.send("/personal/${form.editingId}", "PATCH", StaffRules.updateBody(form.draft, form.editingActive, form.editingVersion, form.reason))
            }
        } else {
            mutate("Personal registrado") { source.send("/personal", "POST", StaffRules.createBody(form.draft)) }
        }
    }

    /** Inactiva o reactiva con motivo; nunca borra la persona. */
    fun changeActive(m: StaffMember, reason: String) {
        val s = mutable.value
        if (!s.canManage || s.saving) return
        ChangeReason.error(reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        val active = !m.active
        mutate(if (active) "Personal reactivado" else "Personal inactivado") {
            source.send("/personal/${m.id}", "PATCH", StaffRules.updateBody(StaffDraft.from(m), active, m.version, reason))
        }
    }

    private fun mutate(message: String, work: suspend () -> Any) {
        mutable.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try {
                work()
                mutable.update { it.copy(saving = false, form = null, message = message) }
                load(silent = true)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val conflict = (e as? AuthRequestException)?.let { it.statusCode == 409 && it.code == "version_conflicto" } == true
                if (conflict) load(silent = true)
                mutable.update {
                    it.copy(
                        saving = false,
                        formError = if (conflict) CONFLICT_MESSAGE else e.message ?: "No se pudo guardar. El formulario se conserva.",
                    )
                }
            }
        }
    }

    private companion object {
        const val CONFLICT_MESSAGE = "El registro cambió. Se recargó con la versión vigente; el cambio no se guardó."
    }
}
