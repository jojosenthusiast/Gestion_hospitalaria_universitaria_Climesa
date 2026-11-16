package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/** `NivelAviso` (Fase 2, S11): how critical a notice is for staff. Only [CRITICAL] is highlighted on "Inicio". */
enum class NoticeLevel(val wire: String, val label: String) {
    CRITICAL("critico", "Crítico"), IMPORTANT("importante", "Importante"), INFORMATIVE("informativo", "Informativo");

    companion object {
        /** An unknown level reads as informative, like the web. */
        fun of(wire: String?) = entries.firstOrNull { it.wire == wire } ?: INFORMATIVE
    }
}

/** One notice of `GET /me/avisos/bandeja` (`MyInboxNoticeResponse`) with this account's acknowledgement. */
data class InboxNotice(
    val id: String,
    val title: String,
    val body: String,
    val from: String?,
    val until: String?,
    val priority: NoticePriority,
    val isPublic: Boolean,
    val roles: List<String>,
    val level: NoticeLevel,
    /** Space codes (area or bay) whose staff it targets. */
    val areas: List<String>,
    val publishedAt: String?,
    /** Targets the account's role or area (not only public). */
    val targeted: Boolean,
    /** When the account gave "Enterado"; null while it has not. */
    val acknowledgedAt: String?,
    /** Until when the reminder was snoozed. */
    val remindAt: String?,
    /** Decided by the API: critical, targeted, not acknowledged and not snoozed. The only thing "Inicio" shows. */
    val highlighted: Boolean,
)

/** `MyInboxResponse`: the notices, the counts the API computes and the next instant the inbox changes by itself. */
data class NoticeInbox(
    val updatedAt: String?,
    val notices: List<InboxNotice>,
    val unread: Int,
    val critical: Int,
    val reminderHours: Double,
    val nextChange: String?,
)

object NoticeInboxParser {
    fun parse(value: Any?): NoticeInbox {
        val root = value as? JSONObject ?: return NoticeInbox(null, emptyList(), 0, 0, DEFAULT_REMINDER_HOURS, null)
        val rows = root.optJSONArray("avisos") ?: JSONArray()
        val notices = (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let(::notice) }.filter { it.id.isNotBlank() }
        return NoticeInbox(
            text(root, "actualizadoEn"), notices, root.optInt("noLeidos", 0), root.optInt("criticos", 0),
            root.optDouble("recordatorioHoras", DEFAULT_REMINDER_HOURS).takeIf { !it.isNaN() && it > 0 } ?: DEFAULT_REMINDER_HOURS,
            text(root, "proximoCambio"),
        )
    }

    private fun notice(r: JSONObject) = InboxNotice(
        id = r.optString("id"), title = r.optString("titulo"), body = r.optString("cuerpo"), from = text(r, "desde"), until = text(r, "hasta"),
        priority = NoticePriority.of(text(r, "prioridad")), isPublic = r.optBoolean("publico", false), roles = strings(r.optJSONArray("roles")),
        level = NoticeLevel.of(text(r, "nivel")), areas = strings(r.optJSONArray("areas")), publishedAt = text(r, "publicadoEn"),
        targeted = r.optBoolean("dirigido", false), acknowledgedAt = text(r, "enteradoEn"), remindAt = text(r, "recordarEn"),
        highlighted = r.optBoolean("destacado", false),
    )

    private fun text(r: JSONObject, key: String) = if (r.isNull(key)) null else r.optString(key).takeIf { it.isNotBlank() }
    private fun strings(a: JSONArray?) = a?.let { (0 until it.length()).mapNotNull { i -> it.optString(i).takeIf(String::isNotBlank) } }.orEmpty()

    /** Policy `avisos.recordatorio_horas` default, used only if the API leaves it out. */
    private const val DEFAULT_REMINDER_HOURS = 4.0
}

/** Filters of "Avisos", the same as the web. */
enum class NoticeFilter(val label: String) { ALL("Todos"), UNREAD("Sin leer"), CRITICAL("Críticos") }

/** Rules of "Avisos" (S11), mirror of `web/src/features/avisos/rules.ts` and `CriticalNoticeBanner.tsx`. */
object NoticeInboxRules {
    /** Role names in Spanish as the web `roleNames` writes them; an unknown code shows as is. */
    private val roleNames = mapOf(
        "ADM" to "Administración", "JOP" to "Operaciones", "REC" to "Recepción", "AST" to "Asistencia", "ENF" to "Enfermería",
        "MED" to "Medicina", "LAB" to "Laboratorio", "PAR" to "Atención prehospitalaria", "DPD" to "Protección de datos", "PAC" to "Paciente",
    )

    fun acknowledgePath(id: String) = "/me/avisos/$id/enterado"
    fun snoozePath(id: String) = "/me/avisos/$id/posponer"

    /** The list with the chosen filter, in the server order (highlighted and critical first). "Sin leer": no "Enterado". */
    fun filter(notices: List<InboxNotice>, filter: NoticeFilter) = when (filter) {
        NoticeFilter.ALL -> notices
        NoticeFilter.UNREAD -> notices.filter { it.acknowledgedAt == null }
        NoticeFilter.CRITICAL -> notices.filter { it.level == NoticeLevel.CRITICAL }
    }

    /** Count next to the filter (the API computes it); "Todos" has none. */
    fun count(inbox: NoticeInbox, filter: NoticeFilter): Int? = when (filter) {
        NoticeFilter.ALL -> null
        NoticeFilter.UNREAD -> inbox.unread
        NoticeFilter.CRITICAL -> inbox.critical
    }

    /** Notices of "Inicio": only `destacado` (the API decides), minus the ones handled here and not yet re-read. */
    fun banner(inbox: NoticeInbox?, hidden: Set<String> = emptySet()) = inbox?.notices.orEmpty().filter { it.highlighted && it.id !in hidden }

    /** "Enterado" is offered while the account has not given it; the API accepts it for every notice it receives. */
    fun canAcknowledge(notice: InboxNotice) = notice.acknowledgedAt == null

    /** "Recordarme en N h" only for a critical notice that targets the account and is not acknowledged (as the web). */
    fun canSnooze(notice: InboxNotice) = notice.level == NoticeLevel.CRITICAL && notice.targeted && notice.acknowledgedAt == null

    /**
     * Who a notice is for, in words ("Medicina, Enfermería + Área EMG"). An area-only notice may arrive with no public flag,
     * no roles and no codes: it is "Tu área".
     */
    fun audience(isPublic: Boolean, roles: List<String>, areas: List<String>): String {
        val parts = buildList {
            if (isPublic) add("Pantalla pública y apps sin sesión")
            if (roles.isNotEmpty()) add(roles.joinToString(", ") { roleNames[it] ?: it })
            if (areas.isNotEmpty()) add("Área ${areas.joinToString(", ")}")
        }
        return if (parts.isEmpty()) "Tu área" else parts.joinToString(" + ")
    }

    fun audience(notice: InboxNotice) = audience(notice.isPublic, notice.roles, notice.areas)

    /** Hours for "Recordarme en N h": whole, or with a decimal comma. */
    fun hoursText(hours: Double): String =
        if (hours == Math.rint(hours)) hours.toLong().toString() else String.format(Locale.US, "%.1f", hours).replace('.', ',')

    /** Spanish text for the business code of a rejected "Enterado" or "Recordarme"; null for any other code. */
    fun actionMessage(code: String?): String? = when (code) {
        "no_encontrado" -> "Este aviso ya no está disponible para tu cuenta. La lista se actualizó."
        "aviso_retirado" -> "Este aviso fue retirado; ya no necesita «Enterado». La lista se actualizó."
        "aviso_vencido" -> "Este aviso ya venció; ya no necesita «Enterado». La lista se actualizó."
        else -> null
    }

    const val ACTION_FALLBACK = "No se pudo guardar. Revisa tu conexión y vuelve a intentar."
    const val LOAD_FALLBACK = "No se pudieron cargar los avisos. Vuelve a intentar."

    /**
     * When reading again fails, what no longer holds is not left on screen: the notice that changed or was withdrawn ([event])
     * and the ones already expired at [nowMs] are removed; counts are left as the API last sent them.
     */
    fun afterFailedRefetch(inbox: NoticeInbox, event: EventoDominio?, nowMs: Long): NoticeInbox = inbox.copy(notices = inbox.notices.filter { n ->
        n.id != event?.id && n.until?.let { u -> runCatching { Instant.parse(u).toEpochMilli() > nowMs }.getOrDefault(true) } ?: true
    })

    private val dates = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "SV")).withZone(ZoneId.of("America/El_Salvador"))

    /** A server instant in El Salvador time ("16 nov 2026, 06:00"); empty when absent or unreadable. */
    fun dateText(iso: String?): String = iso?.let { runCatching { dates.format(Instant.parse(it)) }.getOrNull() }.orEmpty()
}
