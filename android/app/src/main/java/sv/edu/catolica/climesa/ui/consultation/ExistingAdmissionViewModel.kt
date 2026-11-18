package sv.edu.catolica.climesa.ui.consultation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.domain.AdmissionIndication
import sv.edu.catolica.climesa.domain.ExistingAdmission
import sv.edu.catolica.climesa.ui.userMessage

data class ExistingAdmissionState(
    /** False until the first read answered (or when the reader has no `admision.ver`). */
    val known: Boolean = false,
    val loading: Boolean = false,
    val admission: ExistingAdmission? = null,
    /** A failed read is never "no admission": it is said, and the API still refuses a second active admission. */
    val error: String? = null,
)

/**
 * Row 11 (MED audit): whether the consultation's patient already has an active admission, read from the server
 * (`GET /admisiones`), so an indication already made shows as done after leaving and coming back (iOS `loadExisting`).
 */
@HiltViewModel
class ExistingAdmissionViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(ExistingAdmissionState())
    val state = mutable.asStateFlow()
    private var job: Job? = null

    fun load(patientId: String?, consultationId: String?) {
        if (patientId.isNullOrBlank()) return
        mutable.value = mutable.value.copy(loading = true, error = null)
        job?.cancel()
        job = viewModelScope.launch {
            try {
                val rows = api.request("/admisiones")
                val found = AdmissionIndication.existing(rows, patientId, consultationId)
                mutable.value = mutable.value.copy(known = true, loading = false, admission = found, error = null)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(loading = false, error = userMessage(e, "No se pudo saber si el paciente ya tiene una admisión.")) }
        }
    }
}
