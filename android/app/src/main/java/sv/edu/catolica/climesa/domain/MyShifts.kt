package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.json.JSONArray
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * One row of `GET /turnos/mios`, already formatted for display. `canCheckIn` comes from the server's `allowedActions`
 * (`marcar_entrada`): the screen offers the check-in only when the API would accept it (ASIS-01).
 */
data class MyShift(
    val area: String,
    val period: String,
    val state: String,
    val id: String = "",
    val version: Int = 0,
    val attendance: String? = null,
    val late: Boolean = false,
    val canCheckIn: Boolean = false,
)

/**
 * Parses `GET /turnos/mios` outside composition. A missing or malformed `start`/`end` never throws:
 * the raw text (or a placeholder) is shown instead of crashing the screen.
 */
object MyShifts {
    const val MISSING_TIME = "Sin hora"
    private val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador"))

    fun formatInstant(value: String?): String {
        val text = value?.trim().orEmpty()
        if (text.isEmpty() || text == "null") return MISSING_TIME
        val instant = runCatching { Instant.parse(text) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(text).toInstant() }.getOrNull()
            ?: return text
        return formatter.format(instant)
    }

    fun parse(value: Any?): List<MyShift> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                val actions = row.optJSONArray("allowedActions")
                MyShift(
                    area = row.optString("area"),
                    period = formatInstant(text(row, "start")) + " — " + formatInstant(text(row, "end")),
                    state = row.optString("state"),
                    id = row.optString("id"),
                    version = row.optInt("version"),
                    attendance = text(row, "attendance"),
                    late = row.optBoolean("late"),
                    canCheckIn = actions != null && (0 until actions.length()).any { actions.optString(it) == "marcar_entrada" },
                )
            }
        }
    }

    private fun text(row: JSONObject, key: String): String? = if (row.isNull(key)) null else row.optString(key)

    /** Attendance text for the person (never the raw code). */
    fun attendanceLabel(shift: MyShift): String? = when (shift.attendance) {
        "presente" -> if (shift.late) "Entrada marcada · tarde" else "Entrada marcada"
        "sin_confirmar" -> "Sin entrada marcada"
        "ausente" -> "Ausencia registrada"
        "pendiente" -> "Entrada pendiente"
        else -> null
    }

    /** Body of `POST /turnos/{id}/entrada`. */
    fun checkInBody(shift: MyShift): JSONObject = JSONObject().put("version", shift.version)

    /** Message for a refused check-in, by `codigo` (the API text is the fallback). */
    fun checkInError(code: String?, status: Int?, fallback: String?): String = when {
        code == "version_conflicto" -> "Tu turno cambió. Actualizamos la lista; vuelve a intentarlo."
        code == "asistencia_ya_marcada" -> "Ya marcaste la entrada de este turno."
        code == "fuera_de_horario" -> "Puedes marcar la entrada desde 30 minutos antes del inicio y hasta el fin del turno."
        code == "transicion_invalida" -> "Este turno ya no admite marcar la entrada. Si es un error, comunícate con la jefatura de operaciones."
        status == 403 -> "Solo puedes marcar la entrada de tus propios turnos."
        else -> fallback?.takeIf { it.isNotBlank() } ?: "No se pudo marcar la entrada. Intenta de nuevo."
    }
}
