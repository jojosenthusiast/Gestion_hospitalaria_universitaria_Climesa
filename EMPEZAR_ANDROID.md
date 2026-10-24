# Android CLIMESA · 0.3.0-core

Aplicación Kotlin/Compose, MVVM y Hilt, conectada a Supabase Auth y a la API CLIMESA. El repositorio activo es `RemotePatientRepository`; los datos de pacientes ya no se guardan en el teléfono. La clase de demo antigua no está conectada a producción.

1. Abre `android/` en Android Studio, usando JDK 17 y SDK Platform 35. Dispositivo mínimo: Android 8 / API 26.
2. Instala las dependencias mediante Gradle Sync.
3. Inicia la API desde la computadora. En el emulador Debug se usa `http://10.0.2.2:3000/api/v1`; la web usa `http://localhost:3000/api/v1`.
4. Para un teléfono o Release define en `~/.gradle/gradle.properties`:

```properties
CLIMESA_API_BASE_URL=https://tu-api/api/v1
```

Auth ya contiene la URL y clave publicable originales. Si cambia el proyecto, configura también `CLIMESA_SUPABASE_URL` y `CLIMESA_SUPABASE_PUBLISHABLE_KEY`. Las credenciales privadas solo viven en la API.

Desde PowerShell, dentro de `android`:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

En macOS/Linux: `./gradlew testDebugUnitTest assembleDebug`. La APK generada queda en `app/build/outputs/apk/debug/app-debug.apk`.

## Comportamiento del corte

- REC: inicio, búsqueda previa, registro, edición, historial e inactivación de pacientes mediante API.
- AST: inicio y búsqueda de pacientes; base de fila pendiente de S3.
- ENF: tablero de camas con identidad filtrada en el servidor.
- MED: inicio y turnos propios publicados; base de consulta.
- LAB, PAR y PAC: navegación principal, perfil y bases de los módulos previstos.
- Login y registro PAC con validación, confirmación por correo, restauración, refresh token y logout. Sin API disponible no se habilitan datos por un rol local.
- Tokens cifrados AES-GCM en Keystore; sin contraseña ni datos de pacientes en disco. Al volver tras cinco minutos en segundo plano se cierra la sesión; antes del límite se vuelve a verificar el perfil.
- HTTP solo para los hosts locales de Debug. Release requiere el backend HTTPS.

## Verificación disponible

Las 16 pruebas de dominio Kotlin compilaron con Kotlin 2.1.20/JDK 17 y pasaron con JUnit. Incluyen DUI, fechas, identidad, versiones, historial, roles y registro. Se revisó la sintaxis del resto de las fuentes. Esto no sustituye Gradle, Hilt, Compose ni la ejecución en dispositivo: este entorno no tiene SDK Android. El workflow Android prepara `testDebugUnitTest assembleDebug` para el repositorio.

La APK 0.1 en `instalar/anteriores/` es histórica, sin login y con datos locales. No representa el corte actual y no debe usarse para evaluar este rediseño.
