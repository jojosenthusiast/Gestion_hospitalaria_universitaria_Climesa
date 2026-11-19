package sv.edu.catolica.climesa.data

import android.content.SharedPreferences
import androidx.core.content.edit
import sv.edu.catolica.climesa.ui.TextScale

/**
 * Device-only appearance choices, in the same `appearance` SharedPreferences file as the dark-mode switch: dark mode
 * (null = follow the system) and the "Tamaño de letra" step. Nothing here is sent to the server.
 */
class AppearancePreferences(private val preferences: SharedPreferences) {
    /** The person's dark-mode choice, or null while they never chose (the app follows the system). */
    val dark: Boolean? get() = if (preferences.contains(KEY_DARK)) preferences.getBoolean(KEY_DARK, false) else null

    fun setDark(enabled: Boolean) = preferences.edit { putBoolean(KEY_DARK, enabled) }

    /** Chosen text size; Normal until the person picks another step. */
    val textScale: TextScale get() = TextScale.fromStored(preferences.getString(KEY_TEXT_SCALE, null))

    fun setTextScale(step: TextScale) = preferences.edit { putString(KEY_TEXT_SCALE, step.stored) }

    companion object {
        const val FILE = "appearance"
        const val KEY_DARK = "dark"
        const val KEY_TEXT_SCALE = "text_scale"
    }
}
