package sv.edu.catolica.climesa.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.AuthSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException

class SupabaseAuthRepository(
    private val supabaseUrl: String,
    private val publishableKey: String,
    private val sessionStore: SecureSessionStore,
) {
    private val refreshMutex = Mutex()
    private val generation=AtomicInteger()
    private val storageLock=Any()
    private fun saveCurrent(session:AuthSession,stamp:Int):AuthSession=synchronized(storageLock){
        if(stamp!=generation.get())throw CancellationException("La sesión fue cerrada.")
        sessionStore.save(session);session
    }
    suspend fun signIn(email: String, password: String): AuthSession = withContext(Dispatchers.IO) {
        val stamp=generation.get()
        val response = requestJson(
            path = "/auth/v1/token?grant_type=password",
            method = "POST",
            body = JSONObject().put("email", email.trim()).put("password", password),
        )
        saveCurrent(parseSession(response),stamp)
    }

    suspend fun restoreSession(): AuthSession? = withContext(Dispatchers.IO) { refreshMutex.withLock {
        val stored = sessionStore.load() ?: return@withLock null
        if (stored.expiresAtEpochSeconds > Instant.now().epochSecond + 60) return@withLock stored
        try { refresh(stored.refreshToken) } catch (error: AuthRequestException) {
            if (error.statusCode == 400 || error.statusCode == 401) sessionStore.clear()
            throw error
        }
    } }
    suspend fun signUp(name: String, email: String, password: String): AuthSession? = withContext(Dispatchers.IO) {
        val stamp=generation.get()
        val result=requestJson("/auth/v1/signup","POST",JSONObject().put("email",email.trim()).put("password",password).put("data",JSONObject().put("nombre",name.trim())))
        if(result.optString("access_token").isNotBlank()) saveCurrent(parseSession(result),stamp) else null
    }
    fun clearLocalSession() { synchronized(storageLock){generation.incrementAndGet();sessionStore.clear()} }

    suspend fun signOut(session: AuthSession) = withContext(Dispatchers.IO) {
        clearLocalSession()
        try {
            requestJson("/auth/v1/logout?scope=local", "POST", JSONObject(), session.accessToken, allowEmpty = true)
        } catch (_: AuthRequestException) {
            // La sesión local siempre se elimina, aunque el dispositivo esté sin conexión.
        } finally {
            clearLocalSession()
        }
    }

    private fun refresh(refreshToken: String): AuthSession {
        val stamp=generation.get()
        val response = requestJson(
            path = "/auth/v1/token?grant_type=refresh_token",
            method = "POST",
            body = JSONObject().put("refresh_token", refreshToken),
        )
        return saveCurrent(parseSession(response),stamp)
    }

    private fun parseSession(json: JSONObject): AuthSession {
        val user = json.optJSONObject("user") ?: throw AuthRequestException("Supabase no devolvió la cuenta autenticada.")
        return AuthSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAtEpochSeconds = json.optLong("expires_at").takeIf { it > 0 }
                ?: (Instant.now().epochSecond + json.optLong("expires_in", 3600)),
            userId = user.getString("id"),
            email = user.optString("email"),
        )
    }

    private fun requestJson(
        path: String,
        method: String,
        body: JSONObject? = null,
        accessToken: String? = null,
        allowEmpty: Boolean = false,
    ): JSONObject {
        val connection = (URL(supabaseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            useCaches = false
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("apikey", publishableKey)
            accessToken?.let { setRequestProperty("Authorization", "Bearer $it") }
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            body?.let { connection.outputStream.use { output -> output.write(it.toString().toByteArray(Charsets.UTF_8)) } }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val error = runCatching { JSONObject(text) }.getOrNull()
                val code = error?.optString("error_code").orEmpty().ifBlank { error?.optString("code").orEmpty() }
                val detail = error?.optString("msg").orEmpty().ifBlank { error?.optString("error_description").orEmpty() }
                val message = when (code) {
                    "invalid_credentials" -> "Correo o contraseña incorrectos, o la cuenta todavía no está activa."
                    "email_not_confirmed" -> "Correo o contraseña incorrectos, o la cuenta todavía no está activa."
                    "over_request_rate_limit" -> "Demasiados intentos. Espera un momento y vuelve a intentar."
                    else -> "No se pudo completar la autenticación. Revisa los datos o intenta más tarde."
                }
                throw AuthRequestException(message, status)
            }
            if (text.isBlank() && allowEmpty) return JSONObject()
            return JSONObject(text)
        } catch (error: AuthRequestException) {
            throw error
        } catch (_: IOException) {
            throw AuthRequestException("No se pudo conectar. Revisa tu conexión a Internet.")
        } finally {
            connection.disconnect()
        }
    }
}

class AuthRequestException(message: String, val statusCode: Int? = null, val code: String? = null) : Exception(message)
