package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/** Same families as the status colours of the web (`.status-*`) and the prototype; never colour alone (the label always travels with it). */
enum class DashboardTone { SUCCESS, PROCESS, RESERVED, WARNING, BLOCKED, DANGER, NEUTRAL }

enum class ChartKind { BARS, DONUT }

data class DashboardKpi(
    val label: String,
    val value: String,
    val tone: DashboardTone,
    val suffix: String? = null,
    val hint: String? = null,
    val target: AndroidSection? = null,
)

data class ChartSlice(val label: String, val value: Int, val tone: DashboardTone)

data class DashboardChart(val title: String, val kind: ChartKind, val slices: List<ChartSlice>) {
    val total: Int get() = slices.sumOf { it.value }
}

/** A "needs attention" item: what is pending and the one action that clears it. */
data class DashboardAttention(val title: String, val detail: String, val tone: DashboardTone, val actionLabel: String, val request: QuickActionRequest)

data class DashboardModel(
    val kpis: List<DashboardKpi>,
    val charts: List<DashboardChart>,
    val attention: List<DashboardAttention>,
    val actions: List<DashboardAction>,
    /** Sources that could not be read (403, network); their tiles are left out instead of showing a wrong zero. */
    val unavailable: Set<DashboardSource> = emptySet(),
)

/** Existing endpoints a dashboard reads. [anyOf] holds the permissions that allow the read (rule 8: by permission). */
enum class DashboardSource(val path: String, val anyOf: List<String>) {
    BEDS("/camas", listOf("camas.ver_tablero")),
    QUEUE("/fila", listOf("fila.ver")),
    LAB("/laboratorio/ordenes", listOf("laboratorio.ver_cola", "resultados.ver")),
    MY_LAB("/me/laboratorio", listOf("resultados.ver")),
    ADMISSIONS("/admisiones", listOf("admision.ver")),
    AMBULANCE("/ambulancia", listOf("ambulancia.ver_estado")),
    AGENDA("/consultas/agenda", listOf("consulta.iniciar")),
    APPOINTMENTS("/citas", listOf("citas.ver")),
    LINKS("/cuentas/vinculaciones", listOf("cuentas.verificar")),
    STOCK("/inventario/existencias", listOf("inventario.ver")),
    SHIFTS("/turnos/mios", listOf("turnos.ver")),
}

object RoleDashboard {
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")

    private val sourcesByRole: Map<String, List<DashboardSource>> = mapOf(
        "REC" to listOf(DashboardSource.BEDS, DashboardSource.QUEUE, DashboardSource.ADMISSIONS, DashboardSource.AMBULANCE, DashboardSource.LINKS, DashboardSource.APPOINTMENTS, DashboardSource.SHIFTS),
        "AST" to listOf(DashboardSource.QUEUE, DashboardSource.SHIFTS),
        "ENF" to listOf(DashboardSource.BEDS, DashboardSource.ADMISSIONS, DashboardSource.STOCK, DashboardSource.AMBULANCE, DashboardSource.SHIFTS),
        "MED" to listOf(DashboardSource.AGENDA, DashboardSource.LAB, DashboardSource.ADMISSIONS, DashboardSource.SHIFTS),
        "PAR" to listOf(DashboardSource.AMBULANCE, DashboardSource.SHIFTS),
        "PAC" to listOf(DashboardSource.QUEUE, DashboardSource.APPOINTMENTS, DashboardSource.MY_LAB),
    )

    /** What to read for [role]: only the sources the account may read. */
    fun sources(role: String, permissions: Collection<String>): List<DashboardSource> =
        sourcesByRole[role].orEmpty().filter { source -> source.anyOf.any { it in permissions } }

    fun builds(role: String) = role in sourcesByRole

    // --- parsing ---------------------------------------------------------------------------------------------------

    private fun rows(value: Any?): List<JSONObject> {
        val array = value as? JSONArray ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }

    private fun states(value: Any?, key: String = "state"): Map<String, Int> = rows(value).groupingBy { it.optString(key) }.eachCount()

    private fun text(row: JSONObject, key: String): String? = if (row.isNull(key)) null else row.optString(key).takeIf { it.isNotBlank() }

    private fun instant(value: String?): Instant? {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return null
        return runCatching { Instant.parse(raw) }.getOrNull() ?: runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull()
    }

    /** Lab stages shown to the people who act: requested, in process, completed but not released, released. */
    data class LabCounts(val requested: Int, val inProcess: Int, val toReview: Int, val released: Int, val urgent: Int, val critical: Int)

    fun labCounts(value: Any?): LabCounts {
        var requested = 0; var inProcess = 0; var toReview = 0; var released = 0; var urgent = 0; var critical = 0
        rows(value).forEach { order ->
            val state = order.optString("state")
            val reviewed = !order.isNull("reviewedAt")
            when {
                state == "pendiente" -> requested++
                state == "en_proceso" -> inProcess++
                state == "completado" && !reviewed -> toReview++
                state == "completado" -> released++
            }
            if (order.optString("priority") == "urgente" && (state == "pendiente" || state == "en_proceso")) urgent++
            val items = order.optJSONArray("items")
            if (state == "completado" && !reviewed && items != null) {
                val hasCritical = (0 until items.length()).any { items.optJSONObject(it)?.optJSONObject("result")?.optString("mark")?.startsWith("critico") == true }
                if (hasCritical) critical++
            }
        }
        return LabCounts(requested, inProcess, toReview, released, urgent, critical)
    }

    data class StockCounts(val belowMinimum: Int, val expired: Int)

    fun stockCounts(value: Any?, today: LocalDate): StockCounts {
        val list = rows(value)
        val low = list.count { it.optBoolean("bajo_minimo", false) }
        val expired = list.count { row -> text(row, "expiresAt")?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.isBefore(today) == true }
        return StockCounts(low, expired)
    }

    /** First published or running shift that has not ended, as the "next shift" line. */
    fun nextShift(value: Any?, now: Instant): String? {
        val next = rows(value)
            .filter { it.optString("state") in setOf("publicado", "en_curso") }
            .mapNotNull { row -> instant(text(row, "end"))?.takeIf { it.isAfter(now) }?.let { end -> Triple(instant(text(row, "start")) ?: end, row.optString("area"), row.optString("state")) } }
            .minByOrNull { it.first } ?: return null
        val area = next.second.ifBlank { "Turno" }
        return if (next.third == "en_curso") "$area · en curso" else "$area · ${MyShifts.formatInstant(next.first.toString())}"
    }

    fun nextAppointment(value: Any?, now: Instant): String? {
        val next = rows(value)
            .filter { it.optString("state") in setOf("solicitada", "confirmada") }
            .mapNotNull { row -> instant(text(row, "start"))?.takeIf { it.isAfter(now) }?.let { it to row.optString("doctorName") } }
            .minByOrNull { it.first } ?: return null
        return listOf(MyShifts.formatInstant(next.first.toString()), next.second.takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · ")
    }

    // --- model -----------------------------------------------------------------------------------------------------

    /**
     * Builds the dashboard of [role] from the answers of [DashboardSource] reads. A source missing from [data] (not read,
     * or failed) leaves its tiles out: the dashboard never shows an invented zero.
     */
    fun build(
        role: String,
        permissions: Collection<String>,
        data: Map<DashboardSource, Any?>,
        unavailable: Set<DashboardSource> = emptySet(),
        now: Instant = Instant.now(),
        linked: Boolean = true,
    ): DashboardModel {
        val sections = AndroidSections.visible(role, permissions)
        fun target(section: AndroidSection) = section.takeIf { it in sections }
        val kpis = mutableListOf<DashboardKpi>()
        val charts = mutableListOf<DashboardChart>()
        val attention = mutableListOf<DashboardAttention>()
        val today = now.atZone(zone).toLocalDate()

        val bedStates = data[DashboardSource.BEDS]?.let { states(it) }
        val queue = data[DashboardSource.QUEUE]?.let { states(it) }
        val admissions = data[DashboardSource.ADMISSIONS]?.let { states(it) }
        val lab = (data[DashboardSource.LAB] ?: data[DashboardSource.MY_LAB])?.let { labCounts(it) }
        val stock = data[DashboardSource.STOCK]?.let { stockCounts(it, today) }
        val ambulance = data[DashboardSource.AMBULANCE]?.let { AmbulanceParser.status(it) }
        val shift = data[DashboardSource.SHIFTS]?.let { nextShift(it, now) }
        val waiting = queue?.get("en_espera") ?: 0
        val pendingBed = admissions?.get("pendiente_cama") ?: 0
        val free = bedStates?.get("libre") ?: 0
        val cleaning = bedStates?.get("limpieza") ?: 0

        fun bedKpis(withCleaning: Boolean = true) {
            val states = bedStates ?: return
            val total = states.values.sum()
            kpis += DashboardKpi("Camas libres", free.toString(), if (free == 0 && total > 0) DashboardTone.DANGER else DashboardTone.SUCCESS, "de $total", target = target(AndroidSection.BEDS))
            if (withCleaning) kpis += DashboardKpi("En limpieza", cleaning.toString(), if (cleaning > 0) DashboardTone.WARNING else DashboardTone.NEUTRAL, target = target(AndroidSection.BEDS))
            charts += DashboardChart(
                "Ocupación de camas", ChartKind.DONUT,
                listOf(
                    ChartSlice("Libres", free, DashboardTone.SUCCESS),
                    ChartSlice("Ocupadas", states["ocupada"] ?: 0, DashboardTone.PROCESS),
                    ChartSlice("Reservadas", states["reservada"] ?: 0, DashboardTone.RESERVED),
                    ChartSlice("En limpieza", cleaning, DashboardTone.WARNING),
                    ChartSlice("Bloqueadas", states["bloqueada"] ?: 0, DashboardTone.BLOCKED),
                ),
            )
        }
        fun queueKpis() {
            val states = queue ?: return
            kpis += DashboardKpi("En espera", waiting.toString(), if (waiting > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.QUEUE) ?: target(AndroidSection.ASSISTANT_STATION) ?: target(AndroidSection.PATIENT_QUEUE))
            charts += DashboardChart(
                "Fila del día", ChartKind.BARS,
                listOf(
                    ChartSlice("En espera", waiting, DashboardTone.WARNING),
                    ChartSlice("Llamados", states["llamado"] ?: 0, DashboardTone.PROCESS),
                    ChartSlice("En atención", states["en_atencion"] ?: 0, DashboardTone.RESERVED),
                    ChartSlice("Atendidos", states["atendido"] ?: 0, DashboardTone.SUCCESS),
                    ChartSlice("No se presentó", states["no_se_presento"] ?: 0, DashboardTone.BLOCKED),
                ),
            )
        }
        fun labChart(title: String) {
            val counts = lab ?: return
            charts += DashboardChart(
                title, ChartKind.BARS,
                listOf(
                    ChartSlice("Solicitadas", counts.requested, DashboardTone.WARNING),
                    ChartSlice("En proceso", counts.inProcess, DashboardTone.PROCESS),
                    ChartSlice("Por revisar", counts.toReview, DashboardTone.RESERVED),
                    ChartSlice("Liberadas", counts.released, DashboardTone.SUCCESS),
                ),
            )
        }
        fun shiftKpi() { shift?.let { kpis += DashboardKpi("Mi próximo turno", it, DashboardTone.PROCESS, target = target(AndroidSection.SHIFTS)) } }
        fun assignBedAttention() {
            if (pendingBed > 0 && QuickActions.allowed(QuickAction.ASSIGN_BED, permissions) && AndroidSection.ADMISSION in sections) {
                attention += DashboardAttention("$pendingBed admisión(es) sin cama", "Asigna una cama sugerida para que el paciente pase a hospitalización.", DashboardTone.WARNING, "Asignar cama", QuickActionRequest(AndroidSection.ADMISSION, QuickAction.ASSIGN_BED))
            }
        }
        fun stockAttention(section: AndroidSection?) {
            val counts = stock ?: return
            if (counts.belowMinimum > 0 && section != null) attention += DashboardAttention("${counts.belowMinimum} artículo(s) bajo el mínimo", "Revisa las existencias antes de que falte material.", DashboardTone.WARNING, "Ver insumos", QuickActionRequest(section))
            if (counts.expired > 0 && section != null) attention += DashboardAttention("${counts.expired} lote(s) vencido(s)", "No los uses; retíralos según el protocolo.", DashboardTone.DANGER, "Ver insumos", QuickActionRequest(section))
        }

        when (role) {
            "REC" -> {
                queueKpis()
                val appointments = data[DashboardSource.APPOINTMENTS]?.let { states(it) }
                val requested = appointments?.get("solicitada") ?: 0
                appointments?.let { kpis += DashboardKpi("Citas por confirmar", requested.toString(), if (requested > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.APPOINTMENTS)) }
                val links = data[DashboardSource.LINKS]?.let { rows(it).size }
                links?.let { kpis += DashboardKpi("Vinculaciones por verificar", it.toString(), if (it > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.LINKING)) }
                if (admissions != null) kpis += DashboardKpi("Admisiones sin cama", pendingBed.toString(), if (pendingBed > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.ADMISSION))
                bedKpis(withCleaning = false)
                shiftKpi()
                if (waiting > 0 && QuickActions.allowed(QuickAction.ISSUE_NUMBER, permissions)) {
                    attention += DashboardAttention("$waiting número(s) esperando", "Revisa la fila del día.", DashboardTone.WARNING, "Abrir fila", QuickActionRequest(AndroidSection.QUEUE))
                }
                if (requested > 0 && AndroidSection.APPOINTMENTS in sections) attention += DashboardAttention("$requested solicitud(es) de cita", "Confirma o reprograma las citas que pidieron los pacientes.", DashboardTone.WARNING, "Abrir citas", QuickActionRequest(AndroidSection.APPOINTMENTS))
                if ((links ?: 0) > 0 && AndroidSection.LINKING in sections) attention += DashboardAttention("$links vinculación(es) por verificar", "Verifica la identidad antes de enlazar la cuenta con el expediente.", DashboardTone.WARNING, "Verificar", QuickActionRequest(AndroidSection.LINKING))
                assignBedAttention()
                ambulance?.pendingRequests?.size?.takeIf { it > 0 && QuickActions.allowed(QuickAction.DISPATCH, permissions) && AndroidSection.DISPATCH in sections }?.let {
                    attention += DashboardAttention("$it solicitud(es) de ambulancia", "Confirma y despacha la unidad si está disponible.", DashboardTone.DANGER, "Despachar", QuickActionRequest(AndroidSection.DISPATCH, QuickAction.DISPATCH))
                }
            }
            "AST" -> {
                queueKpis()
                queue?.let {
                    kpis += DashboardKpi("En atención", ((it["llamado"] ?: 0) + (it["en_atencion"] ?: 0)).toString(), DashboardTone.PROCESS, target = target(AndroidSection.ASSISTANT_STATION))
                    kpis += DashboardKpi("Atendidos hoy", (it["atendido"] ?: 0).toString(), DashboardTone.SUCCESS)
                }
                shiftKpi()
                if (waiting > 0 && QuickActions.allowed(QuickAction.CALL_NEXT, permissions) && AndroidSection.ASSISTANT_STATION in sections) {
                    attention += DashboardAttention("$waiting número(s) esperando", "Llama al siguiente número de tu consultorio.", DashboardTone.WARNING, "Llamar siguiente", QuickActionRequest(AndroidSection.ASSISTANT_STATION, QuickAction.CALL_NEXT))
                }
            }
            "ENF" -> {
                admissions?.let { kpis += DashboardKpi("Hospitalizados", (it["hospitalizado"] ?: 0).toString(), DashboardTone.PROCESS, target = target(AndroidSection.WARD)) }
                if (admissions != null) kpis += DashboardKpi("Admisiones sin cama", pendingBed.toString(), if (pendingBed > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.WARD))
                bedKpis()
                stock?.let { kpis += DashboardKpi("Insumos bajo mínimo", it.belowMinimum.toString(), if (it.belowMinimum > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.SUPPLIES)) }
                shiftKpi()
                if (cleaning > 0) attention += DashboardAttention("$cleaning cama(s) en limpieza", "Cuando estén listas vuelven a quedar libres para admisión.", DashboardTone.WARNING, "Ver mi planta", QuickActionRequest(AndroidSection.WARD))
                stockAttention(target(AndroidSection.SUPPLIES))
                ambulance?.activeService?.takeIf { it.hasPrehospital && AndroidSection.AMBULANCE_RECEPTION in sections }?.let {
                    attention += DashboardAttention("Ambulancia en camino", "Hay un reporte prehospital: prepara la recepción.", DashboardTone.DANGER, "Recepción", QuickActionRequest(AndroidSection.AMBULANCE_RECEPTION))
                }
            }
            "MED" -> {
                data[DashboardSource.AGENDA]?.let { agenda ->
                    val list = rows(agenda)
                    val started = list.count { text(it, "consultationId") != null }
                    kpis += DashboardKpi("Citas en mi agenda", list.size.toString(), DashboardTone.PROCESS, target = target(AndroidSection.MEDICAL_DAY))
                    kpis += DashboardKpi("Consultas iniciadas", started.toString(), DashboardTone.SUCCESS, "de ${list.size}", target = target(AndroidSection.MEDICAL_DAY))
                }
                lab?.let {
                    kpis += DashboardKpi("Resultados por revisar", it.toReview.toString(), if (it.critical > 0) DashboardTone.DANGER else if (it.toReview > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.RESULT_REVIEW))
                }
                admissions?.let { kpis += DashboardKpi("Hospitalizados", (it["hospitalizado"] ?: 0).toString(), DashboardTone.PROCESS, target = target(AndroidSection.HOSPITALIZED)) }
                shiftKpi()
                labChart("Mis exámenes por etapa")
                lab?.takeIf { it.critical > 0 && AndroidSection.RESULT_REVIEW in sections }?.let {
                    attention += DashboardAttention("${it.critical} resultado(s) con valor crítico", "Revísalos primero: el paciente solo los ve después de tu revisión.", DashboardTone.DANGER, "Revisar", QuickActionRequest(AndroidSection.RESULT_REVIEW))
                }
                lab?.takeIf { it.toReview - it.critical > 0 && AndroidSection.RESULT_REVIEW in sections }?.let {
                    attention += DashboardAttention("${it.toReview - it.critical} resultado(s) por revisar", "Al revisar, el resultado queda visible para el paciente.", DashboardTone.WARNING, "Revisar", QuickActionRequest(AndroidSection.RESULT_REVIEW))
                }
            }
            "PAR" -> {
                ambulance?.let {
                    kpis += DashboardKpi("Unidad ${it.unit.plate}".trim(), unitLabel(it.unit.state), unitTone(it.unit.state), target = target(AndroidSection.SERVICE))
                    kpis += DashboardKpi("Solicitudes pendientes", it.pendingRequests.size.toString(), if (it.pendingRequests.isNotEmpty()) DashboardTone.WARNING else DashboardTone.SUCCESS)
                    kpis += DashboardKpi("Servicio", if (it.activeService != null) "En curso" else "Sin servicio", if (it.activeService != null) DashboardTone.DANGER else DashboardTone.NEUTRAL, target = target(AndroidSection.SERVICE))
                    it.activeService?.takeIf { AndroidSection.SERVICE in sections }?.let { service ->
                        attention += DashboardAttention("Servicio en curso", "${service.origin} → ${service.destination}", DashboardTone.DANGER, "Registrar hito", QuickActionRequest(AndroidSection.SERVICE))
                    }
                }
                shiftKpi()
            }
            "PAC" -> {
                data[DashboardSource.APPOINTMENTS]?.let { nextAppointment(it, now) }?.let { kpis += DashboardKpi("Próxima cita", it, DashboardTone.PROCESS, target = target(AndroidSection.MY_APPOINTMENTS)) }
                if (data[DashboardSource.APPOINTMENTS] != null && nextAppointment(data[DashboardSource.APPOINTMENTS], now) == null) kpis += DashboardKpi("Próxima cita", "Sin citas", DashboardTone.NEUTRAL, target = target(AndroidSection.MY_APPOINTMENTS))
                data[DashboardSource.QUEUE]?.let { queueRows ->
                    val mine = rows(queueRows).firstOrNull { it.optString("state") in setOf("en_espera", "llamado", "en_atencion") }
                    kpis += if (mine == null) DashboardKpi("Mi turno en fila", "Sin número", DashboardTone.NEUTRAL, target = target(AndroidSection.PATIENT_QUEUE))
                    else DashboardKpi("Mi turno en fila", "N.º ${mine.optInt("numero")}", if (mine.optString("state") == "llamado") DashboardTone.DANGER else DashboardTone.PROCESS, hint = QueueLabels.state(mine.optString("state")), target = target(AndroidSection.PATIENT_QUEUE))
                    if (mine?.optString("state") == "llamado") attention += DashboardAttention("Es tu turno", "Pasa al consultorio indicado.", DashboardTone.DANGER, "Ver mi turno", QuickActionRequest(AndroidSection.PATIENT_QUEUE))
                }
                lab?.let {
                    kpis += DashboardKpi("Exámenes listos", it.released.toString(), if (it.released > 0) DashboardTone.SUCCESS else DashboardTone.NEUTRAL, target = target(AndroidSection.RESULTS))
                    kpis += DashboardKpi("Exámenes en trámite", (it.requested + it.inProcess + it.toReview).toString(), DashboardTone.PROCESS, target = target(AndroidSection.RESULTS))
                    if (it.released > 0 && AndroidSection.RESULTS in sections) attention += DashboardAttention("${it.released} examen(es) con resultado", "Tu médico ya los revisó; puedes verlos.", DashboardTone.SUCCESS, "Ver resultados", QuickActionRequest(AndroidSection.RESULTS))
                }
                labChart("Mis exámenes")
                if (!linked && AndroidSection.LINK_RECORD in sections) attention += DashboardAttention("Vincula tu expediente", "Sin vincular no verás tus citas, turno ni resultados.", DashboardTone.WARNING, "Vincular", QuickActionRequest(AndroidSection.LINK_RECORD))
            }
        }
        return DashboardModel(kpis, charts.filter { it.total > 0 }, attention, QuickActions.forRole(role, permissions), unavailable)
    }

    fun unitLabel(state: String) = mapOf("disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento")[state] ?: state

    fun unitTone(state: String) = when (state) {
        "disponible" -> DashboardTone.SUCCESS
        "en_servicio" -> DashboardTone.DANGER
        "en_mantenimiento" -> DashboardTone.BLOCKED
        else -> DashboardTone.NEUTRAL
    }
}

/** Realtime events that change something a dashboard shows; the dashboard then reads its sources again (no polling). */
object DashboardEvents {
    private val entities = arrayOf(
        "cama", "espacio", "ticket_fila", "fila", "orden_laboratorio", "laboratorio", "admision", "alta", "cita", "consulta",
        "articulo", "inventario", "ambulancia", "servicio_ambulancia", "solicitud_ambulancia", "turno", "vinculacion",
    )

    fun matches(event: EventoDominio) = LiveEntities.matches(event, *entities)
}
