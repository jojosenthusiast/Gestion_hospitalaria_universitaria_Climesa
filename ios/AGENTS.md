# iOS (SwiftUI, MVVM, iOS 18)

Lee antes `../AGENTS.md`. Spec base: `specs/122-cliente-ios/`. Roles en iOS: Médico y Paciente. Cualquier otro rol ve "Tu rol no usa esta aplicación" y sale.

## Proyecto (lo crea 122-T01)

- `ios/SGHU.xcodeproj`, esquema `SGHU`, bundle id `sv.climesa.sghu`, despliegue mínimo iOS 18. Dependencias con Swift Package Manager: `supabase-swift` (Auth, Realtime).
- Carpetas:
  ```
  SGHU/
    App/                 SGHUApp.swift, raíz con pestañas según rol
    Core/Network/        APIClient con URLSession y async/await, modelos Codable, Idempotency-Key
    Core/Session/        sesión; token en Keychain
    Core/Realtime/       RealtimeService: AsyncStream de eventos
    Core/Design/         colores, tipografía, componentes comunes y estados
    Features/<Modulo>/   Views/, ViewModels/, Repositories/ (protocolo + implementación)
  SGHUTests/             pruebas de view models con repositorios falsos
  ```
- Configuración en `Config.xcconfig` (no se sube), leída desde `Info.plist`.

## Reglas

- MVVM: view models `@MainActor @Observable`; las vistas no llaman la red.
- Asincronía con `async/await` y `Task`. Sin Combine nuevo ni callbacks.
- Modelos `Codable` escritos a mano según `../contrato/openapi.json`; propiedades en inglés con `CodingKeys` hacia los nombres en español.
- Repositorios detrás de un protocolo para poder probar sin red.
- Tiempo real: el view model consume el `AsyncStream` en `.task {}` y vuelve a pedir datos. Prohibido refrescar con temporizadores.
- Diseño: `docs/diseno/claude-design/20-ios-medico.html` y `21-ios-paciente.html`, por código de pantalla (I01, I20...). Iconos SF Symbols. Cada pantalla con sus estados.
- Textos en español en `Localizable.xcstrings`.
- Solo compila en Mac (la de la universidad). Si no tienes Xcode, dilo y entrega el código sin afirmar que compila.

## Comandos

```bash
cd ios
xcodebuild -scheme SGHU -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -scheme SGHU -destination 'platform=iOS Simulator,name=iPhone 16' test
```
