package sv.edu.catolica.climesa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.edit
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
            if (SystemClock.elapsedRealtime() - stopped > 300000) auth.signOut() else auth.retryAccess()
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val preferences = getSharedPreferences("appearance", MODE_PRIVATE)
        setContent {
            var dark by rememberSaveable { mutableStateOf(preferences.getBoolean("dark", false)) }
            ClimesaTheme(dark) {
                val auth: AuthViewModel = viewModel()
                ClimesaApp(auth, dark) { enabled ->
                    dark = enabled
                    preferences.edit { putBoolean("dark", enabled) }
                }
            }
        }
    }
}
