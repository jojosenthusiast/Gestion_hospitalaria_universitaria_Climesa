package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.domain.LabFilter
import sv.edu.catolica.climesa.domain.LabStage
import sv.edu.catolica.climesa.domain.NoticeFilter

/** Which badge each status filter chip copies. "Todos" / "Todas" stay neutral. */
internal object FilterTones {
    /** «Sin leer» waits for the reader (striped, like a waiting badge); «Críticos» is the critical level badge. */
    fun notice(filter: NoticeFilter): ChipTone? = when (filter) {
        NoticeFilter.ALL -> null
        NoticeFilter.UNREAD -> ChipTone.Family(StatusFamily.ESPERA)
        NoticeFilter.CRITICAL -> ChipTone.Level(Priority.EMERGENCIA)
    }

    /** Same family as the stage pill on each lab order card. */
    fun lab(filter: LabFilter): ChipTone? = when (filter) {
        LabFilter.ALL -> null
        LabFilter.REQUESTED -> LabStage.PENDING
        LabFilter.IN_PROCESS -> LabStage.IN_PROCESS
        LabFilter.TO_REVIEW -> LabStage.TO_REVIEW
        LabFilter.RELEASED -> LabStage.RELEASED
    }?.let { ChipTone.Family(labStageFamily(it)) }

    /** Reception patient list: index 0 active, 1 inactive, 2 all (the order of the chips). */
    fun patientActivity(index: Int): ChipTone? = when (index) {
        0 -> ChipTone.of("activo")
        1 -> ChipTone.of("inactivo")
        else -> null
    }

    /** A filter whose value is an API state ("" means all): the chip copies that state's badge. */
    fun state(value: String): ChipTone? = if (value.isEmpty()) null else ChipTone.of(value)
}
