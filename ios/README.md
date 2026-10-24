# iOS CLIMESA · 0.3.0

Proyecto SwiftUI/MVVM para Médico y Paciente, iOS 17+. Abre `CLIMESA.xcodeproj`, esquema `CLIMESA`, en una Mac con Xcode 15 o posterior. El paquete `Package.swift` prueba las reglas puras de acceso y registro sin depender de SwiftUI.

## Configuración

- Auth: `CLIMESA/Resources/Configuration.plist` contiene la URL y la clave publicable del proyecto. Nunca agregues una clave privada.
- API: Build Settings → User Defined → `CLIMESA_API_BASE_URL`. Debug usa `http://localhost:3000/api/v1`. En un teléfono utiliza una URL HTTPS. Release requiere configurar HTTPS y un equipo de firma.
- El servidor debe ejecutar las migraciones de este corte. Las cuentas médicas necesitan `MED` y una persona de personal vinculada. El registro público crea una cuenta `PAC`; la vinculación de un expediente pertenece a S3.
- Las URLs de confirmación de correo se configuran en Supabase Auth. El registro muestra la instrucción de confirmar y luego volver al ingreso. No se implementan enlaces universales de activación en este corte.

## Código

`AccountModel` controla ingreso, registro, confirmación, verificación y salida. `AuthService` renueva tokens y `APIClient` consulta el backend con Bearer. Ningún rol se obtiene de metadatos editables. El perfil se acepta solo después de `/auth/me`; una falla muestra reintento/salida y bloquea los datos. Keychain guarda únicamente la sesión, con `WhenUnlockedThisDeviceOnly`. No se persiste la información de pacientes.

Médico tiene Inicio, Consultas, Mis turnos y Mi cuenta. Paciente tiene Inicio, Citas, Resultados y Mi cuenta. Los turnos propios publicados consultan la API; las operaciones clínicas de semanas siguientes están señaladas pendientes. La sesión se cierra al volver después de cinco minutos en segundo plano y se vuelve a verificar el acceso al reanudar antes de ese límite.

La UI usa DM Sans/IBM Plex Mono, azul cobalto, tinta oscura y superficies sin sombras. SwiftUI adapta columnas y tipografía a iPhone/iPad. Las licencias de las fuentes están en `../docs/diseno/fuentes`.

## Verificar en Mac

```sh
swift test
xcodebuild -project CLIMESA.xcodeproj -scheme CLIMESA -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Después ejecuta con una cuenta MED y otra PAC y prueba sesión restaurada, acceso de un rol sin iOS, correo sin confirmar, API caída, logout y retorno tras cinco minutos. El workflow iOS incluye las pruebas del paquete y compilación del simulador. En esta revisión solo se validaron sintaxis Swift, estructura del proyecto, esquema y plists; no hay Xcode ni simulador aquí. No se entrega IPA ni se afirma que el build nativo haya pasado.
