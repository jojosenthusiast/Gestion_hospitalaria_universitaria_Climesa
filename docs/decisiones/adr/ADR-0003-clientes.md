# ADR-0003. Clientes y patrón MVVM

**Estado:** Aceptada (17-oct-2026). Decisiones: D-024 a D-026; requisito REQ-PLT-04.

| Cliente | Tecnología | Arquitectura |
|---|---|---|
| Web | React 18, TypeScript, Vite, React Router, TanStack Query, supabase-js | Páginas por rol; capa `api/` tipada desde OpenAPI; caché invalidada por eventos de Realtime |
| Android | Kotlin, Jetpack Compose, Navigation, Hilt, Retrofit u OkHttp, kotlinx.serialization, corrutinas y Flow, supabase-kt (Auth y Realtime), Room para la cola sin conexión del paramédico | MVVM: `ui` (Composables sin lógica), `viewmodel` (StateFlow de estado inmutable), `data` (repositorios), `domain` (modelos) |
| iOS | Swift, SwiftUI, iOS 18+, `@Observable`, async/await, URLSession, supabase-swift (Auth y Realtime) | MVVM: vistas, view models `@MainActor @Observable`, repositorios con protocolos para pruebas |

Reglas comunes:
1. El view model expone un estado único (`cargando`, `datos`, `vacío`, `error`) y recibe intenciones; la vista no llama a la red.
2. Un evento de Realtime nunca trae datos privados: el cliente invalida y vuelve a pedir a la API (D-060).
3. Toda acción que cambia estado genera su clave de idempotencia en el cliente y la reintenta con la misma clave.
4. Texto de interfaz en español; accesibilidad con contraste AA y tamaños dinámicos.
