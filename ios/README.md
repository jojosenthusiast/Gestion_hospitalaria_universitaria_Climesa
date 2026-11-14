# iOS CLIMESA · 0.4.0

Proyecto SwiftUI/MVVM para Médico y Paciente, iOS 17+. Abre `CLIMESA.xcodeproj`, esquema `CLIMESA`, en una Mac con Xcode 15 o posterior. El paquete `Package.swift` compila `Core/` (Swift puro) y corre sus pruebas sin SwiftUI.

## Configuración

- Auth: `CLIMESA/Resources/Configuration.plist` contiene la URL y la clave publicable del proyecto Supabase (públicas). Nunca agregues una clave privada ni `service_role`.
- API: `Config/Debug.xcconfig` (`http://localhost:3000/api/v1`) y `Config/Release.xcconfig` (`https://sghu-api.onrender.com/api/v1`, la misma de web y Android) definen `CLIMESA_API_BASE_URL`. Para otro servidor copia `Config.xcconfig.example` a `Config.xcconfig` (ignorado por git); los dos archivos lo incluyen al final. Release exige HTTPS.
- Las cuentas médicas necesitan `MED` y una persona de personal vinculada (`staffId` en `/auth/me`). El registro público crea una cuenta `PAC`; el expediente se vincula desde la app (I03) y lo aprueba recepción.
- Las URLs de confirmación de correo se configuran en Supabase Auth. El registro muestra la instrucción de confirmar y luego volver al ingreso.

## Pantallas (docs/arquitectura/datos/pantallas.csv)

Las pestañas salen del perfil verificado de `/auth/me` (`TabPolicy` en `Core/Access.swift`); las secciones de Más y de Mi día salen de `AppSection`, cada una con su permiso del catálogo. Otro rol (por ejemplo Recepción) o una cuenta sin la plataforma `ios` ve "Tu rol no usa esta aplicación" y solo puede cerrar sesión.

| Rol | Pantalla | Endpoints |
|---|---|---|
| Todos | I01 Ingreso, I02 Crear cuenta | Supabase Auth (`/auth/v1/token`, `/auth/v1/signup`), `GET /auth/me` |
| PAC | I03 Vincular expediente (Más) | `POST /cuentas/vinculacion`; cambia sola con `vinculacion.resuelta` |
| PAC | I04 Inicio | `GET /fila`, `GET /citas`, `GET /me/laboratorio`, `GET /publico/avisos` |
| PAC | I05 Mi turno en fila | `GET /fila`, `GET /publico/fila/{servicio}`; vibra al pasar a Llamado |
| PAC | I06 Mis citas | `GET /citas`, `GET /citas/catalogos`, `GET /citas/disponibilidad`, `POST /citas/solicitudes`, `POST /citas/{id}/cancelar` |
| PAC | I07 Mis exámenes | `GET /me/laboratorio` (valores solo revisados) |
| PAC | I08 Mi historial (Más) | `GET /pacientes/{id}/historial` |
| PAC | I09 Pedir ambulancia (Más) | `POST /ambulancia/solicitudes` |
| PAC | I10 Información del hospital (Más) | `GET /publico/ocupacion`, `/publico/medicos-de-turno`, `/publico/avisos` |
| PAC | I11 Quién vio mi expediente (Más) | `GET /me/accesos` |
| Todos | I12 Perfil | `GET /auth/me`, cierre de sesión |
| MED | I20 Mi día | `GET /consultas/agenda`, `GET /fila`, `POST /fila/{id}/llamar`, `GET /laboratorio/ordenes`, `GET /admisiones` |
| MED | I21 Consulta | `POST /consultas`, `GET /consultas/{id}/detalle`, `PATCH /consultas/{id}`, `POST /consultas/{id}/diagnosticos`, `/receta`, `/firmar`, `GET /laboratorio/catalogo`, `POST /laboratorio/ordenes`, `POST /admisiones/indicaciones` |
| MED | I22 Expediente (Pacientes) | `GET /pacientes?query=`, `GET /pacientes/{id}/historial` |
| MED | I23 Resultados por revisar | `GET /laboratorio/ordenes`, `POST /laboratorio/ordenes/{id}/revisar` |
| MED | I24 Mis hospitalizados (Mi día) | `GET /admisiones`, `POST /admisiones/{id}/alta` |
| MED | I25 Llegada de ambulancia (Mi día) | `GET /ambulancia`, `GET /ambulancia/servicios/{id}/prehospital` |
| MED | I26 Mis turnos | `GET /turnos/mios` |

Lo que la API todavía no ofrece (cuántos faltan exacto, seguimiento y cancelación de la ambulancia del paciente, buscador CIE-10, días de hospitalización, marcar recibida la ambulancia, push) está en `docs/preguntas-abiertas.md`, sección "App iOS de Médico y Paciente". I13 (nivel F) no se implementa.

## Código

- `Core/Contract`: modelos `Codable` escritos a mano según `contrato/openapi.json` (enums con nombre del contrato y etiqueta en español; un valor desconocido no rompe la lectura), cuerpos de escritura, `Problem` (problem+json: el cliente decide por `codigo`, muestra `detail` y el código de soporte `requestId`), fechas de `America/El_Salvador` y `SubmissionIntent`/`IntentBook` (`Idempotency-Key` por intención del usuario, regla de `docs/arquitectura/convenciones-api.md`).
- `Core/Rules`: validaciones y reglas de presentación probadas (DUI, citas, fila, ambulancia, revisión de resultados, alta).
- `CLIMESA/Network.swift`: `AuthService` (Supabase Auth por REST, renovación del token) y `APIClient` (Bearer, `Idempotency-Key`, errores `APIFailure`). Un 401 borra la sesión y `AccountModel` vuelve al ingreso con "Tu sesión expiró". Cerrar sesión borra la sesión del Keychain y todo lo que estaba en memoria.
- `CLIMESA/Support.swift`: `Loader` (lectura con carga y error) y `Submission` (escritura con su intención) como view models `@MainActor @Observable`.
- `CLIMESA/PatientViews.swift`, `DoctorViews.swift`, `ConsultationView.swift`: pantallas. Toda escritura sobre un registro existente envía su `version`; tras un `version_conflicto` la pantalla vuelve a pedir el registro.
- Tiempo real sin sondeo: `Core/Realtime` implementa el protocolo Phoenix de Supabase (igual que web y Android) sobre `URLSessionWebSocketTask` con canales privados de `/auth/me`. `LiveReducer` sube un contador por grupo (`LiveTopic`: fila, citas, consultas, laboratorio, admisiones, ambulancia, ...) y cada pantalla vuelve a pedir sus datos con `.task(id:)`. Tras una caída hay una sola consulta `GET /eventos?after=<seq>` que invalida todo.
- La sesión se cierra al volver después de cinco minutos en segundo plano; antes de ese límite solo se verifica de nuevo el perfil.

La UI usa DM Sans/IBM Plex Mono, azul cobalto, tinta oscura y superficies sin sombras. Los textos están en `CLIMESA/Resources/Localizable.xcstrings`.

## Sistema de diseño (`CLIMESA/DesignSystem/`)

Tokens portados de `web/src/styles.css` (claro y oscuro, dinámicos): `Theme` (colores y estados), `Spacing`, `Radius` y `Typo` (estilos de texto con Dynamic Type) en `Theme.swift`. `Brand.*` es un alias de `Theme` para las pantallas que aún no migran. La app sigue fijada en modo claro (`preferredColorScheme(.light)`) hasta que todas las pantallas usen estos componentes. Las etiquetas de estado salen de `Core/StatusCatalog.swift` (mismos códigos y tonos que `Tag` de web) y tienen prueba en `Tests/CoreTests`.

Componentes (`Components.swift`): `SectionCard`, `StatTile`, `StatusTag`, `ListRow`, `FormField` (rótulo, ayuda y error), `ClimesaButton` / `ClimesaButtonStyle` (primario, secundario, destructivo, con `loading`), `EmptyStateView`, `LoadingStateView`, `ErrorStateView` ("Reintentar"), `ConflictBanner` ("Cerrar y recargar") y `LiveIndicator` ("En vivo"). Referencias de uso: `WorkspaceView` (barra, pestañas, Perfil, Turnos) y `HospitalInfoView` (I10). Los textos nuevos están en `Localizable.xcstrings` con prefijo `ds.`.

## Verificar en Mac

```sh
swift test
xcodebuild -project CLIMESA.xcodeproj -scheme CLIMESA -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Prueba de humo en simulador (`CLIMESAUITests`, XCUITest): arranca la app y comprueba que aparece el botón "Ingresar". Local: `xcodebuild test -project CLIMESA.xcodeproj -scheme CLIMESA -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO`.

El workflow `.github/workflows/ios.yml` (macOS 15) comprueba que cada `.swift` esté en el proyecto, corre `swift test`, compila para simulador sin firma y corre esa prueba de UI en un simulador. Falta probar en simulador o dispositivo con una cuenta MED y otra PAC: sesión restaurada, rol sin iOS, API caída, 401, cierre de sesión, retorno tras cinco minutos y cada pantalla de la tabla. Instalar en un iPhone o publicar en TestFlight requiere firmar con una cuenta de Apple.

## IPA sin firmar (sideloading)

El job `ipa` de `.github/workflows/ios.yml` compila `CLIMESA-sin-firmar.ipa` en un runner macOS 15 de GitHub Actions. Corre en push a `main`, en PRs que tocan `ios/**` o el workflow, y a mano (Actions → iOS → Run workflow). El IPA no está firmado: lo firma tu cuenta de Apple al instalarlo. Requiere iOS 17 o posterior.

### Descargar el IPA

1. Abre la ejecución del workflow en la pestaña Actions y espera a que el job `ipa` termine en verde.
2. En la sección Artifacts descarga `CLIMESA-ios-ipa`. GitHub lo guarda 14 días.
3. Descomprime el ZIP descargado: adentro está `CLIMESA-sin-firmar.ipa`.

### Instalar con Sideloadly en Windows (Apple ID gratuita)

1. Instala Sideloadly desde sideloadly.io y conecta el iPhone con cable USB.
2. En el iPhone activa el modo desarrollador: Ajustes → Privacidad y seguridad → Modo desarrollador. Reinicia si lo pide.
3. En Sideloadly arrastra `CLIMESA-sin-firmar.ipa`, escribe tu Apple ID gratuita y pulsa Start. Sideloadly firma la app con tu cuenta.
4. En el iPhone confía en el perfil: Ajustes → General → VPN y gestión de dispositivos → tu perfil de desarrollador → Confiar.

La firma con Apple ID gratuita dura 7 días: al vencer, la app deja de abrir y hay que volver a instalarla con Sideloadly. Una Apple ID gratuita admite hasta 3 apps sideloaded a la vez.

### Login de prueba (solo Debug)

El IPA es una compilación Release y nunca lleva el selector de cuentas de prueba ni sus contraseñas (B-02): `Config/Release.xcconfig` no incluye `DemoLogin.xcconfig` y fuerza `CLIMESA_DEMO_LOGIN = NO`, `DemoLogin.accounts` devuelve una lista vacía fuera de Debug y el job `ipa` falla si el `Info.plist` del IPA trae `ClimesaDemoLogin = YES`.

Para probar con cuentas ficticias, compila en Debug en la Mac: `sh ios/scripts/demo-login.sh` genera `ios/DemoLogin.xcconfig` (fuera de git) desde `demo-credenciales.json`. El login de prueba es temporal (ver `docs/operacion/login-de-prueba.md`).
