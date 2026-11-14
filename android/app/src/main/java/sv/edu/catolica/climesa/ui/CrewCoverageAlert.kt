package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.CrewCoverage
import sv.edu.catolica.climesa.domain.PlannedShift
import sv.edu.catolica.climesa.domain.ShiftPlanning

private const val MAX_LINES = 6

/** RN-30 on the shifts screen: stretches of the loaded range without a paramedic or without a driver on a published shift. */
@Composable
internal fun CrewCoverageAlert(shifts: List<PlannedShift>, staffTypes: Map<String, String>) {
    val gaps = remember(shifts, staffTypes) { CrewCoverage.gaps(shifts, staffTypes) }
    if (gaps.isEmpty()) return
    val lines = gaps.take(MAX_LINES).map { gap ->
        val from = ShiftPlanning.format(gap.start.toString())
        val to = ShiftPlanning.format(gap.end.toString())
        if (gap.role == "motorista") stringResource(R.string.cobertura_sin_motorista, from, to)
        else stringResource(R.string.cobertura_sin_paramedico, from, to)
    }
    val more = if (gaps.size > MAX_LINES) listOf(stringResource(R.string.cobertura_mas, gaps.size - MAX_LINES)) else emptyList()
    val text = (listOf(stringResource(R.string.cobertura_titulo) + ". " + stringResource(R.string.cobertura_detalle)) + lines + more).joinToString("\n")
    NoticeBanner(NoticeKind.WARNING, text)
}
