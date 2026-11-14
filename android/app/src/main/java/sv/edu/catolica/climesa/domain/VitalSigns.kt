package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/** How far a reading is from the reference range. [INVALID] is outside what the API accepts (it is never sent). */
enum class VitalLevel { NORMAL, ABNORMAL, CRITICAL, INVALID }

/**
 * The measures of the A41 form. `min`/`max` are the hard limits the API and the database accept (400 otherwise);
 * `normal` is the adult reference range and `critical` the bounds past which the reading is an alert. Clinical
 * references are guidance for highlighting, not a diagnosis (the API stays the guarantee, rule 5).
 */
enum class VitalMeasure(
    val key: String,
    val label: String,
    val unit: String,
    val min: Double,
    val max: Double,
    val normalLow: Double?,
    val normalHigh: Double?,
    val criticalBelow: Double?,
    val criticalAbove: Double?,
    val decimals: Boolean = false,
) {
    TEMPERATURE("temperature", "Temperatura", "°C", 30.0, 45.0, 36.0, 37.5, 35.0, 39.5, decimals = true),
    HEART_RATE("heartRate", "Frecuencia cardiaca", "lpm", 20.0, 250.0, 60.0, 100.0, 40.0, 130.0),
    RESPIRATORY_RATE("respiratoryRate", "Frecuencia respiratoria", "rpm", 4.0, 80.0, 12.0, 20.0, 8.0, 30.0),
    SYSTOLIC("systolic", "Presión sistólica", "mmHg", 40.0, 300.0, 90.0, 139.0, 80.0, 180.0),
    DIASTOLIC("diastolic", "Presión diastólica", "mmHg", 20.0, 200.0, 60.0, 89.0, 50.0, 120.0),
    OXYGEN("oxygenSaturation", "Saturación de oxígeno", "%", 40.0, 100.0, 95.0, null, 90.0, null),
    PAIN("pain", "Dolor (0 a 10)", "/10", 0.0, 10.0, null, 3.0, null, 7.0),
    GLUCOSE("glucoseMgDl", "Glucemia", "mg/dL", 20.0, 800.0, 70.0, 140.0, 54.0, 300.0),
    WEIGHT("weightKg", "Peso", "kg", 0.3, 400.0, null, null, null, null, decimals = true),
    HEIGHT("heightCm", "Talla", "cm", 20.0, 250.0, null, null, null, null, decimals = true);

    /** Measures with a reference range: they get a level, a trend and alerts. Weight and height are plain data. */
    val monitored: Boolean get() = normalLow != null || normalHigh != null

    fun level(value: Double): VitalLevel = when {
        value < min || value > max -> VitalLevel.INVALID
        criticalBelow != null && value < criticalBelow -> VitalLevel.CRITICAL
        criticalAbove != null && value >= criticalAbove -> VitalLevel.CRITICAL
        // SpO2 at or below 90 and pain from 7 up are critical even though their bound is "inclusive".
        this == OXYGEN && value <= 90.0 -> VitalLevel.CRITICAL
        normalLow != null && value < normalLow -> VitalLevel.ABNORMAL
        normalHigh != null && value > normalHigh -> VitalLevel.ABNORMAL
        else -> VitalLevel.NORMAL
    }

    /** "60–100 lpm" style text of the reference range. */
    fun referenceText(): String? = when {
        normalLow != null && normalHigh != null -> "${format(normalLow)}–${format(normalHigh)} $unit"
        normalLow != null -> "${format(normalLow)} $unit o más"
        normalHigh != null -> "hasta ${format(normalHigh)} $unit"
        else -> null
    }

    fun format(value: Double): String = if (decimals && value % 1.0 != 0.0) String.format(Locale.US, "%.1f", value) else value.toLong().toString()
    fun rangeText(): String = "${format(min)} a ${format(max)} $unit"
}

/** Typed text of the capture form. Decimals accept a comma (es-SV keyboards). */
data class VitalsForm(
    val values: Map<VitalMeasure, String> = emptyMap(),
    val note: String = "",
) {
    fun value(measure: VitalMeasure): String = values[measure].orEmpty()
    fun with(measure: VitalMeasure, text: String): VitalsForm = copy(values = values + (measure to text))
}

object VitalsRules {
    const val NOTE_MAX = 500

    fun parse(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()

    /** Allowed characters while typing: digits and one decimal separator (only for measures that take decimals). */
    fun sanitize(measure: VitalMeasure, text: String): String {
        val cleaned = text.filter { it.isDigit() || (measure.decimals && (it == '.' || it == ',')) }
        val separator = cleaned.indexOfFirst { it == '.' || it == ',' }
        val single = if (separator < 0) cleaned else cleaned.substring(0, separator + 1) + cleaned.substring(separator + 1).filter { it.isDigit() }
        return single.take(6)
    }

    /** Inline error for one field, or null when it is empty or acceptable. */
    fun fieldError(measure: VitalMeasure, text: String): String? {
        if (text.isBlank()) return null
        val value = parse(text) ?: return "Escribe un número."
        if (!measure.decimals && value % 1.0 != 0.0) return "Solo números enteros."
        return if (measure.level(value) == VitalLevel.INVALID) "Fuera de rango: ${measure.rangeText()}." else null
    }

    fun level(measure: VitalMeasure, text: String): VitalLevel? {
        val value = parse(text) ?: return null
        return measure.level(value)
    }

    /** First blocking problem of the whole form, or null when it can be sent. */
    fun formError(form: VitalsForm): String? {
        VitalMeasure.entries.forEach { m -> fieldError(m, form.value(m))?.let { return "${m.label}: $it" } }
        val filled = VitalMeasure.entries.filter { form.value(it).isNotBlank() }
        if (filled.isEmpty()) return "Registra al menos una medida."
        val sys = parse(form.value(VitalMeasure.SYSTOLIC)); val dia = parse(form.value(VitalMeasure.DIASTOLIC))
        if ((sys == null) != (dia == null)) return "La presión necesita la sistólica y la diastólica."
        if (sys != null && dia != null && sys <= dia) return "La sistólica debe ser mayor que la diastólica."
        if (form.note.length > NOTE_MAX) return "La nota no puede pasar de $NOTE_MAX caracteres."
        return null
    }

    /** Body of `POST /pacientes/{id}/signos`; only filled measures are sent. */
    fun body(form: VitalsForm, admissionId: String?): JSONObject = JSONObject().apply {
        VitalMeasure.entries.forEach { m ->
            val v = parse(form.value(m)) ?: return@forEach
            if (m.decimals) put(m.key, v) else put(m.key, v.toInt())
        }
        if (form.note.isNotBlank()) put("note", form.note.trim())
        if (!admissionId.isNullOrBlank()) put("admissionId", admissionId)
    }
}

/** One take of vital signs from `GET /pacientes/{id}/signos`. Missing measures are null. */
data class VitalReading(
    val id: String,
    val takenAt: Instant?,
    val takenByName: String?,
    val fromConsultation: Boolean,
    val values: Map<VitalMeasure, Double>,
    val note: String?,
) {
    fun level(measure: VitalMeasure): VitalLevel? = values[measure]?.let { measure.level(it) }

    /** Worst level among the monitored measures of this take. */
    val worst: VitalLevel get() = values.entries.filter { it.key.monitored }.map { it.key.level(it.value) }
        .let { levels -> levels.firstOrNull { it == VitalLevel.CRITICAL } ?: levels.firstOrNull { it == VitalLevel.ABNORMAL } ?: VitalLevel.NORMAL }

    /** "PA 120/80 · FC 72 lpm" one-line summary. */
    fun summary(): String {
        val parts = mutableListOf<String>()
        val s = values[VitalMeasure.SYSTOLIC]; val d = values[VitalMeasure.DIASTOLIC]
        if (s != null && d != null) parts += "PA ${VitalMeasure.SYSTOLIC.format(s)}/${VitalMeasure.DIASTOLIC.format(d)}"
        VitalMeasure.entries.filter { it != VitalMeasure.SYSTOLIC && it != VitalMeasure.DIASTOLIC }.forEach { m ->
            values[m]?.let { parts += "${shortLabel(m)} ${m.format(it)}${if (m == VitalMeasure.TEMPERATURE || m == VitalMeasure.OXYGEN) m.unit else ""}" }
        }
        return parts.joinToString(" · ")
    }

    companion object {
        fun shortLabel(m: VitalMeasure) = when (m) {
            VitalMeasure.TEMPERATURE -> "T"; VitalMeasure.HEART_RATE -> "FC"; VitalMeasure.RESPIRATORY_RATE -> "FR"
            VitalMeasure.SYSTOLIC -> "PAS"; VitalMeasure.DIASTOLIC -> "PAD"; VitalMeasure.OXYGEN -> "SpO2"
            VitalMeasure.PAIN -> "Dolor"; VitalMeasure.GLUCOSE -> "Glucemia"; VitalMeasure.WEIGHT -> "Peso"; VitalMeasure.HEIGHT -> "Talla"
        }
    }
}

/** An alert of the latest take: a monitored measure outside its range. */
data class VitalAlert(val measure: VitalMeasure, val value: Double, val level: VitalLevel)

data class VitalsHistory(
    val patientId: String,
    val patientName: String,
    val record: String,
    val age: Int?,
    val admissionId: String?,
    val bed: String?,
    val readings: List<VitalReading>,
) {
    val latest: VitalReading? get() = readings.firstOrNull()

    /** Latest value per monitored measure plus its level; the alerts are the abnormal ones. */
    fun alerts(): List<VitalAlert> = VitalMeasure.entries.filter { it.monitored }.mapNotNull { m ->
        val value = latestValue(m) ?: return@mapNotNull null
        val level = m.level(value)
        if (level == VitalLevel.ABNORMAL || level == VitalLevel.CRITICAL) VitalAlert(m, value, level) else null
    }.sortedByDescending { it.level == VitalLevel.CRITICAL }

    /** Most recent take that carries [measure] (a take may record only some measures). */
    fun latestReadingWith(measure: VitalMeasure): VitalReading? = readings.firstOrNull { measure in it.values }
    fun latestValue(measure: VitalMeasure): Double? = latestReadingWith(measure)?.values?.get(measure)

    /** Values oldest to newest for the trend chart (the API sends newest first). */
    fun trend(measure: VitalMeasure, max: Int = 12): List<Double> =
        readings.mapNotNull { it.values[measure] }.take(max).reversed()

    fun trendMeasures(): List<VitalMeasure> = VitalMeasure.entries.filter { m -> m.monitored && readings.count { m in it.values } >= 1 }
}

/** A patient the user can pick to take signs: from the ward, the queue or the autosuggest search. */
data class VitalsCandidate(val patientId: String, val name: String, val detail: String?, val record: String? = null)

object VitalsParser {
    private val keys = mapOf(
        VitalMeasure.TEMPERATURE to "temperature", VitalMeasure.HEART_RATE to "heartRate", VitalMeasure.RESPIRATORY_RATE to "respiratoryRate",
        VitalMeasure.SYSTOLIC to "systolic", VitalMeasure.DIASTOLIC to "diastolic", VitalMeasure.OXYGEN to "oxygenSaturation",
        VitalMeasure.PAIN to "pain", VitalMeasure.GLUCOSE to "glucoseMgDl", VitalMeasure.WEIGHT to "weightKg", VitalMeasure.HEIGHT to "heightCm",
    )

    private fun number(row: JSONObject, key: String): Double? {
        if (row.isNull(key) || !row.has(key)) return null
        return when (val raw = row.get(key)) { is Number -> raw.toDouble(); is String -> raw.toDoubleOrNull(); else -> null }
    }

    fun history(value: Any?): VitalsHistory? {
        val root = value as? JSONObject ?: return null
        val items = root.optJSONArray("items") ?: JSONArray()
        val readings = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.map { row ->
            VitalReading(
                id = row.optString("id"),
                takenAt = runCatching { Instant.parse(row.optString("takenAt")) }.getOrNull(),
                takenByName = row.optString("takenByName").takeIf { it.isNotBlank() && !row.isNull("takenByName") },
                fromConsultation = !row.isNull("consultationId") && row.optString("consultationId").isNotBlank(),
                values = VitalMeasure.entries.mapNotNull { m -> number(row, keys.getValue(m))?.let { m to it } }.toMap(),
                note = row.optString("note").takeIf { it.isNotBlank() && !row.isNull("note") },
            )
        }
        return VitalsHistory(
            patientId = root.optString("patientId"), patientName = root.optString("patientName"), record = root.optString("record"),
            age = if (root.isNull("age") || !root.has("age")) null else root.optInt("age"),
            admissionId = root.optString("admissionId").takeIf { it.isNotBlank() && !root.isNull("admissionId") },
            bed = root.optString("bed").takeIf { it.isNotBlank() && !root.isNull("bed") },
            readings = readings,
        )
    }

    /** `GET /admisiones`: patients in the area that wait for a bed or occupy one. */
    fun ward(value: Any?): List<VitalsCandidate> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
            .filter { it.optString("state") in setOf("hospitalizado", "pendiente_cama") && it.optString("patientId").isNotBlank() }
            .map {
                val bed = it.optString("bed")
                VitalsCandidate(it.optString("patientId"), it.optString("patientName").ifBlank { "Paciente" }, if (bed.isBlank()) "Sin cama asignada" else "Cama $bed")
            }.distinctBy { it.patientId }
    }

    /** `GET /fila`: today's tickets that already have a patient and are still being served. */
    fun queue(value: Any?): List<VitalsCandidate> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
            .filter { !it.isNull("patientId") && it.optString("patientId").isNotBlank() && it.optString("state") in setOf("en_espera", "llamado", "en_atencion") }
            .sortedBy { if (it.optString("state") == "llamado") 0 else 1 }
            .map {
                VitalsCandidate(it.optString("patientId"), it.optString("patientName").ifBlank { "Paciente" },
                    "${QueueLabels.service(it.optString("service"))} · N° ${it.optInt("numero")} · ${QueueLabels.state(it.optString("state"))}")
            }.distinctBy { it.patientId }
    }

    /** `GET /pacientes/selector`: `{items:[{id, record, fullName, age?}]}`. */
    fun search(value: Any?): List<VitalsCandidate> {
        val items = (value as? JSONObject)?.optJSONArray("items") ?: (value as? JSONArray) ?: return emptyList()
        return (0 until items.length()).mapNotNull { items.optJSONObject(it) }.map {
            val age = if (it.isNull("age") || !it.has("age")) null else it.optInt("age")
            VitalsCandidate(it.optString("id"), it.optString("fullName"), listOfNotNull("Exp. ${it.optString("record")}", age?.let { a -> "$a años" }).joinToString(" · "), it.optString("record"))
        }
    }
}

object VitalsFormat {
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val full = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale("es", "SV")).withZone(zone)
    private val hourOnly = DateTimeFormatter.ofPattern("HH:mm", Locale("es", "SV")).withZone(zone)
    fun time(at: Instant?): String = at?.let { full.format(it) } ?: "—"
    fun hour(at: Instant?): String = at?.let { hourOnly.format(it) } ?: "—"
}

/** Realtime: the history refreshes when another device saves signs (event `signos.registrados`, entity `paciente`). */
object VitalsEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "signos") || event.type == "signos.registrados"
}
