package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiClient
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.AppointmentSlot
import sv.edu.catolica.climesa.domain.AppointmentWorkPeriod
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate

data class PatientAppointmentsState(
    val loading: Boolean = true,
    val appointments: List<PatientAppointment> = emptyList(),
    val doctors: List<AppointmentDoctor> = emptyList(),
    val selectedDoctorId: String = "",
    val selectedDate: LocalDate = ReceptionScheduling.today(),
    val workPeriods: List<AppointmentWorkPeriod> = emptyList(),
    val slots: List<AppointmentSlot> = emptyList(),
    /** Todas las franjas del día con su estado (libre, ocupado, sin turno, ya pasó). */
    val daySlots: List<DaySlot> = emptyList(),
    val selectedSlot: AppointmentSlot? = null,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class PatientAppointmentsViewModel @Inject constructor(
    private val api: ApiClient,
    realtime: RealtimeRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(PatientAppointmentsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var availabilityJob: Job? = null

    fun load() {
        viewModelScope.launch {
            mutable.updateLoading(true)
            try {
                val appointments = parseAppointments(api.request("/citas"))
                val doctors = parseDoctors(api.request("/citas/catalogos?date=${mutable.value.selectedDate}"))
                mutable.value = mutable.value.copy(loading = false, appointments = appointments, doctors = doctors, error = null)
                if (mutable.value.selectedDoctorId.isNotBlank()) loadAvailability()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(loading = false, error = message(e))
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && (signal.event.entity == "cita" || signal.event.type.startsWith("cita.")) || signal is RealtimeSignal.Resync) load()
        }
    }

    fun selectDoctor(id: String) {
        mutable.value = mutable.value.copy(selectedDoctorId = id, selectedSlot = null, workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = null)
        if (id.isNotBlank()) loadAvailability()
    }

    fun selectDate(date: LocalDate) {
        mutable.value = mutable.value.copy(selectedDate = date, selectedSlot = null, workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = null)
        loadDoctors()
        if (mutable.value.selectedDoctorId.isNotBlank()) loadAvailability()
    }

    fun selectSlot(slot: AppointmentSlot?) { mutable.value = mutable.value.copy(selectedSlot = slot) }

    fun request(reason: String) {
        val current = mutable.value
        val slot = current.selectedSlot ?: return
        if (current.selectedDoctorId.isBlank()) return
        mutable.value = current.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                api.request("/citas/solicitudes", "POST", PatientAppointmentRules.requestBody(current.selectedDoctorId, slot, reason))
                mutable.value = mutable.value.copy(saving = false, selectedSlot = null, slots = emptyList(), daySlots = emptyList(), notice = "Solicitud enviada. Recepción debe confirmarla.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, error = message(e))
            }
        }
    }

    fun cancel(appointment: PatientAppointment, reason: String) {
        if (reason.trim().length < 10) {
            mutable.value = mutable.value.copy(error = "Escribe un motivo de al menos 10 caracteres.")
            return
        }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                api.request("/citas/${appointment.id}/cancelar", "POST", JSONObject()
                    .put("version", appointment.version)
                    .put("reason", reason.trim()))
                mutable.value = mutable.value.copy(saving = false, notice = "Cita cancelada.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, error = message(e))
            }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    /** Al cambiar de día se vuelve a pedir quién tiene turno ese día. */
    private fun loadDoctors() {
        val date = mutable.value.selectedDate
        viewModelScope.launch {
            try { mutable.value = mutable.value.copy(doctors = parseDoctors(api.request("/citas/catalogos?date=$date"))) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { /* la lista anterior sigue válida */ }
        }
    }

    private fun loadAvailability() {
        val current = mutable.value
        availabilityJob?.cancel()
        availabilityJob = viewModelScope.launch {
            try {
                val encodedDate = current.selectedDate.toString()
                val result = api.request("/citas/disponibilidad?doctorId=${current.selectedDoctorId}&date=$encodedDate") as JSONObject
                val periods = result.optJSONArray("workPeriods")
                val workPeriods = (0 until (periods?.length() ?: 0)).mapNotNull { i -> periods?.optJSONObject(i)?.let { AppointmentWorkPeriod(it.optString("start"), it.optString("end")) } }
                val rows = result.optJSONArray("slots")
                val slots = (0 until (rows?.length() ?: 0)).mapNotNull { i ->
                    rows?.optJSONObject(i)?.let { AppointmentSlot(it.optString("start"), it.optString("end")) }
                }
                mutable.value = mutable.value.copy(workPeriods = workPeriods, slots = slots, daySlots = ReceptionScheduling.daySlots(result), error = null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = message(e))
            }
        }
    }

    private fun parseAppointments(value: Any): List<PatientAppointment> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            PatientAppointment(row.optString("id"), row.optString("doctorName"), row.optString("start"), row.optString("end"), row.optString("state"), row.optString("reason").takeIf(String::isNotBlank), row.optInt("version", 1))
        } }
    }

    private fun parseDoctors(value: Any): List<AppointmentDoctor> {
        val doctors = (value as? JSONObject)?.optJSONArray("doctors") ?: return emptyList()
        return (0 until doctors.length()).mapNotNull { i -> doctors.optJSONObject(i)?.let { row ->
            AppointmentDoctor(row.optString("id"), "${row.optString("givenNames")} ${row.optString("surnames")}".trim(), row.optString("specialty").takeIf(String::isNotBlank),
                hasShift = row.isNull("tieneTurno") || !row.has("tieneTurno") || row.optBoolean("tieneTurno"), reason = row.optString("motivo").takeIf { !row.isNull("motivo") && it.isNotBlank() })
        } }
    }

    private fun message(error: Exception): String = when (error) {
        is AuthRequestException -> error.message ?: "No se pudo completar la operación."
        else -> error.message ?: "No se pudo completar la operación."
    }

    override fun onCleared() { live.stop(); availabilityJob?.cancel(); super.onCleared() }
}

private fun MutableStateFlow<PatientAppointmentsState>.updateLoading(loading: Boolean) {
    value = value.copy(loading = loading, error = null, notice = null)
}
