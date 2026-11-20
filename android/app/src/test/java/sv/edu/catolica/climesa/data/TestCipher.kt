package sv.edu.catolica.climesa.data

import javax.crypto.KeyGenerator

/** Software AES-GCM key for JVM tests (the Android Keystore is not available on the JVM); one key for the whole test run. */
object TestCipher : PayloadCipher by AesGcmCipher({ KeyGenerator.getInstance("AES").apply { init(256) }.generateKey() })