# Android CLIMESA (Kotlin + Jetpack Compose)

App para Recepción, Asistente, Enfermería, Médico, Laboratorio, Paramédico y Paciente. Reglas de trabajo en [AGENTS.md](AGENTS.md); estado del corte y comportamiento por rol en [../EMPEZAR_ANDROID.md](../EMPEZAR_ANDROID.md); instalación general en el [README raíz](../README.md).

## Requisitos

- Android Studio, JDK 17 y Android SDK Platform 35. Dispositivo mínimo: Android 8 (API 26).
- La API en ejecución en tu computadora (ver [../api/README.md](../api/README.md)) o la del entorno demo.

## Configuración

Las URL se leen como propiedades de Gradle (`app/build.gradle.kts`), no de `local.properties`. Android Studio escribe `sdk.dir` en `local.properties` por su cuenta. Para cambiar un valor, defínelo en `~/.gradle/gradle.properties`:

| Propiedad | Secreta | Valor por defecto / de dónde sale |
|---|---|---|
| `CLIMESA_API_BASE_URL` | No | Debug: `http://10.0.2.2:3000/api/v1` (la API de tu computadora vista desde el emulador). Teléfono físico o Release: URL HTTPS de la API |
| `CLIMESA_SUPABASE_URL` | No | Opcional: solo si cambia el proyecto de Supabase |
| `CLIMESA_SUPABASE_PUBLISHABLE_KEY` | No | Opcional: solo si cambia el proyecto de Supabase |

Nunca pongas una clave `service_role` ni secreta en la app. El archivo `local.properties.example` solo documenta `sdk.dir`; las URL no se leen de `local.properties`.

## Ejecutar

1. Abre la carpeta `android/` (no la raíz del repositorio) en Android Studio y espera la sincronización de Gradle.
2. Inicia la API en tu computadora.
3. Ejecuta la configuración `app` en un emulador, o por consola:

```sh
cd android
./gradlew assembleDebug        # Windows: .\gradlew.bat assembleDebug
```

La APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

## APK release firmado

El build release usa la API desplegada por defecto, activa R8 (reduce y optimiza sin renombrar clases) y se firma solo si encuentra las cuatro variables de firma. Nunca subas el keystore ni sus contraseñas al repositorio.

1. Crea el keystore una sola vez, fuera del repositorio (por ejemplo en `~/.climesa/`). `keytool` viene con el JDK 17:

   ```sh
   keytool -genkeypair -v -keystore ~/.climesa/climesa-release.jks -alias climesa -keyalg RSA -keysize 4096 -validity 10000
   ```

   Guarda el archivo y las contraseñas en un lugar seguro: sin ellos no se pueden publicar actualizaciones con la misma firma.

2. Define las variables como propiedades de Gradle en `~/.gradle/gradle.properties` o como variables de entorno:

   | Variable | Valor |
   |---|---|
   | `CLIMESA_RELEASE_STORE_FILE` | Ruta absoluta del `.jks` |
   | `CLIMESA_RELEASE_STORE_PASSWORD` | Contraseña del keystore |
   | `CLIMESA_RELEASE_KEY_ALIAS` | Alias de la clave (en el ejemplo, `climesa`) |
   | `CLIMESA_RELEASE_KEY_PASSWORD` | Contraseña de la clave |

3. Genera el APK:

   ```sh
   ./gradlew assembleRelease        # Windows: .\gradlew.bat assembleRelease
   ```

   Con las cuatro variables queda `app/build/outputs/apk/release/app-release.apk`, firmado. Sin ellas el build no falla: genera `app-release-unsigned.apk`, que no se puede instalar hasta firmarlo. Si falta solo alguna, Gradle avisa cuáles. El build Debug no cambia: sigue firmado con la clave de depuración de Android Studio.

En GitHub Actions, el flujo `android.yml` firma el release si existen los secretos `CLIMESA_RELEASE_KEYSTORE_BASE64` (el `.jks` en base64), `CLIMESA_RELEASE_STORE_PASSWORD`, `CLIMESA_RELEASE_KEY_ALIAS` y `CLIMESA_RELEASE_KEY_PASSWORD`; si no existen, publica el APK sin firmar.

## Sesión

- Si la API responde 401, la app renueva la sesión una vez y repite la petición. Si vuelve a fallar, borra la sesión y regresa al ingreso con el aviso "Tu sesión expiró. Ingresa nuevamente para continuar.".
- Al cerrar sesión (o al expirar) se descartan los ViewModels de la cuenta: sus datos, corrutinas y suscripciones de tiempo real.
- Cada envío de formulario usa una `Idempotency-Key` propia (`SubmissionIntent`) que se conserva en los reintentos de ese mismo envío; un envío nuevo recibe una clave nueva.

## Pruebas

```sh
./gradlew testDebugUnitTest        # pruebas unitarias (Windows: .\gradlew.bat testDebugUnitTest)
./gradlew connectedAndroidTest     # pruebas de UI; necesita emulador o dispositivo
```

## Entorno demo

Para usar el entorno desplegado, define `CLIMESA_API_BASE_URL` con la URL de la API indicada en el [README raíz](../README.md#entorno-demo-en-la-nube). Las contraseñas de las cuentas de demostración no están en el repositorio.