package sv.edu.catolica.climesa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import sv.edu.catolica.climesa.data.AppearancePreferences
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.ViewModelProvider
import android.os.SystemClock
import dagger.hilt.android.AndroidEntryPoint
import sv.edu.catolica.climesa.ui.*

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var backgroundAt: Long? = null
    override fun onStop() { backgroundAt = SystemClock.elapsedRealtime(); super.onStop() }
    override fun onStart() {
        super.onStart()
        backgroundAt?.let { stopped ->
            backgroundAt = null
            val auth = ViewModelProvider(this)[AuthViewModel::class.java]
            if (SystemClock.elapsedRealtime() - stopped > 300000) auth.signOut() else auth.retryAccess(silent = true)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appearance = AppearancePreferences(getSharedPreferences(AppearancePreferences.FILE, MODE_PRIVATE))
        setContent {
            // E-18: without an explicit choice the app follows the system dark mode; the toggle stores the person's choice.
            var chosen by rememberSaveable { mutableStateOf(appearance.dark) }
            val dark = chosen ?: isSystemInDarkTheme()
            // Lote 5 S1: "Tamaño de letra" from Perfil, kept on the device and applied to the whole app.
            var textScale by rememberSaveable { mutableStateOf(appearance.textScale) }
            val textScaleControl = TextScaleControl(textScale) { step -> textScale = step; appearance.setTextScale(step) }
            ClimesaTheme(dark, textScale) {
                CompositionLocalProvider(LocalTextScaleControl provides textScaleControl) {
                    val auth: AuthViewModel = viewModel()
                    ClimesaApp(auth, dark) { enabled ->
                        chosen = enabled
                        appearance.setDark(enabled)
                    }
                }
            }
        }
    }
}
