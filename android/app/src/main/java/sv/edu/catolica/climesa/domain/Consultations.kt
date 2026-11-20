package sv.edu.catolica.climesa.domain

data class MedicalAppointment(
    val appointmentId: String,
    val patientId: String,
    val patientName: String,
    val start: String,
    val end: String,
    val appointmentState: String,
    val reason: String?,
    val consultationId: String?,
    val consultationState: String?,
    val consultationReason: String?,
    val physicalExam: String?,
    val plan: String?,
    val version: Int,
    /** Queue number when the consultation was started from the queue instead of an appointment. */
    val ticketNumber: Int? = null,
    /** `allowedActions` / `blockedActions` of the agenda entry: `iniciar_consulta` only on the appointment's day. */
    val allowedActions: List<AppointmentAction> = emptyList(),
    val blockedActions: Map<AppointmentAction, String> = emptyMap(),
    /** Categories of the request by reason the appointment came from; empty when booked directly or opened from the queue. */
    val categories: List<CategoryRef> = emptyList(),
) {
    /** A new consultation can be started from this appointment only when the API offers it. */
    val canStart: Boolean get() = consultationId == null && AppointmentAction.START_CONSULTATION in allowedActions
    val startBlockedReason: String? get() = blockedActions[AppointmentAction.START_CONSULTATION]

    /** Stable key of the row/dialog: the appointment, or `consulta:<id>:<number>` for a consultation opened by id. */
    val key: String get() = appointmentId.ifBlank { "consulta:$consultationId:${ticketNumber ?: ""}" }
}

/** Number of the day's queue that the doctor can attend; `consultationId` is set only for the doctor's own consultation. */
data class QueueConsultation(
    val ticketId: String,
    val number: Int,
    val patientName: String,
    val state: String,
    val consultationId: String?,
    val consultationState: String?,
    /** Queue service (`servicio`), null when the API does not send it. */
    val service: String? = null,
    /** T10f: this doctor made the last call (`calledByMe`); another clinician made it (`calledByColleague`). Missing is false. */
    val calledByMe: Boolean = false,
    val calledByColleague: Boolean = false,
    /** Row version for the queue writes (`llamar`, `deshacer-llamado`, `no-se-presento`, `prioridad`). */
    val version: Int = 1,
    val priority: String = "rutina",
    /** Area code shown with the number ("CON 7"). */
    val area: String = QueueLabels.areaOf(service ?: "consulta_general"),
    /** Server `allowedActions` and reversible `undoActions` of the row: every queue button comes from them. */
    val allowedActions: List<QueueAction> = emptyList(),
    val undoActions: List<String> = emptyList(),
    /** Patient of the number when the API sends it (`patientId`); used only to avoid listing the same person twice (D76). */
    val patientId: String? = null,
) {
    val code: String get() = "$area $number"
    /**
     * A called number without an own consultation is another office's only when another clinician called it (web
     * `calledElsewhere`). A call by reception or an assistant, or one with no recorded caller, stays actionable.
     */
    val calledElsewhere: Boolean get() = state == "llamado" && consultationId == null && calledByColleague
}

/**
 * S13: the single primary action of the doctor's day. `/fila` is not scoped to the doctor: a ticket in attention is the
 * reader's own only when it carries `consultationId`, and numbers of other services belong to other areas. `/fila` also lists
 * the called numbers of every office, so a called number is this doctor's only when the API says this doctor called it
 * (`calledByMe`). With nothing else pending, an account that may call starts by calling who waits ([CallWaiting]).
 */
sealed interface ConsultationPrimary {
    data object CallNext : ConsultationPrimary
    data class ResumeTicket(val ticketId: String) : ConsultationPrimary
    data class ResumeUnsigned(val consultationId: String) : ConsultationPrimary
    data class StartTicket(val ticketId: String) : ConsultationPrimary
    /** "Llamar siguiente" of general consultation (`POST /fila/llamar-siguiente`) when no signing handoff offers one. */
    data object CallWaiting : ConsultationPrimary

    companion object {
        private fun QueueConsultation.general() = service == null || service == "consulta_general"

        fun pick(queue: List<QueueConsultation>, unsigned: List<String>, canCallNext: Boolean, canCallWaiting: Boolean = false): ConsultationPrimary? {
            if (canCallNext) return CallNext
            queue.filter { it.general() && it.state == "en_atencion" && it.consultationId != null && it.consultationState != "firmada" }
                .minByOrNull { it.number }?.let { return ResumeTicket(it.ticketId) }
            unsigned.firstOrNull()?.let { return ResumeUnsigned(it) }
            queue.firstOrNull { it.calledByMe && it.general() && it.state == "llamado" && it.consultationId == null }?.let { return StartTicket(it.ticketId) }
            return if (canCallWaiting) CallWaiting else null
        }

        /**
         * QA final (iOS parity, `DoctorViews` callNext): "Llamar siguiente" stays on screen whenever someone waits in general
         * consultation and no signing handoff offers a number, even when an unsigned consultation is the primary action
         * (then it is a secondary button). Before, an old unsigned consultation hid the waiting queue's only call. It hides while
         * the doctor already has a number called or in attention ([officeBusy]): the card says nobody is in the office.
         */
        fun showsCallWaiting(hasHandoff: Boolean, canCall: Boolean, waitingGeneral: Boolean, officeBusy: Boolean = false) = !hasHandoff && canCall && waitingGeneral && !officeBusy

        /**
         * D74: the signing handoff without a proposal says "Nadie espera"; when the day just read shows someone waiting, that
         * empty handoff is dropped so the screen offers "Llamar siguiente" instead of a statement that is already false.
         */
        fun shownHandoff(handoff: NextProposal?, waitingGeneral: Boolean): NextProposal? = handoff?.takeUnless { it.proposal == null && waitingGeneral }

        /**
         * D76: an appointment of today whose patient is already called or in attention in the doctor's office is shown once,
         * in "Fila del día", not again in the agenda. Matched by patient id when the queue sends it, else by the exact name.
         */
        fun withoutCalled(appointments: List<MedicalAppointment>, queue: List<QueueConsultation>): List<MedicalAppointment> {
            val inOffice = queue.filter { (it.calledByMe || it.consultationId != null) && it.state in setOf("llamado", "en_atencion") }
            if (inOffice.isEmpty()) return appointments
            return appointments.filterNot { a ->
                a.consultationState != "firmada" && inOffice.any { t -> if (t.patientId != null) t.patientId == a.patientId else t.patientName == a.patientName }
            }
        }
    }
}

/**
 * Row 1 (MED audit): the queue actions a doctor gets on a called number of "Mi día", same rules as iOS `rowActions` and the
 * reception board: only what the server offers on the row, the undo only for the doctor's own call, and the priority with
 * `fila.gestionar` while the number waits or is called.
 */
object QueueCardActions {
    fun canUndo(ticket: QueueConsultation, canCall: Boolean) =
        canCall && ticket.state == "llamado" && ticket.calledByMe && "deshacer_llamado" in ticket.undoActions
    fun canCallAgain(ticket: QueueConsultation, canCall: Boolean) = canCall && QueueAction.CALL in ticket.allowedActions
    fun canMarkAbsent(ticket: QueueConsultation) = QueueAction.ABSENT in ticket.allowedActions
    fun priorities(ticket: QueueConsultation, canManage: Boolean): List<String> =
        if (canManage && ticket.state in listOf("en_espera", "llamado")) listOf("emergencia", "urgente", "rutina").filter { it != ticket.priority } else emptyList()
}

/** Own open consultation of any day (`GET /consultas/sin-firmar`, m-22), to resume and sign it. */
data class UnsignedConsultation(
    val id: String,
    val patientId: String,
    val patientName: String,
    val appointmentId: String?,
    val ticketId: String?,
    val reason: String?,
    val startedAt: String,
    val version: Int,
)

object ConsultationResume {
    fun parseUnsigned(value: Any): List<UnsignedConsultation> {
        val rows = value as? org.json.JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            val id = row.text("id") ?: return@let null
            UnsignedConsultation(id, row.optString("patientId"), row.text("patientName") ?: "Paciente no identificado", row.text("appointmentId"), row.text("ticketId"), row.text("reason"), row.optString("startedAt"), row.optInt("version", 1))
        } }
    }

    /** Agenda rows (`GET /consultas/agenda`) with the server's actions. */
    fun parseAgenda(value: Any): List<MedicalAppointment> {
        val rows = value as? org.json.JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            MedicalAppointment(
                row.optString("appointmentId"), row.optString("patientId"), row.text("patientName").orEmpty(), row.optString("start"), row.optString("end"), row.optString("appointmentState"),
                row.text("reason"), row.text("consultationId"), row.text("consultationState"), row.text("consultationReason"), row.text("physicalExam"), row.text("plan"), row.optInt("version", 1),
                allowedActions = ServerActions.appointmentAllowed(row), blockedActions = ServerActions.appointmentBlocked(row),
                categories = CategoryRequestRules.refs(row),
            )
        } }
    }

    /** Called and in-attention numbers, ordered by number: the ones a doctor starts or resumes. */
    fun attendable(rows: List<QueueConsultation>) = rows.filter { it.state == "llamado" || it.state == "en_atencion" }.sortedBy { it.number }

    /** Someone waits in general consultation, so a doctor who may call has a first patient to call. */
    fun waitingInGeneral(rows: List<QueueConsultation>) = rows.any { it.state == "en_espera" && (it.service == null || it.service == "consulta_general") }

    fun parseQueue(value: Any): List<QueueConsultation> {
        val rows = value as? org.json.JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            QueueConsultation(row.optString("id"), row.optInt("numero"), row.optString("patientName").takeIf { it.isNotBlank() && it != "null" } ?: "Paciente no identificado", row.optString("state"), row.text("consultationId"), row.text("consultationState"), row.text("service"),
                calledByMe = row.optBoolean("calledByMe", false), calledByColleague = row.optBoolean("calledByColleague", false),
                version = row.optInt("version", 1), priority = row.text("priority") ?: "rutina",
                area = row.text("area") ?: QueueLabels.areaOf(row.text("service") ?: "consulta_general"),
                allowedActions = ServerActions.allowed(row).mapNotNull(QueueAction::of).distinct(),
                undoActions = row.optJSONArray("undoActions")?.let { list -> (0 until list.length()).map { list.optString(it) } } ?: emptyList(),
                patientId = row.text("patientId") ?: row.text("pacienteId"))
        } }
    }

    /** `consultaId` of a 409 `consulta_ya_iniciada`; the API includes it only when the open consultation is the doctor's own. */
    fun resumableId(code: String?, body: String?): String? {
        if (code != "consulta_ya_iniciada" || body.isNullOrBlank()) return null
        return runCatching { org.json.JSONObject(body).optString("consultaId") }.getOrNull()?.takeIf { it.isNotBlank() }
    }

    /** `GET /consultas/{id}/detalle` as an editable consultation item. */
    fun fromDetail(value: Any, number: Int?): MedicalAppointment? {
        val c = (value as? org.json.JSONObject)?.optJSONObject("consultation") ?: return null
        val id = c.text("id") ?: return null
        return MedicalAppointment("", c.optString("patientId"), c.text("patientName") ?: "Paciente", "", "", "", null, id, c.text("state"), c.text("reason"), c.text("physicalExam"), c.text("plan"), c.optInt("version", 1), number)
    }

    private fun org.json.JSONObject.text(name: String) = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
}
