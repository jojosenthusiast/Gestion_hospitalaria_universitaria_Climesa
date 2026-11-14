package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QuickActionRequest

/**
 * Where a dashboard leaves "go to this section and open this action". The scaffold that hosts the sections owns one inbox:
 * it calls [post] when a dashboard action is tapped and hands [actionFor] to the section screen, which opens its form or
 * dialog and calls [consume]. The request survives a rotation and is dropped when the user leaves the target section.
 *
 * Usage in a scaffold that is not `RolePortal` (Recepción):
 * ```
 * val inbox = rememberQuickActionInbox()
 * RoleDashboardScreen(account, "REC", onAction = { request -> selectSection(request.section); inbox.post(request) })
 * // in the PATIENTS screen: inbox.actionFor(AndroidSection.PATIENTS) == QuickAction.REGISTER_PATIENT -> open the form, then inbox.consume(AndroidSection.PATIENTS)
 * ```
 */
@Stable
class QuickActionInbox(initial: QuickActionRequest? = null) {
    var request by mutableStateOf(initial)
        private set

    fun post(request: QuickActionRequest) { this.request = request }

    /** The pending verb for [section], or null when the request is for another section or has no verb. */
    fun actionFor(section: AndroidSection): QuickAction? = request?.takeIf { it.section == section }?.action

    fun consume(section: AndroidSection) { if (request?.section == section) request = null }

    /** Drops a request that was left behind when the user moved to another section. */
    fun dropUnless(section: AndroidSection) { if (request != null && request?.section != section) request = null }

    companion object {
        val Saver: Saver<QuickActionInbox, String> = Saver(
            save = { inbox -> inbox.request?.let { "${it.section.name}|${it.action?.name.orEmpty()}" }.orEmpty() },
            restore = { saved ->
                val parts = saved.split('|')
                val section = AndroidSection.entries.firstOrNull { it.name == parts.getOrNull(0) }
                QuickActionInbox(section?.let { QuickActionRequest(it, QuickAction.entries.firstOrNull { action -> action.name == parts.getOrNull(1) }) })
            },
        )
    }
}

@Composable
fun rememberQuickActionInbox(): QuickActionInbox = rememberSaveable(saver = QuickActionInbox.Saver) { QuickActionInbox() }
