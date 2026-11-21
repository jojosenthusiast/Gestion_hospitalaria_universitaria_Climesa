package sv.edu.catolica.climesa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.edit
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.ViewModelProvider
import android.os.SystemClock
import android.view.WindowManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.domain.InactivityTimeout
import sv.edu.catolica.climesa.ui.*

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var backgroundAt: Long? = null
    /** S10: 5 minutes without touching the app while it is on screen also closes the session. */
    private val inactivity = SessionActivity.timeout
    override fun onUserInteraction() { super.onUserInteraction(); inactivity.touch() }
    override fun onStop() { backgroundAt = SystemClock.elapsedRealtime(); super.onStop() }
    override fun onStart() {
        super.onStart()
        backgroundAt?.let { stopped ->
            backgroundAt = null
            val auth = ViewModelProvider(this)[AuthViewModel::class.java]
            if (SystemClock.elapsedRealtime() - stopped > InactivityTimeout.LIMIT_MS) auth.signOut() else auth.retryAccess(silent = true)
        }
        // Time in the background is judged above; the on-screen countdown starts again on return.
        inactivity.touch()
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // S10: clinical data never shows in screenshots, screen recordings or the recent-apps preview.
        // Off by default while the app is presented to stakeholders; -PCLIMESA_SECURE_SCREEN=true turns it back on.
        if (BuildConfig.SECURE_SCREEN) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    delay(inactivity.remainingMs().coerceAtLeast(1_000L))
                    if (!inactivity.expired()) continue
                    // Same path as the manual sign-out: drafts are dropped, pending writes stay for their owner.
                    val auth = ViewModelProvider(this@MainActivity)[AuthViewModel::class.java]
                    if (auth.state.value.account != null) auth.signOut()
                    inactivity.touch()
                }
            }
        }
        val preferences = getSharedPreferences("appearance", MODE_PRIVATE)
        setContent {
            // E-18: without an explicit choice the app follows the system dark mode; the toggle stores the person's choice.
            var chosen by rememberSaveable { mutableStateOf(if (preferences.contains("dark")) preferences.getBoolean("dark", false) else null) }
            val dark = chosen ?: isSystemInDarkTheme()
            ClimesaTheme(dark) {
                val auth: AuthViewModel = viewModel()
                ClimesaApp(auth, dark) { enabled ->
                    chosen = enabled
                    preferences.edit { putBoolean("dark", enabled) }
                }
            }
        }
    }
}
