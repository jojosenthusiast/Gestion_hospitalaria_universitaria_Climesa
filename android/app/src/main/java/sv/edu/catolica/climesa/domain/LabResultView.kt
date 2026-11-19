package sv.edu.catolica.climesa.domain

/** Lote 5 S13: how far a result is from its reference, the flag shown next to the value. */
enum class LabFlag(val label: String) {
    NORMAL("En rango"), HIGH("Alto"), LOW("Bajo"), CRITICAL_HIGH("Crítico alto"), CRITICAL_LOW("Crítico bajo"), NO_RANGE("Sin rango"), TEXT("Resultado descriptivo"), PENDING("Pendiente");

    val outOfRange get() = this in setOf(HIGH, LOW, CRITICAL_HIGH, CRITICAL_LOW)
    val critical get() = this == CRITICAL_HIGH || this == CRITICAL_LOW
}

/** One component of a result card: name, value, unit, reference range and flag, ready to draw. */
data class LabResultLine(val name: String, val code: String, val value: String?, val unit: String?, val range: String?, val flag: LabFlag, val observation: String?, val relevant: Boolean)

object LabResultView {
    /**
     * The flag of [item]: the server's `mark` when it sent one; otherwise computed from the value and the patient's range
     * (critical limits first). A text result is descriptive; no result yet is pending.
     */
    fun flag(item: LaboratoryItem): LabFlag {
        val result = item.result ?: return LabFlag.PENDING
        when (result.mark) {
            "normal" -> return LabFlag.NORMAL
            "alto" -> return LabFlag.HIGH
            "bajo" -> return LabFlag.LOW
            "critico_alto" -> return LabFlag.CRITICAL_HIGH
            "critico_bajo" -> return LabFlag.CRITICAL_LOW
            "sin_rango" -> return if (result.value == null && result.text != null) LabFlag.TEXT else LabFlag.NO_RANGE
        }
        val value = result.value ?: return if (result.text != null) LabFlag.TEXT else LabFlag.PENDING
        val range = item.range ?: return LabFlag.NO_RANGE
        return when {
            range.criticalHigh != null && value > range.criticalHigh -> LabFlag.CRITICAL_HIGH
            range.criticalLow != null && value < range.criticalLow -> LabFlag.CRITICAL_LOW
            range.max != null && value > range.max -> LabFlag.HIGH
            range.min != null && value < range.min -> LabFlag.LOW
            range.min == null && range.max == null -> LabFlag.NO_RANGE
            else -> LabFlag.NORMAL
        }
    }

    /** [withRange] false hides the critical limits (the patient's view keeps only the normal range). */
    fun line(item: LaboratoryItem, withRange: Boolean = true): LabResultLine {
        val result = item.result
        val value = result?.let { r -> r.text ?: r.value?.let(LaboratoryLabels::number) }
        val range = if (withRange) LaboratoryLabels.rangeText(item.range) else LaboratoryLabels.patientRangeText(item.range)
        return LabResultLine(item.name.ifBlank { item.code }, item.code, value, item.unit.takeIf { result?.value != null }, range, flag(item), result?.observation, result?.relevant == true)
    }

    /** "2 fuera de rango · 1 crítico" for a card summary; null when every result is in range or still pending. */
    fun summary(items: List<LaboratoryItem>): String? {
        val flags = items.map(::flag)
        val out = flags.count { it.outOfRange }
        val critical = flags.count { it.critical }
        if (out == 0) return null
        return listOfNotNull(if (out == 1) "1 fuera de rango" else "$out fuera de rango", critical.takeIf { it > 0 }?.let { if (it == 1) "1 crítico" else "$it críticos" }).joinToString(" · ")
    }
}
