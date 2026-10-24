# 122. Plan

- Proyecto Xcode con Swift Package Manager: supabase-swift (Auth, Realtime). Carpetas `Core` (red con `URLSession` y modelos `Codable`, sesión, realtime, diseño), `Features/<modulo>` (vistas, view models, repositorios con protocolo).
- `RealtimeService` como `AsyncStream` de eventos; los view models lo consumen en `task {}`.
- Configuración por `.xcconfig` no versionado: `API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Compilación en Mac universitaria; las pruebas unitarias de view models corren con repositorios falsos sin red.
- Pruebas: XCTest o Swift Testing para view models; prueba de UI de ingreso.
