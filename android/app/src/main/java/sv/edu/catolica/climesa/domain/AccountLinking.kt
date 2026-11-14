package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** A03 states (pantallas.csv): form, in verification, approved, rejected. */
enum class LinkStatus { FORM, PENDING, APPROVED, REJECTED }

/**
 * Account-to-record linking (spec 101, FR-101-08 to FR-101-10, RN-39). The client only checks the format for comfort;
 * the API validates the DUI check digit and compares DUI and date of birth with the record.
 */
object LinkRules {
    /** Field errors for the A03 form; empty when it can be sent. */
    fun errors(dui: String, birth: String, today: LocalDate): Map<String, String> = buildMap {
        if (!dui.trim().matches(Regex("[0-9]{8}-?[0-9]")) || !PatientRules.validDui(dui)) put("dui", "Usa 9 dígitos con un verificador válido.")
        val date = parseDate(birth)
        if (date == null) put("birth", "Escribe la fecha como aaaa-mm-dd.")
        else if (date.isAfter(today)) put("birth", "La fecha de nacimiento no puede ser futura.")
    }

    fun body(dui: String, birth: String): JSONObject = JSONObject().put("dui", PatientRules.formatDui(dui.trim())).put("birth", birth.trim())

    /** Status returned by `POST /cuentas/vinculacion` (`state`: pendiente, aprobada, rechazada). */
    fun statusOf(state: String): LinkStatus = when (state) {
        "pendiente" -> LinkStatus.PENDING
        "aprobada" -> LinkStatus.APPROVED
        "rechazada" -> LinkStatus.REJECTED
        else -> LinkStatus.FORM
    }

    private fun parseDate(value: String): LocalDate? =
        if (!value.trim().matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) null else try { LocalDate.parse(value.trim()) } catch (_: DateTimeParseException) { null }
}

/** `vinculacion.solicitada` / `vinculacion.resuelta` (tiempo-real.md); the patient receives them on `usuario:<id>`. */
object LinkEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "vinculacion_paciente", "vinculacion")
    fun resolved(event: EventoDominio) = event.type == "vinculacion.resuelta"
}
