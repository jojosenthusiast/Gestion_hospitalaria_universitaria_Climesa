package sv.edu.catolica.climesa.domain

/** Destinos permitidos para una sesión Android ya validada por el API. */
enum class AndroidDestination {
    PATIENT,
    RECEPTION,
    STAFF_PLACEHOLDER,
    NOT_AVAILABLE,
    PENDING_VERIFICATION,
}

fun AccessProfile.androidDestination(): AndroidDestination {
    if (!verifiedByBackend) return AndroidDestination.PENDING_VERIFICATION
    if (roles.any { it == "PAC" }) return AndroidDestination.PATIENT
    if (roles.any { it == "REC" }) return AndroidDestination.RECEPTION
    if (roles.any { it in setOf("AST", "ENF", "MED", "LAB", "PAR") }) {
        return AndroidDestination.STAFF_PLACEHOLDER
    }
    return AndroidDestination.NOT_AVAILABLE
}
