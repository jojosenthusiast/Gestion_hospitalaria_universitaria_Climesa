package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import sv.edu.catolica.climesa.domain.AndroidSection

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
}
