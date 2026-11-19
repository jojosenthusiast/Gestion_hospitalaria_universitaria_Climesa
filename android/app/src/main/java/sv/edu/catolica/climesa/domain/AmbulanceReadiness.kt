package sv.edu.catolica.climesa.domain

/**
 * Lote 5 S8: the unit card as every role reads it (Recepción dispatch, Médico unit, Enfermería reception, Paramédico).
 * Pure rules, so the screens only draw what these return.
 */
object AmbulanceReadiness {
    /** Look of one readiness line: [OK] ready, [MISSING] something the dispatch needs is not there, [BUSY] taken by a service. */
    enum class State { OK, MISSING, BUSY }

    data class Item(val key: String, val text: String, val state: State)

    /** Tone of the dispatch blocker: [WARNING] waits for something that ends by itself (the service), [DANGER] needs someone to act. */
    enum class Tone { WARNING, DANGER }

    data class Blocker(val title: String, val reason: String, val tone: Tone)

    const val BLOCKED_TITLE = UnitStatusBadge.BLOCKED_LABEL
    const val NO_SERVICE = UnitStatusBadge.NO_SERVICE
    const val SERVICE_RUNNING = "Servicio en curso"
    const val MAINTENANCE = "Unidad en mantenimiento"
    const val PARAMEDIC_OK = "Paramédico con turno en curso"
    const val PARAMEDIC_MISSING = "Sin paramédico con turno en curso"
    const val DRIVER_OK = "Motorista con turno en curso"
    const val DRIVER_MISSING = "Sin motorista con turno en curso"

    /**
     * "Sin servicio activo" is said only when the API says so: no `activeService` and a unit that is not `en_servicio`.
     * A unit marked in service without its detail (an older API or a read without that field) reads "Servicio en curso".
     */
    fun noActiveService(status: AmbulanceStatus): Boolean = status.activeService == null && status.unit.state != "en_servicio"

    /** Service, maintenance and crew as a checklist, in the order a dispatcher reads them. */
    fun checklist(status: AmbulanceStatus): List<Item> = buildList {
        val service = status.activeService
        add(
            when {
                service != null -> Item("service", "$SERVICE_RUNNING: ${AmbulanceLabels.type(service.type).lowercase()}", State.BUSY)
                !noActiveService(status) -> Item("service", SERVICE_RUNNING, State.BUSY)
                else -> Item("service", NO_SERVICE, State.OK)
            },
        )
        if (status.unit.state == "en_mantenimiento") add(Item("maintenance", MAINTENANCE, State.MISSING))
        add(if (status.paramedicOnDuty) Item("paramedic", PARAMEDIC_OK, State.OK) else Item("paramedic", PARAMEDIC_MISSING, State.MISSING))
        add(if (status.driverOnDuty) Item("driver", DRIVER_OK, State.OK) else Item("driver", DRIVER_MISSING, State.MISSING))
    }

    /**
     * Why the unit cannot be dispatched, as the API computed it (RN-29, RN-30), or null when it can. [withAction] adds the
     * next step (only who dispatches can take it, like the web `blockAction`). A blank API message falls back to the code.
     */
    fun blocker(status: AmbulanceStatus, withAction: Boolean = true): Blocker? {
        val block = status.dispatchBlock ?: return null
        val message = block.message.ifBlank { fallback(block.code) }
        val next = when {
            !withAction -> ""
            block.code == "en_servicio" -> "Despacha cuando la unidad termine ese servicio."
            else -> block.action
        }
        val reason = listOf(message, next).filter { it.isNotBlank() }.joinToString(" ")
        return Blocker(BLOCKED_TITLE, reason, if (block.code == "en_servicio") Tone.WARNING else Tone.DANGER)
    }

    private fun fallback(code: String) = when (code) {
        "en_servicio" -> "La unidad está atendiendo un servicio."
        "en_mantenimiento" -> "La unidad está en mantenimiento."
        "sin_paramedico_de_turno" -> "No hay paramédico con turno en curso."
        "sin_motorista_de_turno" -> "No hay motorista con turno en curso."
        "sin_tripulacion_de_turno" -> "No hay paramédico ni motorista con turno en curso."
        else -> "La unidad no está disponible."
    }
}

/**
 * Lote 5 S8: the bitácora of one service as the visible progress, the same for every role. Each step has its time, who
 * records it and whether it is done; the next step to record is [Step.current].
 */
object AmbulanceTimeline {
    const val DISPATCHED = "despacho"
    const val DISPATCH_AUTHOR = "Despacho"
    const val CREW_AUTHOR = "Paramédico"
    private val order = listOf("salida", "en_escena", "trasladando", "en_hospital", "finalizado")

    data class Step(val code: String, val label: String, val author: String, val at: String?, val done: Boolean, val current: Boolean = false)

    /**
     * Dispatch first, then the recorded milestones by time (a tie keeps the route order), then, while the service is open and
     * [withPending] is true, the steps still to come. An early finish shows its final state ("Finalizado: sin traslado").
     */
    fun of(dispatchedAt: String, milestones: List<AmbulanceMilestone>, finalState: String? = null, withPending: Boolean = true): List<Step> {
        val recorded = milestones.sortedWith(compareBy<AmbulanceMilestone>({ instant(it.occurredAt) }, { order.indexOf(it.type).let { i -> if (i < 0) order.size else i } }))
        val done = recorded.map { it.type }.toSet()
        val steps = mutableListOf(Step(DISPATCHED, "Despachado", DISPATCH_AUTHOR, dispatchedAt.ifBlank { null }, done = true))
        recorded.forEach { m -> steps += Step(m.type, label(m.type, finalState), CREW_AUTHOR, m.occurredAt, done = true) }
        if (withPending && "finalizado" !in done) {
            val last = recorded.maxOfOrNull { order.indexOf(it.type) } ?: -1
            order.drop(last + 1).forEachIndexed { i, code -> steps += Step(code, AmbulanceLabels.milestone(code), CREW_AUTHOR, null, done = false, current = i == 0) }
        }
        return steps
    }

    fun of(service: AmbulanceService, withPending: Boolean = true) = of(service.dispatchedAt, service.milestones, null, withPending)

    fun of(entry: AmbulanceLogEntry) = of(entry.dispatchedAt, entry.milestones, entry.finalState, withPending = entry.finalState == null && !entry.administrativeClose)

    private fun label(code: String, finalState: String?) =
        if (code == "finalizado" && finalState != null && finalState != "completado") "Finalizado: ${AmbulanceLabels.finalState(finalState).lowercase()}"
        else AmbulanceLabels.milestone(code)

    private fun instant(iso: String): Long = runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrDefault(Long.MAX_VALUE)
}

/** Lote 5 S3: prehospital signs in full words for the receiving staff (no "lpm", "FC" or "temp"). */
object AmbulanceSigns {
    fun inFull(values: Map<String, String>): List<Pair<String, String>> = buildList {
        val v = values.filterValues { it.isNotBlank() && it != "null" }
        val sys = v["systolic"]; val dia = v["diastolic"]
        if (sys != null || dia != null) add("Presión arterial" to "${sys ?: "?"}/${dia ?: "?"} mmHg")
        v["heartRate"]?.let { add("Frecuencia cardiaca" to "$it latidos por minuto") }
        v["oxygenSaturation"]?.let { add("Saturación de oxígeno" to "$it %") }
        v["respiratoryRate"]?.let { add("Frecuencia respiratoria" to "$it respiraciones por minuto") }
        v["temperature"]?.let { add("Temperatura" to "$it °C") }
        v["glasgow"]?.let { add("Escala de Glasgow" to "$it de 15") }
        val known = setOf("systolic", "diastolic", "heartRate", "oxygenSaturation", "respiratoryRate", "temperature", "glasgow")
        v.filterKeys { it !in known }.forEach { (code, value) -> add(AmbulanceLabels.sign(code) to value) }
    }
}

/** Lote 5 S3: per-field errors of the ambulance forms, shown under each field instead of one banner. Keys are field ids. */
object AmbulanceForms {
    const val REASON = "reason"
    const val ADDRESS = "address"
    const val PHONE = "phone"
    const val DESTINATION = "destination"
    private val phone = Regex("^[0-9+ -]{8,20}$")

    /** Same rules as [AmbulanceRules.requestError], field by field and in screen order (reason, address, phone). */
    fun requestErrors(address: String, reason: String, contactPhone: String): Map<String, String> = buildMap {
        if (reason.trim().length < AmbulanceRules.REASON_MIN) put(REASON, "Indica el motivo, de al menos 5 caracteres.")
        if (address.trim().length < 5) put(ADDRESS, "Indica la dirección, de al menos 5 caracteres.")
        if (!phone.matches(contactPhone.trim())) put(PHONE, "Indica un teléfono de contacto de 8 a 20 dígitos.")
    }

    /** Discard and finish reasons: at least 5 characters, like the API. */
    fun reasonError(reason: String): String? = if (reason.trim().length < 5) "Indica el motivo, de al menos 5 caracteres." else null

    fun destinationError(destination: String): String? = if (destination.trim().length < 3) "Indica el destino." else null
}
