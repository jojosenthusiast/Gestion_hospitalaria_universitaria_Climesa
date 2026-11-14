package sv.edu.catolica.climesa.domain

enum class LabStepStatus { DONE, CURRENT, PENDING }

/** One step of the order journey, with the person who acts when it is the current one. */
data class LabStep(val label: String, val status: LabStepStatus)

/** Stage filters of the lab list: they tell each role which orders wait for it. */
enum class LabFilter(val label: String) {
    ALL("Todas"), REQUESTED("Solicitadas"), IN_PROCESS("En proceso"), TO_REVIEW("Por revisar"), RELEASED("Liberadas");

    fun matches(order: LaboratoryOrder) = when (this) {
        ALL -> true
        REQUESTED -> order.state == "pendiente"
        IN_PROCESS -> order.state == "en_proceso"
        TO_REVIEW -> order.state == "completado" && !order.reviewed
        RELEASED -> order.state == "completado" && order.reviewed
    }
}

/**
 * Journey of a lab order, shown the same way to every role (web `LabStepper`): Solicitada, Muestra, En proceso,
 * Completada, Revisada, Visible al paciente. The API has four states plus the review date, so "Muestra" is done as soon as
 * the order leaves `pendiente`, and "Revisada" and "Visible al paciente" happen together (D-040: review releases the values).
 */
object LabFlow {
    val stepLabels = listOf("Solicitada", "Muestra", "En proceso", "Completada", "Revisada", "Visible al paciente")

    /** Index of the step that is happening now; `stepLabels.size` when everything is done. */
    private fun currentIndex(order: LaboratoryOrder) = when {
        order.state == "pendiente" -> 1
        order.state == "en_proceso" -> 2
        order.state == "completado" && !order.reviewed -> 4
        order.state == "completado" -> stepLabels.size
        else -> -1
    }

    fun steps(order: LaboratoryOrder): List<LabStep> {
        val current = currentIndex(order)
        if (current < 0) return emptyList()
        return stepLabels.mapIndexed { index, label -> LabStep(label, when { index < current -> LabStepStatus.DONE; index == current -> LabStepStatus.CURRENT; else -> LabStepStatus.PENDING }) }
    }

    fun missingResults(order: LaboratoryOrder) = order.items.count { it.result == null }

    /** Next hand-off in plain words: who acts and on what. */
    fun nextStep(order: LaboratoryOrder, ownView: Boolean = false): String = when {
        order.state == "cancelado" -> "Orden cancelada: no continúa."
        order.state == "pendiente" -> if (ownView) "Tu orden espera que el laboratorio tome la muestra." else "Siguiente: laboratorio toma la muestra y confirma la identidad."
        order.state == "en_proceso" && missingResults(order) > 0 ->
            if (ownView) "El laboratorio está procesando tu muestra." else "Siguiente: laboratorio captura ${missingResults(order)} resultado(s) pendiente(s)."
        order.state == "en_proceso" -> if (ownView) "El laboratorio está validando tus resultados." else "Siguiente: laboratorio completa la orden."
        order.state == "completado" && !order.reviewed -> if (ownView) "Tu médico debe revisar los resultados antes de que los veas." else "Siguiente: el médico revisa y libera el resultado al paciente."
        order.state == "completado" -> if (ownView) "Tu médico ya revisó los resultados: puedes verlos." else "Liberada: el paciente ya puede ver los valores."
        else -> ""
    }

    /** What blocks the action of the current step, or null when it can proceed. */
    fun completionBlocker(order: LaboratoryOrder): String? = when {
        order.state == "en_proceso" && missingResults(order) > 0 -> "Para completar faltan ${missingResults(order)} resultado(s) por capturar."
        else -> null
    }

    /** Default filter of each lab section, so the three lab entries do not show the same list. */
    fun defaultFilter(section: AndroidSection?) = when (section) {
        AndroidSection.SAMPLE -> LabFilter.REQUESTED
        AndroidSection.CAPTURE_RESULTS -> LabFilter.IN_PROCESS
        AndroidSection.RESULT_REVIEW -> LabFilter.TO_REVIEW
        else -> LabFilter.ALL
    }

    /** Order a quick action targets: urgent first, then the oldest in the list. */
    fun nextToSample(orders: List<LaboratoryOrder>) = orders.filter { it.state == "pendiente" }.let { list -> list.firstOrNull { it.priority == "urgente" } ?: list.firstOrNull() }

    fun nextToCapture(orders: List<LaboratoryOrder>): Pair<LaboratoryOrder, LaboratoryItem>? =
        orders.filter { it.state == "en_proceso" && missingResults(it) > 0 }.let { list -> list.firstOrNull { it.priority == "urgente" } ?: list.firstOrNull() }
            ?.let { order -> order.items.firstOrNull { it.result == null }?.let { order to it } }
}
