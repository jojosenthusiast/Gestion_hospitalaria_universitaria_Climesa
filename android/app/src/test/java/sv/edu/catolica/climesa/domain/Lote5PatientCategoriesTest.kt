package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Test

/** Lote 5 S16: «Pedir cita» reasons grouped into understandable sections, using only the server's codes. */
class Lote5PatientCategoriesTest {
    private fun category(code: String) = AppointmentCategory(code, code, "", "", emptyList(), "")

    /** The 14 codes of `citas.categoria_motivo` (migration 20261125002000), in the server's order. */
    private val catalog = listOf(
        "consulta_general", "ninos", "mujer_embarazo", "corazon", "huesos", "piel", "ojos", "oido_garganta",
        "salud_mental", "cabeza_nervios", "digestivo", "rinon_urinario", "alergias", "cirugia",
    ).map(::category)

    @Test fun losMotivosSeAgrupanPorCuerpoInternoMenteSentidosYGeneral() {
        val sections = CategoryGroups.sections(catalog)
        assertEquals(
            listOf("Cuerpo: cabeza, torso y extremidades", "Interno y digestivo", "Mente y emociones", "Sentidos: vista, oído, nariz y garganta", "General"),
            sections.map { it.group.title },
        )
        assertEquals(listOf("corazon", "huesos", "piel", "cabeza_nervios"), sections[0].categories.map { it.code })
        assertEquals(listOf("digestivo", "rinon_urinario", "alergias"), sections[1].categories.map { it.code })
        assertEquals(listOf("salud_mental"), sections[2].categories.map { it.code })
        assertEquals(listOf("ojos", "oido_garganta"), sections[3].categories.map { it.code })
        assertEquals(listOf("consulta_general", "ninos", "mujer_embarazo", "cirugia"), sections[4].categories.map { it.code })
        assertEquals("ningún motivo se pierde ni se repite", catalog.size, sections.sumOf { it.categories.size })
    }

    @Test fun unCodigoNuevoDelServidorQuedaEnGeneral() {
        assertEquals(CategoryGroup.GENERAL, CategoryGroups.groupOf("odontologia"))
    }

    @Test fun unaBusquedaSoloMuestraLasSeccionesConCoincidencias() {
        val sections = CategoryGroups.sections(listOf(category("ojos"), category("piel")))
        assertEquals(listOf(CategoryGroup.BODY, CategoryGroup.SENSES), sections.map { it.group })
    }
}
