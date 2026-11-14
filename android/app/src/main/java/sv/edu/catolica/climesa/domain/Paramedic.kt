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

    /** Paciente del servicio: la API del estado no trae su nombre, solo si hay un paciente provisional vinculado en este teléfono. */
    fun patientLabel(provisionalRecord: String?, hasPrehospital: Boolean): String = when {
        provisionalRecord != null -> "Sin identificar · expediente provisional $provisionalRecord"
        hasPrehospital -> "Reporte prehospital enviado"
        else -> "Sin paciente vinculado"
    }

    /** Qué hacer ante el bloqueo de la unidad (RN-30); quien planifica turnos puede arreglarlo, los demás saben a quién llamar. */
    fun blockGuidance(code: String, canPlanShifts: Boolean): String = when (code) {
        "sin_paramedico_de_turno" ->
            if (canPlanShifts) "Publica un turno de paramédico para esta unidad en Turnos."
            else "Pide a Jefatura de Operaciones que publique tu turno de paramédico."
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

    /** Secciones que resuelve la pantalla del paramédico; la unidad solo cuando el rol opera la ambulancia. */
    fun handles(section: AndroidSection, permissions: Collection<String>) = when (section) {
        AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT, AndroidSection.UNIDENTIFIED_PATIENT -> true
        AndroidSection.UNIT -> "ambulancia.operar" in permissions
        else -> false
    }

    /** «Última ubicación enviada hace 3 min» o la invitación a compartirla. */
    fun locationAge(location: AmbulanceLocation?, now: Instant): String? = location?.let { elapsedMinutes(it.capturedAt, now) }?.let { elapsed(it) }
}
