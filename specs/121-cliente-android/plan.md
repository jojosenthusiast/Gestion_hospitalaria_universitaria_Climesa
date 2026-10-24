# 121. Plan

- Un módulo de app con paquetes `core` (red, sesión, realtime, diseño), `feature/<modulo>` (ui, viewmodel, data). minSdk 26, targetSdk el vigente.
- Librerías: Compose BOM, Navigation Compose, Hilt, Retrofit con kotlinx.serialization (o Ktor), supabase-kt (auth-kt, realtime-kt), Room con SQLCipher para la cola, Firebase Messaging, Coil.
- `RealtimeRepository` expone `Flow<EventoDominio>`; cada ViewModel filtra los que le importan y vuelve a pedir.
- Variables en `local.properties` (no versionado): `API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Pruebas: unitarias de ViewModels con `kotlinx-coroutines-test` y repositorios falsos; pruebas de UI de Compose para ingreso y navegación.
