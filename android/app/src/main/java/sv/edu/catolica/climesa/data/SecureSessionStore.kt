package sv.edu.catolica.climesa.data

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.AuthSession
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("climesa_secure_session", Context.MODE_PRIVATE)

    fun save(session: AuthSession) {
        val plainText = JSONObject()
            .put("access_token", session.accessToken)
            .put("refresh_token", session.refreshToken)
            .put("expires_at", session.expiresAtEpochSeconds)
            .put("user_id", session.userId)
            .put("email", session.email)
            .toString()
            .toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        preferences.edit()
            .putString(CIPHERTEXT, Base64.encodeToString(cipher.doFinal(plainText), Base64.NO_WRAP))
            .putString(IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .apply()
    }

    fun load(): AuthSession? {
        return try {
            val encrypted = preferences.getString(CIPHERTEXT, null) ?: return null
            val iv = preferences.getString(IV, null) ?: return null
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
            )
            val json = JSONObject(String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8))
            AuthSession(
                accessToken = json.getString("access_token"),
                refreshToken = json.getString("refresh_token"),
                expiresAtEpochSeconds = json.getLong("expires_at"),
                userId = json.getString("user_id"),
                email = json.getString("email"),
            )
        } catch (_: Exception) {
            clear()
            null
        }
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun getOrCreateKey(): SecretKey = AndroidKeyStoreKeys.getOrCreate(KEY_ALIAS)

    private companion object {
        const val KEY_ALIAS = "climesa_auth_session_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val CIPHERTEXT = "ciphertext"
        const val IV = "iv"
    }
}
