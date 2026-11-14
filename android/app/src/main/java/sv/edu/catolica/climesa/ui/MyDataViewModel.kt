package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.SubmissionIntent

/** Own contact data of the patient (`GET /me/paciente`); `version` is the optimistic version sent back on save. */
data class MyData(val fullName: String = "", val record: String = "", val phone: String = "", val email: String = "", val address: String = "", val version: Int = 0)

data class MyDataState(val data: MyData? = null, val loading: Boolean = false, val saving: Boolean = false, val saved: Boolean = false, val error: String? = null)

/**
 * "Mis datos": the patient sees the personal data of the own record and edits only phone, e-mail and address
 * (`PATCH /me/paciente`, permission `pacientes.editar_propios`). Name, DUI, birth date and sex stay with reception.
 */
@HiltViewModel
class MyDataViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(MyDataState())
    val state = mutable.asStateFlow()
    private val intent = SubmissionIntent()

    fun load() {
        mutable.value = mutable.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val json = api.request("/me/paciente") as? JSONObject
                mutable.value = MyDataState(data = json?.let(::parse))
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudieron cargar tus datos.") }
        }
    }

    /** Only the contact fields travel; an empty value clears the field. A stale version asks the patient to reload. */
    fun save(phone: String, email: String, address: String) {
        val current = mutable.value.data ?: return
        val error = validate(phone, email)
        if (error != null) { mutable.value = mutable.value.copy(error = error, saved = false); return }
        mutable.value = mutable.value.copy(saving = true, error = null, saved = false)
        viewModelScope.launch {
            try {
                val body = JSONObject().put("version", current.version).put("phone", phone.trim()).put("email", email.trim()).put("address", address.trim())
                intent.send { api.request("/me/paciente", "PATCH", body) }
                val json = api.request("/me/paciente") as? JSONObject
                mutable.value = MyDataState(data = json?.let(::parse), saved = true)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val stale = (e as? AuthRequestException)?.statusCode == 409
                mutable.value = mutable.value.copy(saving = false, error = if (stale) "Tu ficha cambió. Se cargaron los datos actuales; revisa y guarda de nuevo." else e.message ?: "No se pudo guardar.")
                if (stale) load()
            }
        }
    }

    companion object {
        fun parse(json: JSONObject) = MyData(
            fullName = json.optString("fullName"), record = json.optString("record"),
            phone = json.optString("phone"), email = json.optString("email"), address = json.optString("address"),
            version = json.optInt("version"),
        )

        /** Same rules as the API: eight-digit phone starting 2, 6 or 7, and a plausible e-mail. Null when valid. */
        fun validate(phone: String, email: String): String? = when {
            phone.isNotBlank() && !Regex("^[267]\\d{3}-?\\d{4}$").matches(phone.trim()) -> "El teléfono debe tener ocho dígitos."
            email.isNotBlank() && !Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email.trim()) -> "Revisa el correo electrónico."
            else -> null
        }
    }
}
