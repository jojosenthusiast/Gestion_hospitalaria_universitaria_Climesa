package sv.edu.catolica.climesa.domain

/** Motivo obligatorio de un cambio auditado (corrección, inactivación, turno, etc.): de 10 a 500 caracteres. */
object ChangeReason {
    const val MIN = 10
    const val MAX = 500

    fun error(reason: String): String? = when {
        reason.trim().length < MIN -> "Indica el motivo, de al menos $MIN caracteres."
        reason.trim().length > MAX -> "El motivo no puede pasar de $MAX caracteres."
        else -> null
    }
}
