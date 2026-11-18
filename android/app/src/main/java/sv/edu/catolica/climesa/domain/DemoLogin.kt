package sv.edu.catolica.climesa.domain

import org.json.JSONArray

// TEMPORARY testing aid (docs/operacion/login-de-prueba.md): a fictitious test account the login form can be filled with.
// Remove before final delivery by building with CLIMESA_DEMO_LOGIN=false (the default).
data class DemoAccount(val role: String, val email: String, val password: String)

object DemoLogin {
    /**
     * Reads `[{"rol","correo","contrasena"}]` in file order, keeping only roles that use Android ([AndroidSections.roles]; JOP,
     * LAB, ADM and DPD use the web only). Flag off, empty text, invalid JSON or incomplete entries give no accounts.
     */
    fun accounts(enabled: Boolean, json: String): List<DemoAccount> {
        if (!enabled || json.isBlank()) return emptyList()
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            val item = array.optJSONObject(index) ?: return@mapNotNull null
            val role = item.optString("rol"); val email = item.optString("correo"); val password = item.optString("contrasena")
            if (role !in AndroidSections.roles || email.isBlank() || password.isBlank()) null else DemoAccount(role, email, password)
        }
    }
}
