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
    /** Verb the target section opens when the tile is tapped (for example the requests filter). */
    val action: QuickAction? = null,
)

data class ChartSlice(val label: String, val value: Int, val tone: DashboardTone)

data class DashboardChart(val title: String, val kind: ChartKind, val slices: List<ChartSlice>) {
    val total: Int get() = slices.sumOf { it.value }
}

/**
 * A "needs attention" item: what is pending and the one action that clears it. [covers] names the KPI tile that shows the
 * same count; the tile is dropped so Inicio never says the same number twice (R3 A-28).
 */
data class DashboardAttention(
    val title: String,
    val detail: String,
    val tone: DashboardTone,
    val actionLabel: String,
    val request: QuickActionRequest,
    val covers: String? = null,
)

/** "1 número esperando" / "3 números esperando": Spanish count without "número(s)" (R3 A-48). */
internal fun counted(n: Int, singular: String, plural: String) = "$n ${if (n == 1) singular else plural}"

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
        /** When the patient last opened their results (device marker until G-7); later releases only count as new. */
        resultsSeenAt: Instant? = null,
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
            kpis += DashboardKpi("Camas libres", free.toString(), if (free == 0 && total > 0) DashboardTone.WARNING else DashboardTone.NEUTRAL, "de $total", target = target(AndroidSection.BEDS))
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
                attention += DashboardAttention(counted(pendingBed, "admisión sin cama", "admisiones sin cama"), "Asigna una cama sugerida para que el paciente pase a hospitalización.", DashboardTone.WARNING, "Asignar cama", QuickActionRequest(AndroidSection.ADMISSION, QuickAction.ASSIGN_BED), covers = "Admisiones sin cama")
            }
        }
        fun stockAttention(section: AndroidSection?) {
            val counts = stock ?: return
            if (counts.belowMinimum > 0 && section != null) attention += DashboardAttention(counted(counts.belowMinimum, "artículo bajo el mínimo", "artículos bajo el mínimo"), "Revisa las existencias antes de que falte material.", DashboardTone.WARNING, "Ver insumos", QuickActionRequest(section), covers = "Insumos bajo mínimo")
            if (counts.expired > 0 && section != null) attention += DashboardAttention(counted(counts.expired, "lote vencido", "lotes vencidos"), "No los uses; retíralos según el protocolo.", DashboardTone.WARNING, "Ver insumos", QuickActionRequest(section))
        }

        when (role) {
            "REC" -> {
                queueKpis()
                // Only requests still ahead in time: a past one is "vencida" (the server marks it) and nobody can confirm it.
                val appointments = data[DashboardSource.APPOINTMENTS]?.let { rows(it) }
                val requested = appointments?.count { it.optString("state") == "solicitada" && instant(text(it, "start"))?.isAfter(now) == true } ?: 0
                val requestsAction = QuickAction.REVIEW_REQUESTS.takeIf { QuickActions.allowed(it, permissions) }
                appointments?.let { kpis += DashboardKpi("Citas por confirmar", requested.toString(), if (requested > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.APPOINTMENTS), action = requestsAction) }
                val links = data[DashboardSource.LINKS]?.let { rows(it).size }
                links?.let { kpis += DashboardKpi("Vinculaciones por verificar", it.toString(), if (it > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.LINKING)) }
                if (admissions != null) kpis += DashboardKpi("Admisiones sin cama", pendingBed.toString(), if (pendingBed > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.ADMISSION))
                bedKpis(withCleaning = false)
                shiftKpi()
                if (waiting > 0 && QuickActions.allowed(QuickAction.ISSUE_NUMBER, permissions)) {
                    attention += DashboardAttention(counted(waiting, "número esperando", "números esperando"), "Revisa la fila del día.", DashboardTone.WARNING, "Abrir fila", QuickActionRequest(AndroidSection.QUEUE), covers = "En espera")
                }
                if (requested > 0 && AndroidSection.APPOINTMENTS in sections) attention += DashboardAttention(counted(requested, "solicitud de cita", "solicitudes de cita"), "Confirma, rechaza o reprograma las solicitudes de los pacientes.", DashboardTone.WARNING, "Abrir citas", QuickActionRequest(AndroidSection.APPOINTMENTS, requestsAction), covers = "Citas por confirmar")
                if ((links ?: 0) > 0 && AndroidSection.LINKING in sections) attention += DashboardAttention(counted(links ?: 0, "vinculación por verificar", "vinculaciones por verificar"), "Verifica la identidad antes de enlazar la cuenta con el expediente.", DashboardTone.WARNING, "Verificar", QuickActionRequest(AndroidSection.LINKING), covers = "Vinculaciones por verificar")
                assignBedAttention()
                ambulance?.pendingRequests?.size?.takeIf { it > 0 && QuickActions.allowed(QuickAction.DISPATCH, permissions) && AndroidSection.DISPATCH in sections }?.let {
                    attention += DashboardAttention(counted(it, "solicitud de ambulancia", "solicitudes de ambulancia"), "Confirma y despacha la unidad si está disponible.", DashboardTone.WARNING, "Despachar", QuickActionRequest(AndroidSection.DISPATCH, QuickAction.DISPATCH))
                }
            }
            "AST" -> {
                queueKpis()
                queue?.let {
                    kpis += DashboardKpi("Llamados o en atención", ((it["llamado"] ?: 0) + (it["en_atencion"] ?: 0)).toString(), DashboardTone.PROCESS, target = target(AndroidSection.ASSISTANT_STATION))
                    kpis += DashboardKpi("Atendidos hoy", (it["atendido"] ?: 0).toString(), DashboardTone.SUCCESS)
                }
                shiftKpi()
                if (waiting > 0 && QuickActions.allowed(QuickAction.CALL_NEXT, permissions) && AndroidSection.ASSISTANT_STATION in sections) {
                    attention += DashboardAttention(counted(waiting, "número esperando", "números esperando"), "Llama al siguiente número de tu consultorio.", DashboardTone.WARNING, "Llamar siguiente", QuickActionRequest(AndroidSection.ASSISTANT_STATION, QuickAction.CALL_NEXT), covers = "En espera")
                }
            }
            "ENF" -> {
                admissions?.let { kpis += DashboardKpi("Hospitalizados", (it["hospitalizado"] ?: 0).toString(), DashboardTone.PROCESS, target = target(AndroidSection.WARD)) }
                if (admissions != null) kpis += DashboardKpi("Admisiones sin cama", pendingBed.toString(), if (pendingBed > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.WARD))
                bedKpis()
                stock?.let { kpis += DashboardKpi("Insumos bajo mínimo", it.belowMinimum.toString(), if (it.belowMinimum > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = target(AndroidSection.SUPPLIES)) }
                shiftKpi()
                if (cleaning > 0) attention += DashboardAttention(counted(cleaning, "cama en limpieza", "camas en limpieza"), "Cuando estén listas vuelven a quedar libres para admisión.", DashboardTone.WARNING, "Ver mi planta", QuickActionRequest(AndroidSection.WARD), covers = "En limpieza")
                stockAttention(target(AndroidSection.SUPPLIES))
                ambulance?.activeService?.takeIf { it.hasPrehospital && AndroidSection.AMBULANCE_RECEPTION in sections }?.let {
                    attention += DashboardAttention("Ambulancia en camino", "Hay un reporte prehospital: prepara la recepción.", DashboardTone.WARNING, "Recepción", QuickActionRequest(AndroidSection.AMBULANCE_RECEPTION))
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
                    attention += DashboardAttention(counted(it.critical, "resultado con valor crítico", "resultados con valor crítico"), "Revísalos primero: el paciente solo los ve después de tu revisión.", DashboardTone.DANGER, "Revisar", QuickActionRequest(AndroidSection.RESULT_REVIEW), covers = "Resultados por revisar")
                }
                lab?.takeIf { it.toReview - it.critical > 0 && AndroidSection.RESULT_REVIEW in sections }?.let {
                    attention += DashboardAttention(counted(it.toReview - it.critical, "resultado por revisar", "resultados por revisar"), "Al revisar, el resultado queda visible para el paciente.", DashboardTone.WARNING, "Revisar", QuickActionRequest(AndroidSection.RESULT_REVIEW), covers = "Resultados por revisar")
                }
            }
            "PAR" -> {
                ambulance?.let {
                    kpis += DashboardKpi("Unidad ${it.unit.plate}".trim(), unitLabel(it.unit.state), unitTone(it.unit.state), target = target(AndroidSection.SERVICE))
                    kpis += DashboardKpi("Solicitudes pendientes", it.pendingRequests.size.toString(), if (it.pendingRequests.isNotEmpty()) DashboardTone.WARNING else DashboardTone.SUCCESS)
                    kpis += DashboardKpi("Servicio", if (it.activeService != null) "En curso" else "Sin servicio", if (it.activeService != null) DashboardTone.PROCESS else DashboardTone.NEUTRAL, target = target(AndroidSection.SERVICE))
                    it.activeService?.takeIf { AndroidSection.SERVICE in sections }?.let { service ->
                        attention += DashboardAttention("Servicio en curso", "${service.origin} → ${service.destination}", DashboardTone.PROCESS, "Registrar hito", QuickActionRequest(AndroidSection.SERVICE), covers = "Servicio")
                    }
                }
                shiftKpi()
            }
            "PAC" -> {
                // G6: the patient's Inicio reads top-down: link first when unlinked, today's number or appointment, the next
                // appointment (or "Pedir cita"), then new results. Every row carries its one action.
                if (!linked && AndroidSection.LINK_RECORD in sections) attention += DashboardAttention("Vincula tu expediente", "Sin vincular no verás tus citas, turno ni resultados.", DashboardTone.WARNING, "Vincular", QuickActionRequest(AndroidSection.LINK_RECORD))
                val appointments = data[DashboardSource.APPOINTMENTS]
                data[DashboardSource.QUEUE]?.let { queueRows ->
                    val mine = rows(queueRows).firstOrNull { it.optString("state") in setOf("en_espera", "llamado", "en_atencion") }
                    kpis += if (mine == null) DashboardKpi("Mi turno en fila", "Sin número", DashboardTone.NEUTRAL, target = target(AndroidSection.PATIENT_QUEUE))
                    else DashboardKpi("Mi turno en fila", "N.º ${mine.optInt("numero")}", if (mine.optString("state") == "llamado") DashboardTone.SUCCESS else DashboardTone.PROCESS, hint = QueueLabels.state(mine.optString("state")), target = target(AndroidSection.PATIENT_QUEUE))
                    // G2: being called is good news, never red. B5: name the office only when the ticket carries it.
                    if (mine?.optString("state") == "llamado") {
                        val office = mine.optString("officeCode").takeIf { !mine.isNull("officeCode") && it.isNotBlank() }
                        attention += DashboardAttention("Es tu turno", office?.let { "Pasa al consultorio $it." } ?: "Atento al llamado en recepción.", DashboardTone.SUCCESS, "Ver mi turno", QuickActionRequest(AndroidSection.PATIENT_QUEUE))
                    } else if (mine != null) {
                        val code = "${text(mine, "area") ?: QueueLabels.areaOf(mine.optString("service"))} ${mine.optInt("numero")}"
                        attention += DashboardAttention("Tu número $code", "${QueueLabels.state(mine.optString("state"))} · Te llamarán en pantalla y aquí.", DashboardTone.PROCESS, "Ver mi turno", QuickActionRequest(AndroidSection.PATIENT_QUEUE), covers = "Mi turno en fila")
                    }
                }
                todayAppointment(appointments, now)?.let { today -> attention += DashboardAttention("Hoy tienes cita", today, DashboardTone.PROCESS, "Ver cita", QuickActionRequest(AndroidSection.MY_APPOINTMENTS), covers = "Próxima cita") }
                val next = appointments?.let { nextAppointment(it, now) }
                if (next != null) kpis += DashboardKpi("Próxima cita", next, DashboardTone.PROCESS, target = target(AndroidSection.MY_APPOINTMENTS))
                else if (appointments != null) {
                    if ("citas.solicitar" in permissions && AndroidSection.MY_APPOINTMENTS in sections) attention += DashboardAttention("No tienes citas próximas", "Pide una por motivo; recepción te asigna médico y hora.", DashboardTone.PROCESS, "Pedir cita", QuickActionRequest(AndroidSection.MY_APPOINTMENTS, QuickAction.REQUEST_APPOINTMENT), covers = "Próxima cita")
                    else kpis += DashboardKpi("Próxima cita", "Sin citas", DashboardTone.NEUTRAL, target = target(AndroidSection.MY_APPOINTMENTS))
                }
                lab?.let {
                    kpis += DashboardKpi("Exámenes en trámite", (it.requested + it.inProcess + it.toReview).toString(), DashboardTone.PROCESS, target = target(AndroidSection.RESULTS))
                    // G6: "Resultados nuevos" counts only those released in the last 7 days, not the whole history (gap G-7: no "seen").
                    val recent = recentResults(data[DashboardSource.MY_LAB], now, resultsSeenAt)
                    if (recent > 0 && AndroidSection.RESULTS in sections) attention += DashboardAttention("Resultados nuevos ($recent)", "Tu médico ya los revisó; puedes verlos.", DashboardTone.SUCCESS, "Ver resultados", QuickActionRequest(AndroidSection.RESULTS))
                }
                labChart("Mis exámenes")
            }
        }
        val covered = attention.mapNotNull { it.covers }.toSet()
        return DashboardModel(kpis.filter { it.label !in covered }, charts.filter { it.total > 0 }, attention, QuickActions.forRole(role, permissions), unavailable)
    }

    /** G6: today's appointment of the patient ("09:20 · Dra. Ejemplo"), confirmed or requested and not yet over. */
    fun todayAppointment(value: Any?, now: Instant): String? {
        val today = now.atZone(zone).toLocalDate()
        val row = rows(value).filter { it.optString("state") in setOf("solicitada", "confirmada") }
            .mapNotNull { r -> instant(text(r, "start"))?.let { it to r } }
            .filter { (start, _) -> start.atZone(zone).toLocalDate() == today && start.isAfter(now.minusSeconds(3_600)) }
            .minByOrNull { it.first } ?: return null
        val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm").format(row.first.atZone(zone))
        return listOfNotNull(time, text(row.second, "doctorName")).joinToString(" · ")
    }

    /** G6: results released (reviewed) in the last 7 days. */
    fun recentResults(value: Any?, now: Instant, seenAt: Instant? = null): Int {
        val since = listOfNotNull(now.minus(java.time.Duration.ofDays(7)), seenAt).max()
        return rows(value).count { order -> order.optString("state") == "completado" && instant(text(order, "reviewedAt"))?.isAfter(since) == true }
    }

    fun unitLabel(state: String) = mapOf("disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento")[state] ?: state

    fun unitTone(state: String) = when (state) {
        "disponible" -> DashboardTone.SUCCESS
        "en_servicio" -> DashboardTone.PROCESS
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
