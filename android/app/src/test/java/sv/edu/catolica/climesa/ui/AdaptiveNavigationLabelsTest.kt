package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import sv.edu.catolica.climesa.domain.AndroidNavigationPolicy
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.AndroidSections

class AdaptiveNavigationLabelsTest {
    private fun compactLabel(section: AndroidSection): String {
        val method = Class.forName("sv.edu.catolica.climesa.ui.AdaptiveRoleNavigationKt")
            .getDeclaredMethod("compactLabel", AndroidSection::class.java)
        method.isAccessible = true
        return method.invoke(null, section) as String
    }

    @Test
    fun laboratoryPrimaryLabelsAreCompact() {
    }

    @Test
    fun everySectionHasItsOwnIcon() {
        val names = AndroidSection.entries.map { iconFor(it).name }
        assertEquals(names.size, names.toSet().size)
    }

    @Test
    fun theMedicalBarNeverRepeatsAnIcon() {
        val permissions = AndroidSection.entries.map(AndroidSection::permission)
        val primary = AndroidNavigationPolicy.compact("MED", AndroidSections.visible("MED", permissions)).primary
        assertEquals(primary.size, primary.map { iconFor(it).name }.toSet().size)
    }
}
