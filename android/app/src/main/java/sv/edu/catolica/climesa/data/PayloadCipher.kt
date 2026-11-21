package sv.edu.catolica.climesa.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Seals small payloads stored on the device (drafts and pending writes). */
interface PayloadCipher {
    fun encrypt(plain: ByteArray): ByteArray

    /** Throws when [sealed] was not produced by [encrypt] with the same key (tampered, legacy plaintext or a lost key). */
    fun decrypt(sealed: ByteArray): ByteArray
}

/**
 * AES-GCM with a random 12-byte IV per write; the sealed bytes are the IV followed by the ciphertext and its 128-bit tag.
 * [key] is resolved once; the app passes an Android Keystore key ([AndroidKeyStoreKeys]) and JVM tests a software key.
 */
class AesGcmCipher(key: () -> SecretKey) : PayloadCipher {
    private val secret by lazy(key)

    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secret)
        val iv = cipher.iv
        check(iv.size == IV_BYTES) { "Unexpected IV size" }
        return iv + cipher.doFinal(plain)
    }

    override fun decrypt(sealed: ByteArray): ByteArray {
        require(sealed.size > IV_BYTES) { "Sealed payload too short" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
        return cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
    }

    companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}

/** AES keys that never leave the Android Keystore; shared by [SecureSessionStore] and [FileDraftStore]. */
object AndroidKeyStoreKeys {
    fun getOrCreate(alias: String): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }
}