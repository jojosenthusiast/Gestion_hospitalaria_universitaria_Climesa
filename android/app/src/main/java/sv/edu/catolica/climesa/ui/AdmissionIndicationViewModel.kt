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
import sv.edu.catolica.climesa.domain.AdmissionIndication
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.IndicationContext
import sv.edu.catolica.climesa.domain.IndicationDraft
import sv.edu.catolica.climesa.domain.IsolationType

data class AdmissionIndicationState(
    val context: IndicationContext? = null,
    val draft: IndicationDraft = IndicationDraft(),
    /** Local field errors are shown once the physician tries to send; server field errors always. */
    val showErrors: Boolean = false,
    val serverFields: Map<String, String> = emptyMap(),
    val error: String? = null,
    val busy: Boolean = false,
    val sent: Boolean = false,
) {
    val open get() = context != null
    val contextError get() = context?.let(AdmissionIndication::contextError)
    val fields: Map<String, String> get() = (if (showErrors) AdmissionIndication.fieldErrors(draft) else emptyMap()) + serverFields
}

/** MOV-02: short "Indicar hospitalización" from an open consultation. Patient, origin and physician come locked. */
@HiltViewModel
class AdmissionIndicationViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(AdmissionIndicationState())
    val state = mutable.asStateFlow()
    private val intent = SubmissionIntent()

    fun open(context: IndicationContext) {
        if (mutable.value.context?.consultationId == context.consultationId && !mutable.value.sent) { mutable.update { it.copy(context = context) }; return }
        intent.reset()
        mutable.value = AdmissionIndicationState(context = context)
    }
    fun close() { if (!mutable.value.busy) { intent.reset(); mutable.value = AdmissionIndicationState() } }

    fun motive(text: String) = edit("motive") { it.copy(motive = text.take(AdmissionIntake.MOTIVE_MAX)) }
    fun category(value: String) = edit("requestedCategory") { it.copy(category = value) }
    fun isolation(on: Boolean) = edit("isolation") { it.copy(isolation = on, isolationType = if (on) it.isolationType else null) }
    fun isolationType(type: IsolationType?) = edit("isolationType") { it.copy(isolationType = type) }
    fun unstable(on: Boolean) = edit("unstable") { it.copy(unstable = on) }
    fun postSurgical(on: Boolean) = edit("postSurgical") { it.copy(postSurgical = on) }

    private fun edit(field: String, change: (IndicationDraft) -> IndicationDraft) =
        mutable.update { if (it.busy) it else it.copy(draft = change(it.draft), serverFields = it.serverFields - field, error = null) }

    fun submit() {
        val s = mutable.value
        val context = s.context ?: return
        if (s.busy) return
        val body = AdmissionIndication.body(context, s.draft)
        if (body == null) { mutable.update { it.copy(showErrors = true, error = it.contextError) }; return }
        mutable.update { it.copy(busy = true, showErrors = true, error = null, serverFields = emptyMap()) }
        viewModelScope.launch {
            try {
                intent.send { api.request(AdmissionIndication.PATH, "POST", body) }
                mutable.update { it.copy(busy = false, sent = true) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val fields = ApiProblems.fieldErrors(e)
                mutable.update { it.copy(busy = false, serverFields = fields, error = e.message ?: "No se pudo indicar la hospitalización.") }
            }
        }
    }
}
