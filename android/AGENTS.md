# Android (Kotlin + Jetpack Compose, MVVM)

Lee antes `../AGENTS.md`. Spec base: `specs/121-cliente-android/`. Roles en Android: Recepción, Asistente, Enfermería, Médico, Laboratorio, Paramédico y Paciente.

## Proyecto (lo crea 121-T01)

- Abrir la carpeta `android/` en Android Studio. Un módulo `app`.
- `applicationId` y paquete raíz: `sv.climesa.sghu`. minSdk 26, compileSdk y targetSdk 35, JDK 17.
- Paquetes:
  ```
  sv.climesa.sghu.core.network     Retrofit con kotlinx.serialization, interceptor de token e Idempotency-Key
  sv.climesa.sghu.core.session     sesión con supabase-kt (auth-kt)
  sv.climesa.sghu.core.realtime    RealtimeRepository: Flow<EventoDominio> con realtime-kt
  sv.climesa.sghu.core.design      tema, colores, tipografía, componentes comunes y estados
  sv.climesa.sghu.feature.<modulo> ui/, viewmodel/, data/ por módulo (pacientes, fila, consulta, ...)
  ```
- Librerías: Compose BOM, Navigation Compose, Hilt, Retrofit + kotlinx.serialization, supabase-kt, Coil. Room con SQLCipher solo para la cola sin conexión del paramédico (spec 109). Firebase Messaging solo en la historia de push.

## Reglas

- MVVM: la vista solo observa `StateFlow<UiState>` del ViewModel y le manda eventos. Nada de red ni lógica en los `@Composable`.
- Asincronía con corrutinas y `Flow`. Nada de callbacks ni hilos manuales.
- Los modelos (`@Serializable data class`) se escriben a mano siguiendo `../contrato/openapi.json`. Nombres de propiedades en inglés con `@SerialName("nombreEnEspañol")`.
- Tiempo real: el ViewModel filtra los eventos que le importan y vuelve a pedir datos. Prohibido refrescar con temporizadores.
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

`app/build.gradle.kts` lee `CLIMESA_API_BASE_URL`, `CLIMESA_SUPABASE_URL` y `CLIMESA_SUPABASE_PUBLISHABLE_KEY` con `providers.gradleProperty` (por ejemplo en `~/.gradle/gradle.properties`) y las pasa a `BuildConfig` como `API_BASE_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. `android/local.properties` solo contiene `sdk.dir` (lo escribe Android Studio) y nunca se sube. Detalle en `README.md`.
