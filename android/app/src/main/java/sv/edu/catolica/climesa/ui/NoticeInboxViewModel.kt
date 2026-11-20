package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.InboxNotice
import sv.edu.catolica.climesa.domain.NoticeEvents
import sv.edu.catolica.climesa.domain.NoticeFilter
import sv.edu.catolica.climesa.domain.NoticeInbox
import sv.edu.catolica.climesa.domain.NoticeInboxParser
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.domain.RealtimeSignal

/**
 * [busyId] is the notice whose "Enterado" or "Recordarme" is being sent: one flag for every write, so nothing else is sent
 * meanwhile. [hidden] are notices handled here that the banner hides until the next answer of the API (it already reflects
 * the write). [filter] and [selectedId] live here so a rotation keeps them and "Ver en Avisos" from Inicio can preset them.
 */
data class NoticeInboxState(
    val loading: Boolean = true,
    val inbox: NoticeInbox? = null,
    val error: String? = null,
    val busyId: String? = null,
    val actionError: String? = null,
    val done: String? = null,
    /** D68: the confirmation of an action taken on the Inicio banner, shown there and not later in Avisos. */
    val bannerDone: String? = null,
    val hidden: Set<String> = emptySet(),
    val filter: NoticeFilter = NoticeFilter.ALL,
    val selectedId: String? = null,
)

/** Spanish text of a rejected "Enterado" or "Recordarme": the business code first, then [userMessage]. */
internal fun noticeActionMessage(error: Throwable): String =
    NoticeInboxRules.actionMessage((error as? AuthRequestException)?.code) ?: userMessage(error, NoticeInboxRules.ACTION_FALLBACK)

/**
 * S11 · "Avisos" and the critical notice of "Inicio" share this ViewModel (same key per account): `GET /me/avisos/bandeja`,
 * read again once per `aviso` event or reconnection gap. The single re-read at `proximoCambio` belongs to the screen that
 * shows the inbox (cancelled with it), never a timer here: no polling.
 */
@HiltViewModel
class NoticeInboxViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(NoticeInboxState())
    val state: StateFlow<NoticeInboxState> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var started = false
    private var loadJob: Job? = null
    private var debounce: Job? = null

    fun start(channels: List<String>) {
        if (!started) { started = true; load(silent = false) }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (NoticeEvents.matches(signal.event)) reloadSoon(signal.event)
                RealtimeSignal.Resync -> reloadSoon(null)
                else -> Unit
            }
        }
    }

    /** Reads the inbox again; a reload with data on screen keeps it while it waits (stale-while-revalidate). */
    fun reload() = load(silent = mutable.value.inbox != null)

    fun setFilter(filter: NoticeFilter) { mutable.value = mutable.value.copy(filter = filter, selectedId = null) }
    fun select(id: String?) { mutable.value = mutable.value.copy(selectedId = id, actionError = null, done = null) }
    fun clearMessages() { mutable.value = mutable.value.copy(actionError = null, done = null, bannerDone = null) }

    fun visible(): List<InboxNotice> = NoticeInboxRules.filter(mutable.value.inbox?.notices.orEmpty(), mutable.value.filter)
    fun banner(): List<InboxNotice> = NoticeInboxRules.banner(mutable.value.inbox, mutable.value.hidden)

    fun acknowledge(id: String, fromBanner: Boolean = false) = send(id, NoticeInboxRules.acknowledgePath(id), "Listo: diste «Enterado».", fromBanner)
    fun snooze(id: String, fromBanner: Boolean = false) =
        send(id, NoticeInboxRules.snoozePath(id), NoticeInboxRules.snoozedText(mutable.value.inbox?.reminderHours ?: 4.0), fromBanner)

    private fun send(id: String, path: String, done: String, fromBanner: Boolean) {
        if (mutable.value.busyId != null) return
        mutable.value = mutable.value.copy(busyId = id, actionError = null, done = null, bannerDone = null)
        viewModelScope.launch {
            try {
                api.request(path, "POST", JSONObject())
                mutable.value = mutable.value.copy(
                    busyId = null, hidden = mutable.value.hidden + id,
                    done = done.takeUnless { fromBanner }, bannerDone = done.takeIf { fromBanner },
                )
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.value = mutable.value.copy(busyId = null, actionError = noticeActionMessage(e))
            }
            load(silent = true)
        }
    }

    private fun reloadSoon(event: EventoDominio?) {
        debounce?.cancel()
        debounce = viewModelScope.launch { delay(DEBOUNCE_MS); load(silent = true, event = event) }
    }

    private fun load(silent: Boolean, event: EventoDominio? = null) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val inbox = NoticeInboxParser.parse(api.request("/me/avisos/bandeja"))
                // The new answer already reflects every write sent here, so nothing stays hidden.
                mutable.value = mutable.value.copy(loading = false, error = null, inbox = inbox, hidden = emptySet())
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val current = mutable.value.inbox
                mutable.value = if (current != null) {
                    mutable.value.copy(loading = false, inbox = NoticeInboxRules.afterFailedRefetch(current, event, System.currentTimeMillis()))
                } else mutable.value.copy(loading = false, error = userMessage(e, NoticeInboxRules.LOAD_FALLBACK))
            }
        }
    }

    private companion object { const val DEBOUNCE_MS = 400L }
}
