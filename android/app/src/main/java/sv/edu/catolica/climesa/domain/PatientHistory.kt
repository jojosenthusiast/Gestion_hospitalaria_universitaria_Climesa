package sv.edu.catolica.climesa.domain

import java.time.LocalDate

/**
 * Birth dates read "30 may 1999", like the web `formatDate(birth, { withYear: true })`: the year stays because it is
 * what identifies the person. Any other ISO value is returned unchanged; blank is null.
 */
object BirthDates {
    private val months = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    fun format(iso: String?): String? {
        val raw = iso?.trim()?.take(10).orEmpty()
        if (raw.isEmpty()) return null
        val date = runCatching { LocalDate.parse(raw) }.getOrNull() ?: return iso
        return format(date)
    }

    fun format(date: LocalDate): String = "${date.dayOfMonth} ${months[date.monthValue - 1]} ${date.year}"
}

/**
 * "Cambios" of a patient record (`GET /pacientes/{id}` `history`): the field names and values the web shows
 * (`fieldNames` in patients.tsx), never the raw column or enum.
 */
object PatientHistory {
    val fieldNames: Map<String, String> = mapOf(
        "nombres" to "Nombres", "primer_apellido" to "Apellidos", "segundo_apellido" to "Segundo apellido", "sexo" to "Sexo",
        "nacimiento" to "Nacimiento", "precision_nacimiento" to "Precisión del nacimiento", "telefono" to "Teléfono", "correo" to "Correo",
        "direccion" to "Dirección", "dui" to "DUI", "estado" to "Estado",
    )
    private val sexNames = mapOf("femenino" to "Femenino", "masculino" to "Masculino", "indeterminado" to "Indeterminado", "no_registrado" to "No registrado")
    private val precisionNames = mapOf("exacta" to "Exacta", "anio_mes" to "Año y mes", "anio" to "Solo el año", "estimada" to "Estimada", "desconocida" to "Desconocida")
    private val stateNames = mapOf("activo" to "Activo", "inactivo" to "Inactivo", "provisional" to "Provisional", "true" to "Activo", "false" to "Inactivo")

    fun label(field: String): String = fieldNames[field] ?: field.replace('_', ' ').replaceFirstChar { it.uppercase() }

    /** One value as a person reads it; null or blank is "Sin registrar". */
    fun value(field: String, raw: String?): String {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty() || text == "null") return "Sin registrar"
        return when (field) {
            "sexo" -> sexNames[text] ?: text
            "nacimiento" -> BirthDates.format(text) ?: text
            "precision_nacimiento" -> precisionNames[text] ?: text
            "estado" -> stateNames[text] ?: text
            else -> text
        }
    }

    /** "Apellidos: Pérez → Pérez López". */
    fun change(field: String, before: String?, after: String?): Pair<String, String> = label(field) to "${value(field, before)} → ${value(field, after)}"
}
