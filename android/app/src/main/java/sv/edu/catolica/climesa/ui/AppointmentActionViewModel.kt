package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.ApiProblems
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.ReceptionAppointment

data class AppointmentActionState(
    val target: ReceptionAppointment? = null,
    val action: AppointmentAction? = null,
    val reason: String = "",
    val showErrors: Boolean = false,
    val serverError: String? = null,
    val busy: Boolean = false,
    /** Set after the API accepts the action; the screen shows it and reloads the list. */
    val done: String? = null,
    val error: String? = null,
) {
    val reasonError: String? get() = serverError ?: action?.let { a -> AppointmentActions.reasonError(a, reason).takeIf { showErrors } }
}

/** M-02: confirm, reject (with motive) or cancel (with motive) one appointment from Recepción, with version and Idempotency-Key. */
@HiltViewModel
class AppointmentActionViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(AppointmentActionState())
    val state = mutable.asStateFlow()
    private val intent = SubmissionIntent()

    fun open(target: ReceptionAppointment, action: AppointmentAction) {
        intent.reset()
        mutable.value = AppointmentActionState(target = target, action = action)
    }
    fun close() { if (!mutable.value.busy) { intent.reset(); mutable.update { AppointmentActionState(done = it.done) } } }
    fun consumeDone() = mutable.update { it.copy(done = null) }
    fun reason(text: String) = mutable.update { if (it.busy) it else it.copy(reason = text.take(AppointmentActions.REASON_MAX), serverError = null, error = null) }

    fun submit() {
        val s = mutable.value
        val target = s.target ?: return
        val action = s.action ?: return
        if (s.busy) return
        if (AppointmentActions.reasonError(action, s.reason) != null) { mutable.update { it.copy(showErrors = true) }; return }
        mutable.update { it.copy(busy = true, showErrors = true, error = null, serverError = null) }
        viewModelScope.launch {
            try {
                intent.send { api.request(AppointmentActions.path(action, target.id), "POST", AppointmentActions.body(action, target.version, s.reason)) }
                mutable.value = AppointmentActionState(done = AppointmentActions.doneNotice(action, target.patientName.ifBlank { "el paciente" }))
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val field = ApiProblems.fieldErrors(e)[AppointmentActions.reasonField(action)]
                mutable.update { it.copy(busy = false, serverError = field, error = e.message ?: "No se pudo completar la acción.") }
            }
        }
    }
}
