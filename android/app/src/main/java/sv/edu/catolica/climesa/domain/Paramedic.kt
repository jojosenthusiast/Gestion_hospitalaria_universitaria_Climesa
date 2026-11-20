package sv.edu.catolica.climesa.domain

import java.time.Duration
import java.time.Instant

/** Qué muestra la pantalla "Servicio activo" del paramédico: un solo paso grande, en el orden de los hitos. */
object ParamedicRules {
    /** Orden fijo de los hitos de la API (RN-31). */
    val stepOrder = listOf("salida", "en_escena", "trasladando", "en_hospital", "finalizado")

    /** Hitos por pantalla: cada botón dice lo que el paramédico acaba de hacer, no el nombre técnico del hito. */
    private val stepLabels = mapOf(
        "salida" to "Salí hacia el lugar",
        "en_escena" to "Llegué al lugar",
        "trasladando" to "Salgo con el paciente",
        "en_hospital" to "Llegué al hospital",
        "finalizado" to "Finalizar servicio",
    )

    fun stepLabel(milestone: String) = stepLabels[milestone] ?: AmbulanceLabels.milestone(milestone)

    /** El botón principal es el primer hito siguiente que no es finalizar; finalizar solo es principal cuando ya no hay otro. */
    fun primaryStep(service: AmbulanceService): String? =
        service.nextMilestones.firstOrNull { it != "finalizado" } ?: service.nextMilestones.firstOrNull { it == "finalizado" }

    /** Terminar antes de llegar al hospital es una acción aparte, con estado final y motivo (RN-32). */
    fun canFinishEarly(service: AmbulanceService) = "finalizado" in service.nextMilestones && primaryStep(service) != "finalizado"

    /** Hitos ya registrados sobre el total, para la barra de avance. */
    fun progress(service: AmbulanceService): Pair<Int, Int> =
        stepOrder.count { step -> service.milestones.any { it.type == step } } to stepOrder.size

    fun confirmMessage(milestone: String) = "Se registrará «${stepLabel(milestone)}» con la hora de ahora. Despacho lo ve al instante."

    /** Minutos desde el despacho; nunca negativos aunque el reloj del teléfono vaya atrasado. */
    fun elapsedMinutes(dispatchedAt: String, now: Instant): Long =
        runCatching { Duration.between(Instant.parse(dispatchedAt), now).toMinutes().coerceAtLeast(0) }.getOrDefault(0L)

    /** «Hace 4 min», «Hace 1 h 05 min». */
    fun elapsed(minutes: Long): String = when {
        minutes < 1 -> "Hace menos de 1 min"
        minutes < 60 -> "Hace $minutes min"
        else -> "Hace ${minutes / 60} h ${"%02d".format(minutes % 60)} min"
    }

    /** Pasos cortos de tiempo estimado de llegada; tocar uno evita teclear con guantes. */
    val etaChoices = listOf(5, 10, 15, 20, 30)

    /** Paciente del servicio: el que la API vincula a la tripulación; si no viene, el provisional creado en este teléfono. */
    fun patientLabel(provisionalRecord: String?, hasPrehospital: Boolean, patient: ServicePatient? = null): String = when {
        patient != null -> "Paciente: ${patient.fullName.ifBlank { "Sin identificar" }} · ${patient.record}"
        provisionalRecord != null -> "Sin identificar · expediente provisional $provisionalRecord"
        hasPrehospital -> "Reporte prehospital enviado"
        else -> "Sin paciente vinculado"
    }

    /**
     * D135: the paramedic's shift is published but marked absent (`cause = ausencia_registrada`): asking to publish it is
     * wrong, so the server's own next step is shown (or a fixed text naming the absence when it sends none).
     */
    fun blockGuidance(block: DispatchBlock, canPlanShifts: Boolean): String =
        if (block.absenceRecorded) block.action.ifBlank { ABSENCE_GUIDANCE } else blockGuidance(block.code, canPlanShifts)

    const val ABSENCE_GUIDANCE = "Tienes una ausencia registrada en el turno de hoy; si vas a trabajar, pide a Jefatura de Operaciones que la retire."

    /** Qué hacer ante el bloqueo de la unidad (RN-30); quien planifica turnos puede arreglarlo, los demás saben a quién llamar. */
    fun blockGuidance(code: String, canPlanShifts: Boolean): String = when (code) {
        "sin_paramedico_de_turno" ->
            // Since #145 the block also counts the app account: a paramedic on shift without an account does not unblock it.
            if (canPlanShifts) "Publica un turno de paramédico para esta unidad en Turnos, a alguien con cuenta en la app."
            else "Pide a Jefatura de Operaciones que publique tu turno de paramédico y confirma que tu cuenta de la app esté vinculada."
        "sin_motorista_de_turno" ->
            if (canPlanShifts) "Publica un turno de motorista para esta unidad en Turnos; sin quien la conduzca no puede despacharse."
            else "Falta el turno del motorista: avisa a la Jefatura de Operaciones."
        "sin_tripulacion_de_turno" ->
            if (canPlanShifts) "Publica un turno de paramédico y otro de motorista para esta unidad en Turnos."
            else "Faltan los turnos del paramédico y del motorista: avisa a la Jefatura de Operaciones."
        "en_mantenimiento" -> "Jefatura de Operaciones debe sacar la unidad de mantenimiento."
        "en_servicio" -> "Termina el servicio en curso para liberar la unidad."
        else -> "Avisa a Jefatura de Operaciones."
    }

    /**
     * Whether the paramedic screen shows the unit's dispatch block. `en_servicio` only means the unit is busy with the
     * service shown right below, so the crew does not get a "the unit cannot leave" warning while running it.
     */
    fun showsDispatchBlock(code: String): Boolean = code != "en_servicio"

    /** Secciones que resuelve la pantalla del paramédico; la unidad solo cuando el rol opera la ambulancia. */
    fun handles(section: AndroidSection, permissions: Collection<String>) = when (section) {
        AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT, AndroidSection.UNIDENTIFIED_PATIENT -> true
        AndroidSection.UNIT -> "ambulancia.operar" in permissions
        else -> false
    }

    /** «Última ubicación enviada hace 3 min» o la invitación a compartirla. */
    fun locationAge(location: AmbulanceLocation?, now: Instant): String? = location?.let { elapsedMinutes(it.capturedAt, now) }?.let { elapsed(it) }
}
