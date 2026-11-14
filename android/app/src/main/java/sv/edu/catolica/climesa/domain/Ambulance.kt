package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Modelos de `GET /ambulancia` (spec 109) leídos con org.json; nunca traen datos del paciente. */
data class AmbulanceUnit(val id: String, val plate: String, val state: String, val version: Int)
data class AmbulanceMilestone(val type: String, val occurredAt: String)
data class AmbulanceCrewMember(val staffId: String, val role: String, val name: String)
data class AmbulanceService(
    val id: String,
    val type: String,
    val priority: String,
    val origin: String,
    val destination: String,
    val dispatchedAt: String,
    val hasPrehospital: Boolean,
    val crew: List<AmbulanceCrewMember>,
    val milestones: List<AmbulanceMilestone>,
    val nextMilestones: List<String>,
)
data class AmbulanceRequestRow(val id: String, val channel: String, val address: String, val municipality: String, val reason: String, val contactPhone: String, val createdAt: String, val version: Int)
data class AmbulanceStatus(val unit: AmbulanceUnit, val activeService: AmbulanceService?, val paramedicOnDuty: Boolean, val pendingRequests: List<AmbulanceRequestRow>)
data class AmbulanceLogEntry(val id: String, val type: String, val priority: String, val origin: String, val destination: String, val dispatchedAt: String, val finalState: String?, val responseMinutes: Int?)
data class PrehospitalEntry(val id: String, val priority: String, val estimatedArrival: String?, val capturedAt: String, val reason: String?, val vitalSigns: Map<String, String>)
data class PrehospitalView(val serviceId: String, val active: Boolean, val clinical: Boolean, val reports: List<PrehospitalEntry>)

/** Formulario del reporte prehospital (A72). Los signos vacíos no se envían. */
data class PrehospitalForm(
    val reason: String = "",
    val priority: String = "amarilla",
    val etaMinutes: String = "",
    val heartRate: String = "",
    val systolic: String = "",
    val diastolic: String = "",
    val oxygenSaturation: String = "",
    val temperature: String = "",
    val glasgow: String = "",
)

object AmbulanceLabels {
    val priorities = listOf("roja" to "Roja", "naranja" to "Naranja", "amarilla" to "Amarilla", "verde" to "Verde")
    val types = listOf("emergencia_domicilio" to "Emergencia a domicilio", "traslado_interhospitalario" to "Traslado interhospitalario")
    /** Estados finales permitidos antes de llegar al hospital (RN-32): siempre con motivo. */
    val earlyFinalStates = listOf("sin_traslado" to "Sin traslado", "rechaza_traslado" to "Paciente rechaza traslado", "cancelado" to "Cancelado")
    private val milestones = mapOf("salida" to "Salida", "en_escena" to "En escena", "trasladando" to "Trasladando", "en_hospital" to "En hospital", "finalizado" to "Finalizado")
    private val finals = mapOf("completado" to "Completado", "cancelado" to "Cancelado", "sin_traslado" to "Sin traslado", "rechaza_traslado" to "Paciente rechaza traslado")
    private val states = mapOf("disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento")
    private val signs = mapOf("heartRate" to "Frecuencia cardiaca", "systolic" to "Presión sistólica", "diastolic" to "Presión diastólica", "respiratoryRate" to "Frecuencia respiratoria", "oxygenSaturation" to "Saturación", "temperature" to "Temperatura", "glasgow" to "Glasgow")
    fun milestone(code: String) = milestones[code] ?: code
    fun finalState(code: String?) = code?.let { finals[it] ?: it } ?: "En curso"
    fun unitState(code: String) = states[code] ?: code
    fun priority(code: String) = priorities.firstOrNull { it.first == code }?.second ?: code
    fun type(code: String) = types.firstOrNull { it.first == code }?.second ?: code
    fun sign(code: String) = signs[code] ?: code
}

object AmbulanceRules {
    const val NOTICE_911 = "Si hay riesgo de vida, llama al 911."
    private val phone = Regex("^[0-9+ -]{8,20}$")

    fun requestError(address: String, reason: String, contactPhone: String): String? = when {
        address.trim().length < 5 -> "Indica la dirección, de al menos 5 caracteres."
        reason.trim().length < 5 -> "Indica el motivo, de al menos 5 caracteres."
        !phone.matches(contactPhone.trim()) -> "Indica un teléfono de contacto de 8 a 20 dígitos."
        else -> null
    }

    fun requestBody(address: String, municipality: String, reason: String, contactPhone: String): JSONObject = JSONObject()
        .put("address", address.trim()).put("reason", reason.trim()).put("contactPhone", contactPhone.trim())
        .apply { if (municipality.isNotBlank()) put("municipality", municipality.trim()) }

    fun dispatchBody(unitVersion: Int, requestId: String, type: String, priority: String, destination: String): JSONObject =
        JSONObject().put("version", unitVersion).put("requestId", requestId).put("type", type).put("priority", priority).put("destination", destination.trim())

    /** Finalizar antes de llegar al hospital exige estado final y motivo; desde el hospital es "completado". */
    fun milestoneBody(type: String, finalState: String? = null, reason: String = ""): JSONObject =
        JSONObject().put("type", type).apply {
            if (type == "finalizado" && finalState != null) put("finalState", finalState)
            if (reason.isNotBlank()) put("reason", reason.trim())
        }

    fun finishNeedsReason(service: AmbulanceService) = service.milestones.none { it.type == "en_hospital" }

    fun prehospitalError(form: PrehospitalForm): String? = when {
        form.reason.trim().length < 5 -> "Indica el motivo, de al menos 5 caracteres."
        form.priority !in AmbulanceLabels.priorities.map { it.first } -> "Elige la prioridad."
        form.etaMinutes.isNotBlank() && form.etaMinutes.toIntOrNull()?.let { it in 0..600 } != true -> "La hora estimada va en minutos, de 0 a 600."
        listOf(form.heartRate, form.systolic, form.diastolic, form.oxygenSaturation, form.glasgow).any { it.isNotBlank() && it.toIntOrNull() == null } -> "Los signos vitales van en números enteros."
        form.temperature.isNotBlank() && form.temperature.replace(',', '.').toDoubleOrNull() == null -> "La temperatura va en grados, por ejemplo 37.5."
        else -> null
    }

    /** Cuerpo de `POST /ambulancia/servicios/{id}/prehospital`; `capturedAt` es la hora del teléfono (puede enviarse tarde). */
    fun prehospitalBody(form: PrehospitalForm, capturedAt: java.time.Instant, patientId: String?): JSONObject {
        val signs = JSONObject()
        form.heartRate.toIntOrNull()?.let { signs.put("heartRate", it) }
        form.systolic.toIntOrNull()?.let { signs.put("systolic", it) }
        form.diastolic.toIntOrNull()?.let { signs.put("diastolic", it) }
        form.oxygenSaturation.toIntOrNull()?.let { signs.put("oxygenSaturation", it) }
        form.temperature.replace(',', '.').toDoubleOrNull()?.let { signs.put("temperature", it) }
        form.glasgow.toIntOrNull()?.let { signs.put("glasgow", it) }
        return JSONObject().put("reason", form.reason.trim()).put("priority", form.priority).put("capturedAt", capturedAt.toString())
            .put("vitalSigns", signs)
            .apply {
                form.etaMinutes.toIntOrNull()?.let { put("estimatedArrival", capturedAt.plusSeconds(it * 60L).toString()) }
                patientId?.let { put("patientId", it) }
            }
    }

    /** Paciente sin identidad (A73): sexo, edad estimada y señas; nunca se inventan nombre ni fecha (D-004). */
    fun unidentifiedError(sex: String, age: String, description: String): String? = when {
        sex !in listOf("femenino", "masculino", "indeterminado", "no_registrado") -> "Elige el sexo observado."
        age.isNotBlank() && age.toIntOrNull()?.let { it in 0..120 } != true -> "La edad estimada va de 0 a 120 años."
        description.trim().length < 5 -> "Describe las señas, de al menos 5 caracteres."
        else -> null
    }
}

object AmbulanceParser {
    private fun JSONObject.text(name: String) = if (isNull(name)) "" else optString(name)
    private fun objects(array: JSONArray?) = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
    private fun strings(array: JSONArray?) = (0 until (array?.length() ?: 0)).map { array!!.optString(it) }

    fun status(value: Any?): AmbulanceStatus? {
        val root = value as? JSONObject ?: return null
        val unit = root.optJSONObject("unit") ?: return null
        val service = root.optJSONObject("activeService")?.let { s ->
            AmbulanceService(
                s.text("id"), s.text("type"), s.text("priority"), s.text("origin"), s.text("destination"), s.text("dispatchedAt"), s.optBoolean("hasPrehospital"),
                objects(s.optJSONArray("crew")).map { AmbulanceCrewMember(it.text("staffId"), it.text("role"), it.text("name")) },
                objects(s.optJSONArray("milestones")).map { AmbulanceMilestone(it.text("type"), it.text("occurredAt")) },
                strings(s.optJSONArray("nextMilestones")),
            )
        }
        val pending = objects(root.optJSONArray("pendingRequests")).map {
            AmbulanceRequestRow(it.text("id"), it.text("channel"), it.text("address"), it.text("municipality"), it.text("reason"), it.text("contactPhone"), it.text("createdAt"), it.optInt("version", 1))
        }
        return AmbulanceStatus(AmbulanceUnit(unit.text("id"), unit.text("plate"), unit.text("state"), unit.optInt("version", 1)), service, root.optBoolean("paramedicOnDuty"), pending)
    }

    fun log(value: Any?): List<AmbulanceLogEntry> = objects(value as? JSONArray).map {
        AmbulanceLogEntry(it.text("id"), it.text("type"), it.text("priority"), it.text("origin"), it.text("destination"), it.text("dispatchedAt"), it.text("finalState").ifBlank { null }, if (it.isNull("responseMinutes")) null else it.optInt("responseMinutes"))
    }

    fun prehospital(value: Any?): PrehospitalView? {
        val root = value as? JSONObject ?: return null
        val reports = objects(root.optJSONArray("reports")).map { r ->
            val signs = r.optJSONObject("vitalSigns")
            PrehospitalEntry(
                r.text("id"), r.text("priority"), r.text("estimatedArrival").ifBlank { null }, r.text("capturedAt"),
                if (r.has("reason")) r.text("reason") else null,
                signs?.keys()?.asSequence()?.associateWith { signs.optString(it) }.orEmpty(),
            )
        }
        return PrehospitalView(root.text("serviceId"), root.optBoolean("active"), root.optBoolean("clinical"), reports)
    }
}

/** Eventos `ambulancia.*` (estado, solicitud, hito, prehospital, ubicación) en el canal `ambulancia`, de rol o del paciente. */
object AmbulanceEvents {
    /** La ubicación llega cada 10 s y no cambia lo que muestran estas pantallas. */
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "ambulancia") && event.type != "ambulancia.ubicacion"
    fun isPrehospital(event: EventoDominio) = event.type == "ambulancia.prehospital"
}
