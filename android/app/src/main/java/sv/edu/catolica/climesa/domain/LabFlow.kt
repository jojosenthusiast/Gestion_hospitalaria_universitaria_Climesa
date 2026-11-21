package sv.edu.catolica.climesa.domain

enum class LabStepStatus { DONE, CURRENT, PENDING }

/** One step of the order journey, with the person who acts when it is the current one. */
data class LabStep(val label: String, val status: LabStepStatus)

/** Stage filters of the lab list: they tell each role which orders wait for it. */
enum class LabFilter(val label: String) {
    ALL("Todas"), REQUESTED("Solicitadas"), IN_PROCESS("En Proceso"), TO_REVIEW("Por revisar"), RELEASED("Liberadas");

    fun matches(order: LaboratoryOrder) = when (this) {
        ALL -> true
        REQUESTED -> order.state == "pendiente"
        IN_PROCESS -> order.state == "en_proceso"
        TO_REVIEW -> order.state == "completado" && !order.reviewed
        RELEASED -> order.state == "completado" && order.reviewed
    }
}

/**
 * Journey of a lab order, shown the same way to every role (web `LabStepper`): Solicitada, Muestra, En Proceso,
 * Completada, Revisada, Visible al paciente. The API has four states plus the review date, so "Muestra" is done as soon as
 * the order leaves `pendiente`, and "Revisada" and "Visible al paciente" happen together (D-040: review releases the values).
 */
object LabFlow {
    val stepLabels = listOf("Solicitada", "Muestra", "En Proceso", "Completada", "Revisada", "Visible al paciente")

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

    /**
     * D70: how the step happening now reads in "Paso N de 6: …". It names what is awaited ("Revisión del médico"), never the
     * past participle of the step ("Revisada"), which read as already done.
     */
    fun currentLabel(index: Int): String = when (index) {
        1 -> "Toma de muestra"
        4 -> "Revisión del médico"
        else -> stepLabels.getOrElse(index) { "" }
    }

    fun missingResults(order: LaboratoryOrder) = order.items.count { it.result == null }

    /** A lab technician amended a result of the completed order and the doctor has not reviewed it again yet. */
    fun isAmendedPendingReview(order: LaboratoryOrder) = order.amendedAtMillis != null && order.state == "completado" && !order.reviewed

    /** Next hand-off in plain words: who acts and on what. */
    fun nextStep(order: LaboratoryOrder, ownView: Boolean = false): String = when {
        order.state == "cancelado" -> "Orden cancelada: no continúa."
        isAmendedPendingReview(order) -> if (ownView) "El laboratorio corrigió un resultado; tu médico lo revisa de nuevo." else "Resultado corregido: revísalo de nuevo."
        order.state == "pendiente" && order.external -> (order.externalPlace ?: "el lugar indicado").let { place ->
            if (ownView) "Hazte el examen en $place y trae el informe." else "Siguiente: el paciente se hace el examen en $place; luego se carga el informe."
        }
        order.state == "pendiente" -> if (ownView) "Tu orden espera que el laboratorio tome la muestra." else "Siguiente: laboratorio toma la muestra y confirma la identidad."
        order.state == "en_proceso" && missingResults(order) > 0 ->
            if (ownView) "El laboratorio está procesando tu muestra." else "Siguiente: laboratorio captura ${missingResults(order)} resultado(s) pendiente(s)."
        order.state == "en_proceso" -> if (ownView) "El laboratorio está validando tus resultados." else "Siguiente: laboratorio completa la orden."
        order.state == "completado" && !order.reviewed -> if (ownView) "Tu médico debe revisar los resultados antes de que los veas." else "Siguiente: el médico revisa y libera el resultado al paciente."
        order.state == "completado" -> if (ownView) "Tu médico ya revisó los resultados: puedes verlos." else "Liberada: el paciente ya puede ver los valores."
        else -> ""
    }

    /** Default filter of each lab section: the review section opens on what waits for the doctor. */
    fun defaultFilter(section: AndroidSection?) = when (section) {
        AndroidSection.RESULT_REVIEW -> LabFilter.TO_REVIEW
        else -> LabFilter.ALL
    }
}
