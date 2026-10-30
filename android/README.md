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

Nunca pongas una clave `service_role` ni secreta en la app. El archivo `local.properties.example` usa nombres anteriores (`API_URL`, `SUPABASE_ANON_KEY`) que el build actual no lee.

## Ejecutar

1. Abre la carpeta `android/` (no la raíz del repositorio) en Android Studio y espera la sincronización de Gradle.
2. Inicia la API en tu computadora.
3. Ejecuta la configuración `app` en un emulador, o por consola:

```sh
cd android
./gradlew assembleDebug        # Windows: .\gradlew.bat assembleDebug
```

La APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

## Pruebas

```sh
./gradlew testDebugUnitTest        # pruebas unitarias (Windows: .\gradlew.bat testDebugUnitTest)
./gradlew connectedAndroidTest     # pruebas de UI; necesita emulador o dispositivo
```

## Entorno demo

Para usar el entorno desplegado, define `CLIMESA_API_BASE_URL` con la URL de la API indicada en el [README raíz](../README.md#entorno-demo-en-la-nube). Las contraseñas de las cuentas de demostración no están en el repositorio.