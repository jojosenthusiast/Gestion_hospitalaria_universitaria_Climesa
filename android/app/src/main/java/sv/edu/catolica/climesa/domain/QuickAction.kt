package sv.edu.catolica.climesa.domain

/**
 * Verbs a dashboard can ask a section to open. They mirror the web `?accion=<verbo>` query parameter, so the same word
 * means the same thing on every platform. A request with no verb only navigates to the section.
 */
enum class QuickAction(val verb: String) {
    REGISTER_PATIENT("registrar"),
    SCHEDULE_APPOINTMENT("agendar"),
    /** Open the appointments filtered to the patients' requests (dashboard "Citas por confirmar"). */
    REVIEW_REQUESTS("solicitudes"),
    REQUEST_APPOINTMENT("solicitar"),
    ISSUE_NUMBER("emitir"),
    CALL_NEXT("llamar"),
    ASSIGN_BED("cama"),
    DISPATCH("despachar"),
    REQUEST_AMBULANCE("solicitud"),
    /** R7 U1: "Ingresar" from the patient record opens the admission guide with that patient chosen (web `accion=admision`). */
    ADMIT("admision"),
    ;

    companion object {
        fun fromVerb(verb: String?): QuickAction? = entries.firstOrNull { it.verb == verb }
    }
}

/**
 * "Go to [section] and open [action]". The dashboard posts it; the section screen takes it once (see [QuickActionInbox])
 * and opens its own form or dialog, only if the account still holds the permission for that action.
 */
data class QuickActionRequest(val section: AndroidSection, val action: QuickAction? = null, val subject: QuickSubject? = null)

/** G5: who the target section opens on (a ward patient opens "Signos vitales" already chosen). */
data class QuickSubject(val id: String, val name: String, val detail: String? = null)

/** A button of the dashboard: it exists only when the role has the target section and the permission of the action. */
data class DashboardAction(val label: String, val request: QuickActionRequest, val permission: String)

object QuickActions {
    private data class Entry(val label: String, val section: AndroidSection, val action: QuickAction?, val permission: String)

    private val catalog: Map<String, List<Entry>> = mapOf(
        "REC" to listOf(
            Entry("Registrar paciente", AndroidSection.PATIENTS, QuickAction.REGISTER_PATIENT, "pacientes.registrar"),
            Entry("Agendar cita", AndroidSection.APPOINTMENTS, QuickAction.SCHEDULE_APPOINTMENT, "citas.agendar"),
            Entry("Emitir número", AndroidSection.QUEUE, QuickAction.ISSUE_NUMBER, "fila.emitir"),
            Entry("Asignar cama", AndroidSection.ADMISSION, QuickAction.ASSIGN_BED, "camas.asignar"),
            Entry("Despachar ambulancia", AndroidSection.DISPATCH, QuickAction.DISPATCH, "ambulancia.despachar"),
        ),
        "AST" to listOf(
            Entry("Llamar siguiente", AndroidSection.ASSISTANT_STATION, QuickAction.CALL_NEXT, "fila.llamar"),
        ),
        "ENF" to listOf(
            Entry("Mi planta", AndroidSection.WARD, null, "admision.ver"),
            Entry("Registrar consumo", AndroidSection.SUPPLIES, null, "inventario.mover"),
            Entry("Recibir ambulancia", AndroidSection.AMBULANCE_RECEPTION, null, "ambulancia.recibir_prehospital"),
        ),
        "MED" to listOf(
            Entry("Ver mi consulta", AndroidSection.MEDICAL_DAY, null, "consulta.iniciar"),
            Entry("Revisar resultados", AndroidSection.RESULT_REVIEW, null, "laboratorio.revisar"),
            Entry("Mis hospitalizados", AndroidSection.HOSPITALIZED, null, "admision.ver"),
        ),
        "PAR" to listOf(
            // D13/D114: a running service already has its own pending row with "Registrar hito"; a fixed "Servicio en curso"
            // shortcut lied when there was none and opened the same screen as "Ver unidad".
            Entry("Ver unidad", AndroidSection.SERVICE, null, "ambulancia.ver_estado"),
            Entry("Bitácora", AndroidSection.LOG, null, "ambulancia.ver_bitacora"),
        ),
        "PAC" to listOf(
            Entry("Pedir cita", AndroidSection.MY_APPOINTMENTS, QuickAction.REQUEST_APPOINTMENT, "citas.solicitar"),
            Entry("Pedir ambulancia", AndroidSection.AMBULANCE_REQUEST, QuickAction.REQUEST_AMBULANCE, "ambulancia.solicitar"),
            // Mi turno and Mis exámenes are already tabs of the bar: Inicio only adds what the bar lacks.
            Entry("Hospital", AndroidSection.HOSPITAL_INFO, null, "sesion.perfil"),
        ),
    )

    /** Actions the account may take now: section reachable for the role and permission held (rule 8, never by role name). */
    fun forRole(role: String, permissions: Collection<String>): List<DashboardAction> {
        val sections = AndroidSections.visible(role, permissions)
        return catalog[role].orEmpty()
            .filter { it.permission in permissions && it.section in sections }
            .map { DashboardAction(it.label, QuickActionRequest(it.section, it.action), it.permission) }
    }

    /** A screen opens an action only when the account still holds its permission. */
    fun permissionFor(action: QuickAction): String = when (action) {
        QuickAction.REGISTER_PATIENT -> "pacientes.registrar"
        QuickAction.SCHEDULE_APPOINTMENT -> "citas.agendar"
        QuickAction.REVIEW_REQUESTS -> "citas.ver"
        QuickAction.REQUEST_APPOINTMENT -> "citas.solicitar"
        QuickAction.ISSUE_NUMBER -> "fila.emitir"
        QuickAction.CALL_NEXT -> "fila.llamar"
        QuickAction.ASSIGN_BED -> "camas.asignar"
        QuickAction.DISPATCH -> "ambulancia.despachar"
        QuickAction.REQUEST_AMBULANCE -> "ambulancia.solicitar"
        QuickAction.ADMIT -> "admision.crear"
    }

    fun allowed(action: QuickAction, permissions: Collection<String>) = permissionFor(action) in permissions
}
