package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Modelos de `GET /ambulancia` (spec 109) leídos con org.json; nunca traen datos del paciente. */
data class AmbulanceUnit(val id: String, val plate: String, val state: String, val version: Int, val stateReason: String = "", val stateSince: String = "")
data class AmbulanceMilestone(val type: String, val occurredAt: String)
data class AmbulanceCrewMember(val staffId: String, val role: String, val name: String)
/** MA-AMB-02: paramédico o motorista de turno que el despachador puede elegir (`availableCrew`). */
data class CrewCandidate(val staffId: String, val role: String, val name: String, val hasAccount: Boolean)
data class ServicePatient(val record: String, val fullName: String)
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
    val lastLocation: AmbulanceLocation? = null,
    /** MA-AMB-03: final states the API accepts with the milestones already recorded (server-driven finish choices). */
    val finalStates: List<String> = emptyList(),
    /**
     * Preconditions S5: `hito`, `deshacer_hito`, `reportar`, sent only to the assigned crew. Null when an older API does not
     * send the field (every action stays offered, today's behavior).
     */
    val allowedActions: List<String>? = null,
    /** Linked patient, sent only to the assigned crew and dispatch; null for everyone else or when no patient is linked. */
    val patient: ServicePatient? = null,
    /** Municipality of the call (D22: the map needs it to find the right street). */
    val municipality: String = "",
) {
    val canAdvance get() = allowedActions == null || "hito" in allowedActions
    val canUndo get() = allowedActions == null || "deshacer_hito" in allowedActions
    val canReport get() = allowedActions == null || "reportar" in allowedActions
    /** S5: a paramedic who is not in this service's crew sees it read-only, with [NOT_CREW]. */
    val readOnly get() = !canAdvance && !canUndo && !canReport

    companion object {
        const val NOT_CREW = "No estás en la tripulación de este servicio."
    }
}
/** Último punto GPS que la tripulación envió a `POST /ambulancia/ubicacion`. */
data class AmbulanceLocation(val latitude: Double, val longitude: Double, val capturedAt: String)
/** Quién pidió (paciente o quien llamó), su expediente si lo tiene y desde cuándo espera (obs. 7). */
data class AmbulanceRequestRow(
    val id: String, val channel: String, val address: String, val municipality: String, val reason: String, val contactPhone: String, val createdAt: String, val version: Int,
    val requesterName: String = "", val callerName: String = "", val patientRecord: String = "",
)
/** Por qué no se puede despachar ahora y qué hacer; la calcula la API (RN-29, RN-30). */
data class DispatchBlock(
    val code: String, val message: String, val action: String,
    /** D135: optional `cause`; `ausencia_registrada` means the shift is published but marked absent, so never ask to publish it. */
    val cause: String? = null,
) {
    val absenceRecorded get() = cause == "ausencia_registrada"
}
/** `driverOnDuty` (RN-30): an older API without the key counts as covered, so it never raises a false alarm. */
data class AmbulanceStatus(val unit: AmbulanceUnit, val activeService: AmbulanceService?, val paramedicOnDuty: Boolean, val pendingRequests: List<AmbulanceRequestRow>, val dispatchBlock: DispatchBlock? = null, val driverOnDuty: Boolean = true, val availableCrew: List<CrewCandidate> = emptyList())
/** Servicio de la bitácora: sin nombre del paciente, solo su expediente enmascarado. */
data class AmbulanceLogEntry(
    val id: String, val type: String, val priority: String, val origin: String, val destination: String, val dispatchedAt: String, val finalState: String?, val responseMinutes: Int?,
    val municipality: String = "", val crew: List<String> = emptyList(), val milestones: List<AmbulanceMilestone> = emptyList(), val patientRef: String = "",
    /** BL-05: Jefatura closed the service administratively (`POST /ambulancia/servicios/{id}/cerrar`). */
    val administrativeClose: Boolean = false,
)
/** Búsqueda y filtros de la bitácora; vacío significa «todos». */
data class LogFilters(val query: String = "", val priority: String = "", val finalState: String = "", val type: String = "") {
    val activeCount get() = listOf(priority, finalState, type).count { it.isNotBlank() }
    val any get() = query.isNotBlank() || activeCount > 0
}
data class PrehospitalEntry(val id: String, val priority: String, val estimatedArrival: String?, val capturedAt: String, val reason: String?, val vitalSigns: Map<String, String>)
/** MA-AMB-04: who received the patient at the hospital and when. */
data class Handover(val receivedAt: String, val receivedByName: String)
data class PrehospitalView(
    val serviceId: String, val active: Boolean, val clinical: Boolean, val reports: List<PrehospitalEntry>,
    val version: Int = 1, val arrived: Boolean = false, val handover: Handover? = null, val allowedActions: List<String> = emptyList(),
    /** D120: actions the server would refuse now, with its code and reason (S12: say why instead of offering them). */
    val blockedActions: List<BlockedAction> = emptyList(),
    val urgent: Boolean = false,
    /** D120: the reader sees the report only because the reception is open; the read is logged as urgent. */
    val urgentAccess: Boolean = false,
) {
    val canReceive get() = "recibir" in allowedActions
    /** Why "Marcar recibido" is not offered, from `blockedActions`; null when allowed or when an older API sends none. */
    val receiveBlockedReason get() = if (canReceive) null else blockedActions.firstOrNull { it.action == "recibir" }?.reason?.takeIf { it.isNotBlank() }
}
data class BlockedAction(val action: String, val code: String, val reason: String)

/** MA-AMB-04: a service the hospital receives or waits for (`GET /ambulancia/llegada`), without clinical data. */
data class ArrivalCandidate(
    val serviceId: String, val dispatchedAt: String, val active: Boolean, val arrived: Boolean,
    /** Optional in `/ambulancia/llegada` (D25/D26): triage priority and whether the crew already sent the report. */
    val priority: String? = null, val hasPrehospital: Boolean = false,
    /** D120/D26: always true in the new API (an ambulance is urgent); `state` is the last milestone, `despachado` before any. */
    val urgent: Boolean = false, val state: String? = null,
)

/** D26: words for the `state` of `/ambulancia/llegada`. */
object ArrivalStates {
    fun label(state: String?): String? = when (state) {
        "despachado" -> "Despachada"
        "salida" -> "Saliendo hacia la escena"
        "en_escena" -> "En la escena"
        "trasladando" -> "En camino al hospital"
        "en_hospital" -> "En el hospital"
        "finalizado" -> "Servicio finalizado"
        else -> null
    }
}

/** MA-AMB-05: progress of the service dispatched for the patient's own request (no crew, no location). */
data class OwnRequestService(val dispatchedAt: String, val milestones: List<AmbulanceMilestone>, val finalState: String?)
/** MA-AMB-05: the patient's own request as the server keeps it (`GET /ambulancia/solicitudes/mias`). */
data class OwnAmbulanceRequest(
    val id: String, val state: String, val address: String, val reason: String, val createdAt: String, val version: Int,
    val service: OwnRequestService? = null, val allowedActions: List<String> = emptyList(), val notice: String = "",
    /** Why dispatch discarded it (only in state `descartada`); null from an older API. */
    val discardReason: String? = null,
) {
    val canCancel get() = "cancelar" in allowedActions
    /** Still waiting or on its way: the screen follows it instead of offering a new request. */
    val active get() = state == "por_confirmar" || (state == "confirmada" && service != null && service.finalState == null)
}

/** MA-AMB-06: a milestone recorded without signal; the same key and phone time are resent until the API answers. */
/** [holdUntil] (epoch millis, 0 = free) keeps a just-tapped milestone in its undo window; it is stored like the rest. */
data class QueuedMilestone(val serviceId: String, val type: String, val body: String, val key: String, val holdUntil: Long = 0L) {
    /** Phone time of the milestone, as it will reach the API. */
    val occurredAt: String get() = runCatching { JSONObject(body).optString("occurredAt") }.getOrDefault("")
    fun toJson(): JSONObject = JSONObject().put("serviceId", serviceId).put("type", type).put("body", body).put("key", key).put("holdUntil", holdUntil)
    companion object {
        fun fromJson(json: JSONObject): QueuedMilestone? = runCatching { QueuedMilestone(json.getString("serviceId"), json.getString("type"), json.getString("body"), json.getString("key"), json.optLong("holdUntil", 0L)) }.getOrNull()
    }
}

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
    const val ADMINISTRATIVE_CLOSE = "Cierre administrativo"
    /** Log filter value the API reads as "still without a final state" (`finalState=en_curso`). */
    const val OPEN = "en_curso"
    val priorities = listOf("roja" to "Roja", "naranja" to "Naranja", "amarilla" to "Amarilla", "verde" to "Verde")
    val types = listOf("emergencia_domicilio" to "Emergencia a domicilio", "traslado_interhospitalario" to "Traslado interhospitalario")
    /** Estados finales sin llegar al hospital (RN-32, MA-AMB-03): siempre con motivo. La API dice cuáles admite cada servicio. */
    val earlyFinalStates = listOf("sin_traslado" to "Sin traslado", "rechaza_traslado" to "Paciente rechaza traslado", "fallecido" to "Paciente fallecido", "desviado" to "Desviado a otro centro", "cancelado" to "Cancelado")
    /** Opciones de finalizar que la API admite para [codes], con su texto; nunca se ofrece un estado que la API rechazaría. */
    fun finishChoices(codes: List<String>) = codes.filter { it != "completado" }.map { it to finalState(it) }
    private val milestones = mapOf("salida" to "Salida", "en_escena" to "En escena", "trasladando" to "Trasladando", "en_hospital" to "En hospital", "finalizado" to "Finalizado")
    private val finals = mapOf("completado" to "Completado", "cancelado" to "Cancelado", "sin_traslado" to "Sin traslado", "rechaza_traslado" to "Paciente rechaza traslado", "fallecido" to "Paciente fallecido", "desviado" to "Desviado a otro centro")
    private val requestStates = mapOf("por_confirmar" to "Por confirmar", "confirmada" to "Confirmada", "descartada" to "No se pudo atender", "cancelada" to "Cancelada")
    fun requestState(code: String) = requestStates[code] ?: "Sin estado"
    private val states = mapOf("disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento")
    private val signs = mapOf("heartRate" to "Frecuencia cardiaca", "systolic" to "Presión sistólica", "diastolic" to "Presión diastólica", "respiratoryRate" to "Frecuencia respiratoria", "oxygenSaturation" to "Saturación", "temperature" to "Temperatura", "glasgow" to "Glasgow")
    fun milestone(code: String) = milestones[code] ?: code
    fun crewRole(code: String) = mapOf("paramedico" to "Paramédico", "motorista" to "Motorista", "medico" to "Médico", "enfermero" to "Enfermería")[code] ?: "Personal"
    fun finalState(code: String?) = code?.let { finals[it] ?: it } ?: "En curso"
    fun unitState(code: String) = states[code] ?: code
    fun priority(code: String) = priorities.firstOrNull { it.first == code }?.second ?: code
    fun type(code: String) = types.firstOrNull { it.first == code }?.second ?: code
    fun sign(code: String) = signs[code] ?: code

    /**
     * G4: the prehospital signs as the receiving nurse reads them: pressure joined ("120/80 mmHg"), each value with its unit,
     * in the order of a triage sheet. Unknown codes keep their raw label at the end.
     */
    fun readableSigns(values: Map<String, String>): List<Pair<String, String>> = buildList {
        val v = values.filterValues { it.isNotBlank() && it != "null" }
        val sys = v["systolic"]; val dia = v["diastolic"]
        if (sys != null || dia != null) add("Presión" to "${sys ?: "?"}/${dia ?: "?"} mmHg")
        v["heartRate"]?.let { add("Pulso" to "$it lpm") }
        v["oxygenSaturation"]?.let { add("Saturación" to "$it %") }
        v["respiratoryRate"]?.let { add("Respiración" to "$it rpm") }
        v["temperature"]?.let { add("Temperatura" to "$it °C") }
        v["glasgow"]?.let { add("Glasgow" to "$it/15") }
        val known = setOf("systolic", "diastolic", "heartRate", "oxygenSaturation", "respiratoryRate", "temperature", "glasgow")
        v.filterKeys { it !in known }.forEach { (code, value) -> add(sign(code) to value) }
    }
    /** Prioridad, estado final y tipo elegidos, como texto de chip. */
    fun chips(filters: LogFilters): List<Pair<String, String>> = buildList {
        if (filters.priority.isNotBlank()) add("priority" to "Prioridad: ${priority(filters.priority)}")
        if (filters.finalState.isNotBlank()) add("finalState" to "Estado: ${if (filters.finalState == OPEN) "En curso" else finals[filters.finalState] ?: filters.finalState}")
        if (filters.type.isNotBlank()) add("type" to "Tipo: ${type(filters.type)}")
    }
}

object AmbulanceRules {
    /** Minimum length of the patient's reason (the API rule); "Enviar" stays off below it. */
    const val REASON_MIN = 5

    const val NOTICE_911 = "Si hay riesgo de vida, llama al 911."

    /** Preconditions S6: a patient account without a linked record cannot request (the API refuses it). */
    const val UNLINKED = "Vincula tu expediente para pedir una ambulancia. En una emergencia llama al 911."

    /** S6: why the request form is not offered, or null when it is. */
    fun requestBlocker(patientId: String?): String? = UNLINKED.takeIf { patientId.isNullOrBlank() }
    private val phone = Regex("^[0-9+ -]{8,20}$")

    fun requestError(address: String, reason: String, contactPhone: String): String? = when {
        address.trim().length < 5 -> "Indica la dirección, de al menos 5 caracteres."
        reason.trim().length < REASON_MIN -> "Indica el motivo, de al menos 5 caracteres."
        !phone.matches(contactPhone.trim()) -> "Indica un teléfono de contacto de 8 a 20 dígitos."
        else -> null
    }

    fun requestBody(address: String, municipality: String, reason: String, contactPhone: String): JSONObject = JSONObject()
        .put("address", address.trim()).put("reason", reason.trim()).put("contactPhone", contactPhone.trim())
        .apply { if (municipality.isNotBlank()) put("municipality", municipality.trim()) }

    fun dispatchBody(unitVersion: Int, requestId: String, type: String, priority: String, destination: String, crew: List<String>): JSONObject =
        JSONObject().put("version", unitVersion).put("requestId", requestId).put("type", type).put("priority", priority).put("destination", destination.trim()).put("crew", JSONArray(crew))

    /** MA-AMB-02: crew proposed to the dispatcher: the first paramedic with an account (records milestones) and the first driver. */
    fun defaultCrew(pool: List<CrewCandidate>) = listOfNotNull(pool.firstOrNull { it.role == "paramedico" && it.hasAccount }, pool.firstOrNull { it.role == "motorista" }).map { it.staffId }

    /** What the chosen crew lacks (RN-30, BL-05); null when the API will accept it. */
    fun crewProblem(pool: List<CrewCandidate>, chosen: List<String>): String? {
        val picked = pool.filter { it.staffId in chosen }
        return when {
            picked.none { it.role == "paramedico" && it.hasAccount } -> "Elige un paramédico con cuenta en la app: registra los hitos del servicio."
            picked.none { it.role == "motorista" } -> "Elige un motorista de turno para el servicio."
            else -> null
        }
    }

    /** Finish choices: the API's `finalStates`, or (older API) the same rule over the recorded milestones; never a static list. */
    fun finishOptions(service: AmbulanceService) =
        AmbulanceLabels.finishChoices(service.finalStates.ifEmpty { allowedFinalStates(service.milestones.map { it.type }) })

    /**
     * Finalizar antes de llegar al hospital exige estado final y motivo; desde el hospital es "completado".
     * `occurredAt` es la hora del teléfono al tocar el botón (MA-AMB-06): un hito enviado tarde conserva su hora real.
     */
    fun milestoneBody(type: String, finalState: String? = null, reason: String = "", occurredAt: java.time.Instant? = null): JSONObject =
        JSONObject().put("type", type).apply {
            occurredAt?.let { put("occurredAt", it.toString()) }
            if (type == "finalizado" && finalState != null) put("finalState", finalState)
            if (reason.isNotBlank()) put("reason", reason.trim())
        }

    /** Hitos que pueden seguir a los registrados; la misma regla que la API (RN-32, MA-AMB-03). */
    fun nextMilestones(done: List<String>): List<String> = when {
        "finalizado" in done -> emptyList()
        "salida" !in done -> listOf("salida")
        "en_hospital" in done -> listOf("finalizado")
        "trasladando" in done -> listOf("en_hospital", "finalizado")
        "en_escena" in done -> listOf("trasladando", "finalizado")
        else -> listOf("en_escena", "finalizado")
    }

    /** Estados finales que admite la API con esos hitos (misma regla que `allowedFinalStates` del servidor). */
    fun allowedFinalStates(done: List<String>): List<String> = when {
        "finalizado" in done || "salida" !in done -> emptyList()
        "en_hospital" in done -> listOf("completado")
        "trasladando" in done -> listOf("fallecido", "desviado", "cancelado")
        else -> listOf("sin_traslado", "rechaza_traslado", "fallecido", "cancelado")
    }

    /** El servicio como lo verá la API cuando lleguen los hitos en cola: el paramédico sigue avanzando sin señal. */
    fun withQueued(service: AmbulanceService, queued: List<QueuedMilestone>): AmbulanceService {
        val mine = queued.filter { it.serviceId == service.id && service.milestones.none { m -> m.type == it.type } }
        if (mine.isEmpty()) return service
        val milestones = service.milestones + mine.map { AmbulanceMilestone(it.type, it.occurredAt) }
        val done = milestones.map { it.type }
        return service.copy(milestones = milestones, nextMilestones = nextMilestones(done), finalStates = allowedFinalStates(done))
    }

    /** MA-AMB-05: cuerpo de `POST /ambulancia/solicitudes/{id}/cancelar`; el motivo es opcional. */
    fun cancelBody(version: Int, reason: String): JSONObject = JSONObject().put("version", version).apply { if (reason.isNotBlank()) put("reason", reason.trim().take(300)) }

    /** MA-AMB-04: cuerpo de `POST /ambulancia/servicios/{id}/recepcion` con la versión del servicio que se vio. */
    /** MA-AMB-04: no body fields; the API makes the handover unique without the service version (milestones keep changing it). */
    @Suppress("UNUSED_PARAMETER") fun handoverBody(view: PrehospitalView): JSONObject = JSONObject()

    /** La solicitud que sigue la pantalla del paciente: la activa más reciente (por confirmar o en camino). */
    fun activeRequest(requests: List<OwnAmbulanceRequest>) = requests.firstOrNull { it.active }

    /**
     * With nothing active, the most recent request of the last 7 days (the API's window) that already has an outcome:
     * discarded, cancelled or with its service finished. The patient sees how it ended above the new-request form.
     */
    fun latestResolved(requests: List<OwnAmbulanceRequest>) = if (requests.any { it.active }) null else requests.firstOrNull()

    /** Triage colour on the shared priority scale, like the web `priorityLevel`: red is the only emergency. */
    fun priorityLevel(priority: String) = when (priority) {
        "roja" -> "emergencia"
        "naranja", "amarilla" -> "urgente"
        else -> "rutina"
    }

    /** Log entries by local day of dispatch, newest day first; each day keeps the server's order. */
    fun logDays(entries: List<AmbulanceLogEntry>, zone: java.time.ZoneId = java.time.ZoneId.of("America/El_Salvador")): List<Pair<java.time.LocalDate, List<AmbulanceLogEntry>>> =
        entries.groupBy { runCatching { java.time.Instant.parse(it.dispatchedAt).atZone(zone).toLocalDate() }.getOrDefault(java.time.LocalDate.MIN) }
            .toList().sortedByDescending { it.first }

    /** Qué pasa con la solicitud, en una frase para el paciente. */
    fun requestProgress(request: OwnAmbulanceRequest): String {
        val service = request.service
        return when {
            request.state == "por_confirmar" -> "Despacho te llamará para confirmar antes de mover la ambulancia."
            request.state == "cancelada" -> "Cancelaste esta solicitud."
            request.state == "descartada" -> "Despacho no pudo atender esta solicitud" + (request.discardReason?.takeIf { it.isNotBlank() }?.let { ": ${it.trim()}" } ?: "") + ". Si hay riesgo de vida, llama al 911."
            service == null -> "Despacho confirmó tu solicitud."
            service.finalState != null -> "El servicio terminó: ${AmbulanceLabels.finalState(service.finalState).lowercase()}."
            service.milestones.any { it.type == "en_hospital" } -> "La ambulancia llegó al hospital."
            service.milestones.any { it.type == "trasladando" } -> "La ambulancia va hacia el hospital."
            service.milestones.any { it.type == "en_escena" } -> "La ambulancia llegó al lugar."
            service.milestones.any { it.type == "salida" } -> "La ambulancia va en camino."
            else -> "Despacho confirmó tu solicitud: la ambulancia saldrá en breve."
        }
    }

    /** Cuerpo de `POST /ambulancia/ubicacion`; solo la API decide si hay servicio activo. */
    fun locationBody(latitude: Double, longitude: Double, capturedAt: java.time.Instant): JSONObject =
        JSONObject().put("latitude", latitude).put("longitude", longitude).put("capturedAt", capturedAt.toString())

    /** Ruta de la bitácora con solo los filtros llenos; la API busca sin acentos en origen, destino, municipio y tripulación. */
    fun logPath(filters: LogFilters): String {
        val params = buildList {
            if (filters.query.isNotBlank()) add("q=" + java.net.URLEncoder.encode(filters.query.trim(), "UTF-8"))
            if (filters.priority.isNotBlank()) add("priority=${filters.priority}")
            if (filters.finalState.isNotBlank()) add("finalState=${filters.finalState}")
            if (filters.type.isNotBlank()) add("type=${filters.type}")
        }
        return "/ambulancia/bitacora" + if (params.isEmpty()) "" else "?" + params.joinToString("&")
    }

    /** «La ambulancia salió de A hacia B — paciente con expediente ***042, con Ana y Luis, completado.» */
    fun narrate(entry: AmbulanceLogEntry): String {
        val moved = entry.milestones.any { it.type != "finalizado" }
        val where = if (entry.municipality.isNotBlank()) " (${entry.municipality})" else ""
        val patient = if (entry.patientRef.isNotBlank()) "paciente con expediente ${entry.patientRef}" else "sin paciente vinculado"
        val crew = if (entry.crew.isNotEmpty()) ", con ${entry.crew.joinToString(" y ")}" else ""
        val end = if (entry.administrativeClose) ", cierre administrativo" else entry.finalState?.let { ", ${AmbulanceLabels.finalState(it).lowercase()}" } ?: ", en curso"
        return "La ambulancia ${if (moved) "salió" else "fue despachada"} de ${entry.origin}$where hacia ${entry.destination} — $patient$crew$end."
    }

    /** Quién pidió: nombre del paciente o de quien llamó; si nadie lo dio, lo dice. */
    fun requesterLabel(row: AmbulanceRequestRow) = row.requesterName.ifBlank { row.callerName }.ifBlank { "Llamada sin identificar" }

    /** «Recién recibida», «Espera 12 min», «Espera 2 h 10 min». */
    fun waiting(minutes: Long): String = when {
        minutes < 1 -> "Recién recibida"
        minutes < 60 -> "Espera $minutes min"
        else -> "Espera ${minutes / 60} h" + if (minutes % 60 > 0) " ${minutes % 60} min" else ""
    }

    fun finishNeedsReason(service: AmbulanceService) = service.milestones.none { it.type == "en_hospital" }

    fun prehospitalError(form: PrehospitalForm): String? = when {
        form.reason.trim().length < 5 -> "Indica el motivo, de al menos 5 caracteres."
        form.priority !in AmbulanceLabels.priorities.map { it.first } -> "Elige la prioridad."
        form.etaMinutes.isNotBlank() && form.etaMinutes.toIntOrNull()?.let { it in 0..600 } != true -> "La hora estimada va en minutos, de 0 a 600."
        listOf(form.heartRate, form.systolic, form.diastolic, form.oxygenSaturation, form.glasgow).any { it.isNotBlank() && it.toIntOrNull() == null } -> "Los signos vitales van en números enteros."
        form.temperature.isNotBlank() && form.temperature.replace(',', '.').toDoubleOrNull() == null -> "La temperatura va en grados, por ejemplo 37.5."
        else -> signErrors(form).values.firstOrNull()
    }

    /**
     * D19/D119: ranges of `VitalSignsDto` in the API (`ambulance.dto.ts`), checked on the phone so each field says what is
     * wrong next to itself instead of the server answering with a technical field name. Keys are the form field names.
     */
    private val signRanges = linkedMapOf(
        "heartRate" to Triple(20.0, 250.0, "La frecuencia cardiaca va de 20 a 250 lpm."),
        "systolic" to Triple(40.0, 300.0, "La presión sistólica va de 40 a 300 mmHg."),
        "diastolic" to Triple(20.0, 200.0, "La presión diastólica va de 20 a 200 mmHg."),
        "oxygenSaturation" to Triple(50.0, 100.0, "La saturación de oxígeno va de 50 a 100 %."),
        "temperature" to Triple(30.0, 45.0, "La temperatura va de 30 a 45 °C."),
        "glasgow" to Triple(3.0, 15.0, "La escala de Glasgow va de 3 a 15."),
    )

    /** Out-of-range vital signs of [form], by field; blank fields are optional and never an error. */
    fun signErrors(form: PrehospitalForm): Map<String, String> {
        val values = mapOf(
            "heartRate" to form.heartRate, "systolic" to form.systolic, "diastolic" to form.diastolic,
            "oxygenSaturation" to form.oxygenSaturation, "temperature" to form.temperature, "glasgow" to form.glasgow,
        )
        return signRanges.mapNotNull { (field, range) ->
            val raw = values[field].orEmpty().trim()
            if (raw.isEmpty()) return@mapNotNull null
            val number = raw.replace(',', '.').toDoubleOrNull()
            if (number == null || number < range.first || number > range.second) field to range.third else null
        }.toMap()
    }

    /** D22: what the map searches: the address plus its municipality and country, unless the address already names them. */
    fun mapQuery(address: String, municipality: String): String {
        val parts = mutableListOf(address.trim())
        val town = municipality.trim()
        if (town.isNotEmpty() && !address.contains(town, ignoreCase = true)) parts += town
        if (!address.contains("El Salvador", ignoreCase = true)) parts += "El Salvador"
        return parts.filter { it.isNotEmpty() }.joinToString(", ")
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
                s.optJSONObject("lastLocation")?.let { AmbulanceLocation(it.optDouble("latitude"), it.optDouble("longitude"), it.text("capturedAt")) },
                strings(s.optJSONArray("finalStates")),
                s.optJSONArray("allowedActions")?.let(::strings),
                s.optJSONObject("patient")?.let { p -> ServicePatient(p.text("record"), p.text("fullName")) }?.takeIf { it.record.isNotBlank() },
                s.text("municipality"),
            )
        }
        val pending = objects(root.optJSONArray("pendingRequests")).map {
            AmbulanceRequestRow(it.text("id"), it.text("channel"), it.text("address"), it.text("municipality"), it.text("reason"), it.text("contactPhone"), it.text("createdAt"), it.optInt("version", 1), it.text("requesterName"), it.text("callerName"), it.text("patientRecord"))
        }
        val block = root.optJSONObject("dispatchBlock")?.let { DispatchBlock(it.text("code"), it.text("message"), it.text("action"), it.text("cause").ifBlank { null }) }
        val crew = objects(root.optJSONArray("availableCrew")).map { CrewCandidate(it.text("staffId"), it.text("role"), it.text("name"), it.optBoolean("hasAccount")) }
        return AmbulanceStatus(AmbulanceUnit(unit.text("id"), unit.text("plate"), unit.text("state"), unit.optInt("version", 1), unit.text("stateReason"), unit.text("stateSince")), service, root.optBoolean("paramedicOnDuty"), pending, block, root.optBoolean("driverOnDuty", true), crew)
    }

    fun log(value: Any?): List<AmbulanceLogEntry> = objects(value as? JSONArray).map {
        AmbulanceLogEntry(
            it.text("id"), it.text("type"), it.text("priority"), it.text("origin"), it.text("destination"), it.text("dispatchedAt"), it.text("finalState").ifBlank { null }, if (it.isNull("responseMinutes")) null else it.optInt("responseMinutes"),
            it.text("municipality"), objects(it.optJSONArray("crew")).map { c -> c.text("name") }, objects(it.optJSONArray("milestones")).map { m -> AmbulanceMilestone(m.text("type"), m.text("occurredAt")) }, it.text("patientRef"),
            it.optBoolean("administrativeClose"),
        )
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
        val handover = root.optJSONObject("handover")?.let { Handover(it.text("receivedAt"), it.text("receivedByName")) }
        return PrehospitalView(root.text("serviceId"), root.optBoolean("active"), root.optBoolean("clinical"), reports, root.optInt("version", 1), root.optBoolean("arrived"), handover, strings(root.optJSONArray("allowedActions")),
            objects(root.optJSONArray("blockedActions")).map { BlockedAction(it.text("action"), it.text("code"), it.text("reason")) },
            root.optBoolean("urgent"), root.optBoolean("urgentAccess"))
    }

    /** Arrived-but-unreceived services first, then the one on its way (the server's order). */
    fun arrivals(value: Any?): List<ArrivalCandidate> = objects((value as? JSONObject)?.optJSONArray("services")).map {
        ArrivalCandidate(it.text("serviceId"), it.text("dispatchedAt"), it.optBoolean("active"), it.optBoolean("arrived"), it.text("priority").ifBlank { null }, it.optBoolean("hasPrehospital"), it.optBoolean("urgent"), it.text("state").ifBlank { null })
    }.filter { it.serviceId.isNotBlank() }

    fun ownRequests(value: Any?): List<OwnAmbulanceRequest> = objects(value as? JSONArray).map {
        val service = it.optJSONObject("service")?.let { s -> OwnRequestService(s.text("dispatchedAt"), objects(s.optJSONArray("milestones")).map { m -> AmbulanceMilestone(m.text("type"), m.text("occurredAt")) }, s.text("finalState").ifBlank { null }) }
        OwnAmbulanceRequest(it.text("id"), it.text("state"), it.text("address"), it.text("reason"), it.text("createdAt"), it.optInt("version", 1), service, strings(it.optJSONArray("allowedActions")), it.text("notice"), it.text("discardReason").ifBlank { null })
    }
}

/** Eventos `ambulancia.*` (estado, solicitud, hito, prehospital, ubicación) en el canal `ambulancia`, de rol o del paciente. */
object AmbulanceEvents {
    /** La ubicación llega cada 10 s y no cambia lo que muestran estas pantallas. */
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "ambulancia") && event.type != "ambulancia.ubicacion"
    fun isPrehospital(event: EventoDominio) = event.type == "ambulancia.prehospital"
}

/**
 * Status tag of the unit header (obs 19): when the API says the unit cannot be dispatched, the tag reads «No se puede
 * despachar» instead of «Disponible», and the reason sits under it in the same card; never a second banner.
 */
object UnitStatusBadge {
    const val BLOCKED = "no_despachable"
    const val BLOCKED_LABEL = "No se puede despachar"
    const val NO_SERVICE = "Sin servicio activo"

    fun code(unitState: String, blocked: Boolean): String = if (blocked) BLOCKED else unitState

    fun label(unitState: String, blocked: Boolean, stateLabel: String): String = if (blocked) BLOCKED_LABEL else stateLabel

    /** Reason under the tag: the API message and its next step. A unit busy on a service waits for it to end, like the web. */
    fun reason(block: DispatchBlock): String =
        listOf(block.message, if (block.code == "en_servicio") "Despacha cuando la unidad termine ese servicio." else block.action)
            .filter { it.isNotBlank() }.joinToString(" ")
}
