# Android (Kotlin + Jetpack Compose, MVVM)

Lee antes `../AGENTS.md`. Spec base: `specs/121-cliente-android/`. Roles en Android: Jefe de Operaciones, Recepción, Asistente, Enfermería, Médico, Laboratorio, Paramédico y Paciente.

## Proyecto (estado real del código)

- Abrir la carpeta `android/` en Android Studio. Un módulo `app`.
- `applicationId` y paquete raíz: `sv.edu.catolica.climesa`. minSdk 26, compileSdk y targetSdk 35, JDK 17.
- Paquetes:
  ```
  data/            ApiClient (HttpURLConnection + org.json, Idempotency-Key, problem+json) detrás del puerto ApiGateway;
                   SupabaseAuthRepository y SecureSessionStore (AES-GCM en Android Keystore); repositorios de pacientes y camas
  data/realtime/   cliente Phoenix propio sobre OkHttp (SupabaseRealtimeRepository), SharedRealtime y LiveSubscription
  di/              AppModule de Hilt (Singleton)
  domain/          reglas puras y filtros de eventos (AndroidSections, BedRules, QueueEvents, HospitalizationRules...)
  ui/              pantallas Compose y ViewModels con Hilt
  ```
- Navegación por estado (sección seleccionada en `rememberSaveable` dentro de un scaffold adaptable), sin Navigation Compose. Recepción usa `ReceptionApp`; los demás roles, `RolePortal`.
- Librerías: Compose BOM, Material 3 y Material Icons Extended, Hilt, OkHttp (solo WebSocket), coroutines. Sin Retrofit, kotlinx.serialization ni supabase-kt.
- Pruebas unitarias en `app/src/test` (JUnit 4 + kotlinx-coroutines-test). Los ViewModels reciben `ApiGateway` y `RealtimeRepository` para usar dobles en la JVM.

## Reglas

- MVVM: la vista solo observa `StateFlow<UiState>` del ViewModel y le manda eventos. Nada de red ni lógica en los `@Composable`.
- Asincronía con corrutinas y `Flow`. Nada de callbacks ni hilos manuales.
- Los modelos se escriben a mano siguiendo `../contrato/openapi.json` y se leen con org.json. Nombres de propiedades en inglés.
- Tiempo real: el ViewModel se suscribe con `LiveSubscription`, filtra los eventos que le importan (`domain/Realtime.kt`) y vuelve a pedir datos. Prohibido refrescar con temporizadores.
- La navegación y las acciones dependen de los permisos de `/api/v1/me`. Un rol sin pantallas en Android ve "Tu rol no usa esta aplicación" y sale.
- Girar el teléfono no pierde lo escrito (estado en el ViewModel o `rememberSaveable`).
- Diseño: abre el HTML del rol en `docs/diseno/claude-design/` (13 a 19) y busca el código de pantalla (A01, A30...). Iconos Material Symbols. Cada pantalla con sus estados (`04-estados-y-avisos.html`).
- Textos en `res/values/strings.xml`, en español.

## Comandos

```bash
cd android
./gradlew assembleDebug
./gradlew test               # pruebas unitarias de ViewModels con kotlinx-coroutines-test
./gradlew connectedAndroidTest   # pruebas de UI (necesita emulador)
```

## Variables (propiedades de Gradle `CLIMESA_*`)

`app/build.gradle.kts` lee `CLIMESA_API_BASE_URL`, `CLIMESA_SUPABASE_URL` y `CLIMESA_SUPABASE_PUBLISHABLE_KEY` con `providers.gradleProperty` (por ejemplo en `~/.gradle/gradle.properties`) y las pasa a `BuildConfig` como `API_BASE_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. `CLIMESA_WEB_URL` (por defecto `https://sghu-web.onrender.com`) llega como `WEB_URL`: los correos de Supabase (confirmación de registro y restablecer contraseña) abren `<WEB_URL>/confirmar-correo` y `<WEB_URL>/restablecer`. `android/local.properties` solo contiene `sdk.dir` (lo escribe Android Studio) y nunca se sube. Detalle en `README.md`.
