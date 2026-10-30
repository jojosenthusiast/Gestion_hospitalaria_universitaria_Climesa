# iOS (SwiftUI, MVVM, iOS 17)

Lee antes `../AGENTS.md`. Spec base: `specs/122-cliente-ios/`. Roles en iOS: Médico y Paciente. Cualquier otro rol ve "Tu rol no usa esta aplicación" y sale.

## Proyecto

- `ios/CLIMESA.xcodeproj`, esquema `CLIMESA`, bundle id `sv.edu.catolica.climesa`, despliegue mínimo iOS 17 (la spec dice iOS 18; el proyecto se quedó en 17 para poder usar `@Observable` en equipos con Xcode 15). Sin dependencias externas: Auth y Realtime hablan con Supabase por `URLSession` (REST y `URLSessionWebSocketTask`).
- Carpetas:
  ```
  CLIMESA/                 App (solo compila en Xcode)
    CLIMESAApp.swift       punto de entrada y regreso desde segundo plano
    AccountModel.swift     ingreso, registro, perfil de /auth/me, fábrica del tiempo real
    Network.swift          AuthService y APIClient (URLSession, async/await)
    KeychainStore.swift    sesión en Keychain
    Views.swift            marca, componentes, ingreso, raíz
    WorkspaceView.swift    pestañas por rol, rol sin iOS, banda de conexión
    LiveViewModel.swift    @MainActor @Observable: consume el flujo de tiempo real
    Resources/             Localizable.xcstrings, Configuration.plist, fuentes
  Core/                    Swift puro (Foundation), compilado por la app y por Package.swift
    Access.swift           perfil, pestañas por rol y permiso (TabPolicy), registro
    Realtime/              protocolo Phoenix, servicio, transporte URLSession, estado en vivo
  Tests/CoreTests/         XCTest de Core con sockets y API falsos
  ```
- Configuración en `CLIMESA/Resources/Configuration.plist` y la variable `CLIMESA_API_BASE_URL`; nunca claves privadas.
- Todo archivo `.swift` nuevo se agrega también a `CLIMESA.xcodeproj/project.pbxproj` (Core y app se compilan en el mismo destino). `Package.swift` toma `Core/` completo.

## Reglas

- MVVM: view models `@MainActor @Observable`; las vistas no llaman la red. La lógica que se pueda probar va en `Core/` como Swift puro.
- Asincronía con `async/await` y `Task`. Sin Combine nuevo ni callbacks.
- Modelos `Codable` escritos a mano según `../contrato/openapi.json`; propiedades en inglés con `CodingKeys` hacia los nombres en español.
- Repositorios y servicios detrás de un protocolo para poder probar sin red (`RealtimeService`, `RealtimeSocket`).
- Pestañas: se deciden con `TabPolicy.decide` a partir del perfil de `/auth/me` (rol y permisos), no con metadatos del JWT. Las pestañas sin datos muestran "Próxima entrega".
- Tiempo real: el view model consume el `AsyncStream` en `.task {}` y las vistas vuelven a pedir datos al subir un contador (`.task(id:)`). Prohibido refrescar con temporizadores; solo el latido del protocolo y la espera entre reconexiones usan reloj, y tras una caída hay una única consulta a `GET /eventos?after=`.
- Diseño: `docs/diseno/claude-design/20-ios-medico.html` y `21-ios-paciente.html`, por código de pantalla (I01, I20...). Iconos SF Symbols. Cada pantalla con sus estados.
- Textos en español en `CLIMESA/Resources/Localizable.xcstrings` (claves como `tab.turnos`); en las vistas se usa `Text("clave")` o `L.text("clave")`. Los mensajes de error de `Network.swift`, `AccountModel.swift` y las validaciones de `Core/` siguen escritos en español dentro del código.
- Solo compila en Mac (la de la universidad). Si no tienes Xcode, dilo y entrega el código sin afirmar que compila.

## Comandos

```bash
cd ios
swift test
xcodebuild -project CLIMESA.xcodeproj -scheme CLIMESA -destination 'platform=iOS Simulator,name=iPhone 16' build
```
