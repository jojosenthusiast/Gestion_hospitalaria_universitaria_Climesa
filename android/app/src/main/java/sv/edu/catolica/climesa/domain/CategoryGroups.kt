package sv.edu.catolica.climesa.domain

/**
 * Lote 5 S16 ("no esta categorizado por cosas fisicas, psicologicas, internas, de cabeza torso y demas, o seugn los sentidos"):
 * sections of «Pedir cita», in display order. They only group the catalog of `GET /citas/categorias`; no code is invented.
 */
enum class CategoryGroup(val title: String) {
    BODY("Cuerpo: cabeza, torso y extremidades"),
    INTERNAL("Interno y digestivo"),
    MIND("Mente y emociones"),
    SENSES("Sentidos: vista, oído, nariz y garganta"),
    GENERAL("General"),
}

data class CategorySection(val group: CategoryGroup, val categories: List<AppointmentCategory>)

object CategoryGroups {
    /** Real codes of `citas.categoria_motivo` (migration 20261125002000). A code the server adds later falls in [CategoryGroup.GENERAL]. */
    private val byCode = mapOf(
        "cabeza_nervios" to CategoryGroup.BODY, "corazon" to CategoryGroup.BODY, "huesos" to CategoryGroup.BODY, "piel" to CategoryGroup.BODY,
        "digestivo" to CategoryGroup.INTERNAL, "rinon_urinario" to CategoryGroup.INTERNAL, "alergias" to CategoryGroup.INTERNAL,
        "salud_mental" to CategoryGroup.MIND,
        "ojos" to CategoryGroup.SENSES, "oido_garganta" to CategoryGroup.SENSES,
        "consulta_general" to CategoryGroup.GENERAL, "ninos" to CategoryGroup.GENERAL, "mujer_embarazo" to CategoryGroup.GENERAL, "cirugia" to CategoryGroup.GENERAL,
    )

    fun groupOf(code: String) = byCode[code] ?: CategoryGroup.GENERAL

    /** Non-empty sections in [CategoryGroup] order; inside each, the server's order. */
    fun sections(categories: List<AppointmentCategory>): List<CategorySection> {
        val grouped = categories.groupBy { groupOf(it.code) }
        return CategoryGroup.entries.mapNotNull { g -> grouped[g]?.let { CategorySection(g, it) } }
    }
}
