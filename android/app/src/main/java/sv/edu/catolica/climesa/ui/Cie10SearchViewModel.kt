package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URLEncoder
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.domain.Cie10Code
import sv.edu.catolica.climesa.domain.Cie10Rules

/**
 * [searched] is true once the API answered the current [query] (so an empty [results] reads "Sin resultados").
 * [manual] allows typing the code by hand, only after the search failed ([error]).
 */
data class Cie10SearchState(
    val query: String = "",
    val results: List<Cie10Code> = emptyList(),
    val searching: Boolean = false,
    val searched: Boolean = false,
    val error: String? = null,
    val manual: Boolean = false,
)

/**
 * Diagnosis step of the consultation: searches `GET /consultas/cie10?q=` while the doctor types, after [DEBOUNCE_MS]
 * and from [Cie10Rules.MIN_QUERY] characters. Picking a result gives its code and description.
 */
@HiltViewModel
class Cie10SearchViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(Cie10SearchState())
    val state = mutable.asStateFlow()
    private var searchJob: Job? = null

    fun query(text: String) {
        val q = text.take(Cie10Rules.MAX_QUERY)
        if (q == mutable.value.query) return
        searchJob?.cancel()
        val searchable = Cie10Rules.canSearch(q)
        mutable.update { it.copy(query = q, searching = searchable, searched = false, results = if (searchable) it.results else emptyList(), error = null) }
        if (searchable) searchJob = viewModelScope.launch { delay(DEBOUNCE_MS); search(q) }
    }

    /** "Volver a intentar" after a failed search: the same query, now. */
    fun retry() {
        val q = mutable.value.query
        if (!Cie10Rules.canSearch(q)) return
        searchJob?.cancel()
        mutable.update { it.copy(searching = true, error = null) }
        searchJob = viewModelScope.launch { search(q) }
    }

    /** The chosen entry; the search is cleared for the next diagnosis. */
    fun pick(code: Cie10Code): Cie10Code {
        searchJob?.cancel()
        mutable.update { Cie10SearchState(manual = it.manual) }
        return code
    }

    private suspend fun search(q: String) {
        try {
            val rows = Cie10Rules.parse(api.request("/consultas/cie10?q=${URLEncoder.encode(q.trim(), "UTF-8")}"))
            if (mutable.value.query == q) mutable.update { it.copy(results = rows, searching = false, searched = true, error = null, manual = false) }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            if (mutable.value.query == q) mutable.update { it.copy(results = emptyList(), searching = false, searched = false, error = userMessage(e, "No se pudo buscar en el catálogo CIE-10."), manual = true) }
        }
    }

    companion object { const val DEBOUNCE_MS = 300L }
}
