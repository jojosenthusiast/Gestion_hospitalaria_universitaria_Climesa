# CLIMESA — core S1/S2 · 0.3.0

Sistema hospitalario del proyecto final DAMA. La entrega incluye API, web administrativa y fuentes de Android e iOS. El estado verificable y lo que falta para cerrar la entrega están en [REVISION_SEMANAS_1_Y_2.md](REVISION_SEMANAS_1_Y_2.md).

## Estructura

```text
sghu-climesa/
├── api/                  API Node.js 22 + NestJS (src/ y tests/)
├── web/                  React + TypeScript + Vite
├── android/              proyecto Gradle (abrir esta carpeta en Android Studio)
├── ios/                  CLIMESA.xcodeproj (abrir en Xcode)
├── contrato/openapi.json contrato de la API, lo genera la API
├── supabase/             migraciones, semilla y pruebas
├── docs/                 arquitectura, decisiones, investigación, diseño y gestión
├── specs/                SDD por módulo (spec, plan y tasks)
├── tools/                utilidades que generan y verifican la documentación
├── .github/workflows/    un workflow por plataforma
└── README.md             instalación y ejecución
```

## Estado por componente

Cada componente tiene su propio workflow y solo se ejecuta cuando cambian sus rutas.

| Componente | Carpeta | Estado |
|---|---|---|
| API | `api/` | [![API](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/api.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/api.yml) |
| Web | `web/` | [![Web](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/web.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/web.yml) |
| Android | `android/` | [![Android](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/android.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/android.yml) |
| iOS | `ios/` | [![iOS](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/ios.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/ios.yml) |
| Base de datos | `supabase/` | [![Supabase](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/supabase.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/supabase.yml) |
| Documentación | `docs/`, `specs/` | [![Docs](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/docs.yml/badge.svg)](https://github.com/jojosenthusiast/Gestion_hospitalaria_universitaria_Climesa/actions/workflows/docs.yml) |

## Stack

| Plataforma | Stack real |
|---|---|
| API | Node.js 22, TypeScript 5.7, NestJS 11, Fastify, node-postgres |
| Datos e identidad | PostgreSQL 17 / Supabase Auth y Realtime; 14 migraciones SQL, 10 roles y 75 permisos |
| Web | React 19, TypeScript, Vite 6, CSS responsive, tipos de API generados desde OpenAPI |
| Android | Kotlin 2.1.20, Jetpack Compose Material 3, MVVM, Hilt 2.57.1, Android Keystore; API 26+ |
| iOS | SwiftUI, MVVM, URLSession y Keychain; proyecto Xcode, iOS 17+; núcleo como Swift Package |

.NET se conserva únicamente en el material histórico. La decisión vigente es [ADR-024](docs/decisiones/ADR-024-backend-nodejs.md).

## Ejecutar API y web

Instala Node.js 22 y abre `SGHU-CLIMESA.code-workspace` en VS Code. Desde la raíz:

```sh
npm ci --prefix api
npm ci --prefix web
```

Copia `api/.env.example` a `api/.env` y `web/.env.example` a `web/.env` (PowerShell: `Copy-Item`; macOS/Linux: `cp`). Configura en el servidor `DATABASE_URL` y la clave privada de Supabase para invitaciones. La conexión de PostgreSQL debe pertenecer al proyecto CLIMESA y poder asumir el rol `sghu_api`. Los clientes contienen solo la clave publicable.

Abre dos terminales:

```sh
npm run start:dev --prefix api
```

```sh
npm run dev --prefix web
```

Web: http://localhost:5173 · API: http://localhost:3000/api/v1 · documentación: http://localhost:3000/api/v1/docs · OpenAPI: http://localhost:3000/openapi/v1.json · disponibilidad de base: http://localhost:3000/salud.

Sin `DATABASE_URL`, `/salud` y los datos responden 503. El login no habilita módulos hasta verificar la cuenta y los permisos vigentes en `/auth/me`.

## Revisar el diseño sin credenciales

Con el servidor web abierto, entra a http://localhost:5173/work-preview.html. Usa Administración, Operaciones, Recepción, Laboratorio o Protección de datos y alterna escritorio/móvil. Esta galería usa los mismos componentes del producto con datos ficticios en memoria; no envía correos ni escribe en Supabase. El login y la activación se revisan en `/design-preview.html`. [Detalles del rediseño](VER_REDISENO.md).

Las galerías se excluyen del build normal de producción; `npm run build:design --prefix web` genera una compilación específica para revisión.

## Android

Abre `android/` en Android Studio o consulta [EMPEZAR_ANDROID.md](EMPEZAR_ANDROID.md). Requiere JDK 17 y SDK 35. En el emulador, Debug usa `http://10.0.2.2:3000/api/v1` para la API de la computadora.

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
```

En Windows: `.\gradlew.bat testDebugUnitTest assembleDebug`. Para un dispositivo o Release configura `CLIMESA_API_BASE_URL` con la URL HTTPS del backend. Los roles móviles son REC, AST, ENF, MED, LAB, PAR y PAC. Recepción consume los pacientes remotos; enfermería consulta camas y medicina sus turnos publicados. Los módulos de semanas posteriores muestran su estado pendiente.

## iOS

En una Mac con Xcode 15+ abre `ios/CLIMESA.xcodeproj` y el esquema `CLIMESA`. Selecciona un simulador iPhone/iPad. Debug usa `http://localhost:3000/api/v1`; configura el backend en esa Mac o una URL HTTPS con `CLIMESA_API_BASE_URL` en Build Settings. Antes de Release define esa URL HTTPS y tu equipo de firma. Consulta [ios/README.md](ios/README.md).

```sh
cd ios
swift test
xcodebuild -project CLIMESA.xcodeproj -scheme CLIMESA -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Validación

```sh
npm test --prefix api
npm run build --prefix api
npm run api:generate --prefix api
npm run api:generate --prefix web
npm run build --prefix web
python tools/generar_docs.py --verificar
python tools/progreso.py --verificar
python tools/backlog.py --verificar
```

Las pruebas de API ejecutan el pipeline HTTP y todas las migraciones sobre PostgreSQL WASM (PGlite); el verificador de identidad y el proveedor de invitaciones están simulados solo en tests. No sustituyen las pruebas de login, correo y concurrencia multisesión en Supabase. Se incluyen workflows de CI para API/web, PostgreSQL nativo, Android e iOS; no se han ejecutado remotamente en esta revisión.

[Despliegue y migraciones](deployment/README.md) · [Arquitectura](docs/arquitectura/arquitectura.md) · [Modelo ER](docs/arquitectura/modelo-datos.md) · [RBAC](docs/arquitectura/roles-y-permisos.md) · [Privacidad](docs/arquitectura/privacidad.md).

## Figma y alcance

La sincronización de las nuevas vistas a Figma queda para la siguiente etapa, por instrucción del usuario. El [archivo anterior](https://www.figma.com/design/bHJjbgi64I0p0Bnw8nho8e) se conserva como referencia histórica y todavía no representa todos los módulos de este corte.

Los módulos clínicos de fila/citas, consulta, laboratorio, hospitalización, ambulancia e inventario tienen esquema y navegación prevista; sus operaciones completas pertenecen a S3–S5. Los datos de prueba son ficticios. La APK 0.1 archivada en `instalar/anteriores/` es de la demo antigua y no representa esta fuente.
