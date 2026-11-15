package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.BusinessErrors

/** Spanish message of a failed write: the mapped business code first, then the API helper message (MOV-03), then [fallback]. */
internal fun businessMessage(error: Throwable, fallback: String): String =
    (error as? AuthRequestException)?.code?.let(BusinessErrors::message) ?: error.message ?: fallback
