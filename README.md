# CLIMESA — Sistema de Gestión Hospitalaria Universitaria

Sistema hospitalario del proyecto final DAMA (entrega y defensa: 21 de noviembre de 2026). La entrega incluye API, web administrativa, app Android y el proyecto iOS (en desarrollo). Todos los datos son ficticios.

Documentos de la entrega final:

- [Documento de Arquitectura](docs/entrega/documento-arquitectura.md) (también en PDF: `docs/entrega/documento-arquitectura.pdf`)
- [Nota de entrega y cómo probar por rol](docs/entrega/ENTREGA_2026-11-21.md)
- [Guion de la defensa](docs/entrega/guion-demo.md)

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
| Datos e identidad | PostgreSQL 17 / Supabase Auth y Realtime; 23 migraciones SQL, 11 esquemas de dominio, 66 tablas con RLS, 10 roles y 79 permisos |
| Web | React 19, TypeScript, Vite 6, CSS responsive, tipos de API generados desde OpenAPI |
| Android | Kotlin 2.1.20, Jetpack Compose (BOM 2025.04.01) Material 3, MVVM con `StateFlow` y corrutinas, Hilt 2.57.1, OkHttp 4.12 (HTTP y Realtime), Android Keystore; API 26+, SDK 35 |
| iOS | SwiftUI, MVVM, URLSession con async/await y Keychain; proyecto Xcode, iOS 17+; núcleo como Swift Package. **En desarrollo**: no se ha compilado en este entorno |

.NET se conserva únicamente en el material histórico. La decisión vigente es [ADR-024](docs/decisiones/ADR-024-backend-nodejs.md).

## Requisitos

| Para | Necesitas |
|---|---|
| API y web | Node.js 22 o superior (`engines` de `api/` y `web/`) y npm; Git |
| Documentación y verificación | Python 3 (`tools/generar_docs.py`, `tools/progreso.py`, `tools/backlog.py`) |
| Base de datos local desechable (opcional) | PostgreSQL 17 con `psql`, o Docker (`compose.test.yaml`) |
| Android | Android Studio, JDK 17 y Android SDK 35 (API mínima 26) |
| iOS | Mac con Xcode 15+ (iOS 17+) |
| Entorno demo en la nube | Un navegador; no hace falta instalar nada (ver [Entorno demo](#entorno-demo-en-la-nube)) |

Sigue las [reglas del repositorio](AGENTS.md): datos ficticios, secretos fuera del repo y un cambio de base de datos es un archivo nuevo en `supabase/migrations/`.

## Variables de entorno

Los archivos `.env` no se suben. Copia el `.env.example` de cada carpeta y completa solo lo que te toca. Nunca pegues una clave real en un ejemplo, un issue o un commit.

### API (`api/.env`, copia de `api/.env.example`)

| Variable | Secreta | De dónde sale |
|---|---|---|
| `NODE_ENV` | No | `development` en local; `production` en el servidor |
| `PORT` | No | Puerto de la API (3000 por defecto) |
| `API_PREFIX` | No | Prefijo de rutas (`api/v1` por defecto) |
| `WEB_APP_URL` | No | Origen exacto de la web (CORS y enlaces de correo); `http://localhost:5173` en local |
| `SUPABASE_URL` | No | Supabase, Project Settings, API. El ejemplo ya trae el del proyecto CLIMESA |
| `SUPABASE_PUBLISHABLE_KEY` | No | Supabase, Project Settings, API Keys (clave `sb_publishable_...`). El ejemplo ya la trae |
| `SUPABASE_SECRET_KEY` | **Sí** | Supabase, Project Settings, API Keys. Solo en el servidor; la usa el proveedor de invitaciones |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Alternativa a la anterior (clave `service_role` antigua). Basta con una de las dos |
| `DATABASE_URL` | **Sí** | Cadena de conexión de PostgreSQL del proyecto CLIMESA con el rol `sghu_api` (en la nube, la del *Session pooler*). Pídela al equipo |
| `DB_SSL_CA` | No | Opcional: certificado CA de Supabase en PEM para verificar TLS. Si se define, se ignora `sslmode` de la URL |

Sin `DATABASE_URL`, `/salud` y los datos responden 503.

### Web (`web/.env`, copia de `web/.env.example`; Vite también lee `web/.env.local`)

| Variable | Secreta | De dónde sale |
|---|---|---|
| `VITE_SUPABASE_URL` | No | La misma URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No | La misma clave publicable. **Nunca** una clave secreta ni `service_role`: toda `VITE_*` queda dentro del bundle |
| `VITE_API_BASE_URL` | No | URL de la API con su prefijo; `http://localhost:3000/api/v1` en local |

### Android e iOS

| Variable | Secreta | Dónde se define |
|---|---|---|
| `CLIMESA_API_BASE_URL` | No | Android: `~/.gradle/gradle.properties`. iOS: Build Settings, User Defined. Debe ser HTTPS fuera del emulador y del simulador |
| `CLIMESA_SUPABASE_URL` | No | Android, opcional: solo si cambia el proyecto de Supabase |
| `CLIMESA_SUPABASE_PUBLISHABLE_KEY` | No | Android, opcional: solo si cambia el proyecto de Supabase |

Detalles en [android/README.md](android/README.md) e [ios/README.md](ios/README.md).

## Base de datos y semilla

El esquema vive en `supabase/migrations/*.sql` (hoy 23 archivos) y los datos ficticios en `supabase/seed.sql`. Hay tres caminos; elige el que corresponda.

**1. Entorno demo en la nube (el que usa el equipo).** El proyecto Supabase "Gestion hospitalaria universitaria (Climesa)" tiene la semilla y las migraciones aplicadas a mano. Las tres migraciones del 14-nov (`20261114000100…300`) deben aplicarse antes de desplegar la API que las usa (camino 2). Fuera de eso, solo apunta tus `.env` a ese proyecto.

**2. Cambiar la base de la nube.** **No uses `supabase db push`**: el remoto registró las migraciones con otras marcas de versión y `db push` las vería todas pendientes e intentaría recrear tablas existentes. Aplica solo la migración que falte, a mano, en el SQL Editor de Supabase y en orden de fecha. El procedimiento y los pendientes del remoto están en [docs/desarrollo/ges-15-supabase-remoto.md](docs/desarrollo/ges-15-supabase-remoto.md). No ejecutes la semilla sobre datos reales.

**3. Base local desechable para pruebas** (no toca Supabase). Con PostgreSQL local:

```sh
createdb sghu_test
cat supabase/pruebas/00_simular_supabase.sql supabase/migrations/*.sql supabase/seed.sql | psql -v ON_ERROR_STOP=1 -d sghu_test
psql -At -d sghu_test -f supabase/pruebas/01_invariantes.sql      # todas las líneas deben decir OK
```

Con Docker, desde la raíz (la base usa almacenamiento temporal y no publica puertos):

```sh
docker compose -f compose.test.yaml up --wait db
docker compose -f compose.test.yaml exec -T db psql -U postgres -d sghu_test -v ON_ERROR_STOP=1 -f /checks/pruebas/01_invariantes.sql
docker compose -f compose.test.yaml down -v
```

`supabase/pruebas/` simula Auth y Realtime y nunca se aplica a la nube. Más detalle en [supabase/README.md](supabase/README.md) y [deployment/README.md](deployment/README.md). Todavía no existe un comando único que restaure el entorno demo desde las semillas (FR-131-05).

## Ejecutar API y web

Desde la raíz del repositorio:

```sh
npm ci --prefix api
npm ci --prefix web
```

Copia `api/.env.example` a `api/.env` y `web/.env.example` a `web/.env` (PowerShell: `Copy-Item`; macOS/Linux: `cp`) y completa la tabla de variables de arriba. La conexión de PostgreSQL debe pertenecer al proyecto CLIMESA y poder asumir el rol `sghu_api`. Los clientes contienen solo la clave publicable.

Abre dos terminales:

```sh
npm run start:dev --prefix api
```

```sh
npm run dev --prefix web
```

Web: http://localhost:5173 · API: http://localhost:3000/api/v1 · documentación: http://localhost:3000/api/v1/docs · OpenAPI: http://localhost:3000/openapi/v1.json · disponibilidad de base: http://localhost:3000/salud.

El login no habilita módulos hasta verificar la cuenta y los permisos vigentes en `/auth/me`. Guías por carpeta: [api/README.md](api/README.md) y [web/README.md](web/README.md).

## Entorno demo en la nube

El equipo mantiene un entorno desplegado en Render sobre Supabase (ver [docs/desarrollo/despliegue-render.md](docs/desarrollo/despliegue-render.md)). Los dos servicios tienen `autoDeploy: false` en `render.yaml`: se publican a mano (Manual Deploy), así que la producción refleja el último despliegue, no necesariamente la última rama.

| Pieza | Dirección | Comprobación |
|---|---|---|
| Web | https://sghu-web.onrender.com | abre la pantalla de ingreso |
| API | https://sghu-api.onrender.com/api/v1 | `GET https://sghu-api.onrender.com/salud` responde 200 con la base conectada |

El plan gratuito duerme la API tras 15 minutos sin tráfico: la primera llamada tarda cerca de un minuto. Existen cuentas de demostración, una por rol; sus contraseñas no están en el repositorio, pídelas al equipo. Para que un cliente local use ese entorno, pon en `VITE_API_BASE_URL` (web) o `CLIMESA_API_BASE_URL` (Android e iOS) la URL de la API de la tabla.

## Revisar el diseño sin credenciales

Con el servidor web abierto, entra a http://localhost:5173/work-preview.html. Usa Administración, Operaciones, Recepción, Laboratorio o Protección de datos y alterna escritorio/móvil. Esta galería usa los mismos componentes del producto con datos ficticios en memoria; no envía correos ni escribe en Supabase. El login y la activación se revisan en `/design-preview.html`. [Detalles del rediseño](VER_REDISENO.md).

Las galerías se excluyen del build normal de producción; `npm run build:design --prefix web` genera una compilación específica para revisión.

## Android

Guía completa en [android/README.md](android/README.md). Abre `android/` en Android Studio o consulta [EMPEZAR_ANDROID.md](EMPEZAR_ANDROID.md). Requiere JDK 17 y SDK 35. En el emulador, Debug usa `http://10.0.2.2:3000/api/v1` para la API de la computadora.

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
```

En Windows: `.\gradlew.bat testDebugUnitTest assembleDebug`. Release usa por defecto `https://sghu-api.onrender.com/api/v1`; para que un Debug en un teléfono use la API de producción, pon `CLIMESA_API_BASE_URL` en `~/.gradle/gradle.properties`. Los roles móviles son JOP, REC, AST, ENF, MED, LAB, PAR y PAC. Hay pantallas funcionales para pacientes y fila (REC), consultorio (AST), consulta y revisión de resultados (MED), laboratorio (LAB), hospitalización, tablero de camas, consumo de insumos, citas y resultados del paciente (PAC), estado de la ambulancia (PAR) y turnos. Las secciones de módulos en desarrollo (por ejemplo pedir ambulancia, historial o información pública) muestran su estado pendiente. Instalación del APK paso a paso: [docs/entrega/ENTREGA_2026-11-21.md](docs/entrega/ENTREGA_2026-11-21.md).

## iOS

El proyecto iOS está **en desarrollo**: solo Turnos y Perfil consultan la API y no se ha compilado en este entorno. En una Mac con Xcode 15+ abre `ios/CLIMESA.xcodeproj` y el esquema `CLIMESA`. Selecciona un simulador iPhone/iPad. Debug usa `http://localhost:3000/api/v1`; configura el backend en esa Mac o una URL HTTPS con `CLIMESA_API_BASE_URL` en Build Settings. Antes de Release define esa URL HTTPS y tu equipo de firma. Consulta [ios/README.md](ios/README.md).

```sh
cd ios
swift test
xcodebuild -project CLIMESA.xcodeproj -scheme CLIMESA -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Validación

```sh
npm test --prefix api -- --ci
npm run build --prefix api
npm run api:generate --prefix api
npm run api:generate --prefix web
npm run build --prefix web
npm test --prefix web
python tools/generar_docs.py --verificar
python tools/progreso.py --verificar
python tools/backlog.py --verificar
```

Hay 33 archivos de prueba de API (`api/tests/`), 20 de web (`web/src`) y 26 de Android (`android/app/src/test`). Las pruebas de API ejecutan el pipeline HTTP y todas las migraciones sobre PostgreSQL WASM (PGlite); el verificador de identidad y el proveedor de invitaciones están simulados solo en tests. No sustituyen las pruebas de login, correo y concurrencia multisesión en Supabase. Se incluyen workflows de CI para API, web, PostgreSQL nativo, Android, iOS y documentación (`.github/workflows/`). El despliegue en Render no depende de que CI pase.

[API](api/README.md) · [Web](web/README.md) · [Android](android/README.md) · [iOS](ios/README.md) · [Despliegue y migraciones](deployment/README.md) · [Arquitectura](docs/arquitectura/arquitectura.md) · [Modelo ER](docs/arquitectura/modelo-datos.md) · [RBAC](docs/arquitectura/roles-y-permisos.md) · [Privacidad](docs/arquitectura/privacidad.md) · [Resumen de arquitectura para el avance](docs/arquitectura/avance-31-octubre.md) · [Pruebas manuales por pantalla](docs/pruebas/pruebas-manuales.md).

## Figma y alcance

La sincronización de las nuevas vistas a Figma queda para la siguiente etapa, por instrucción del usuario. El [archivo anterior](https://www.figma.com/design/bHJjbgi64I0p0Bnw8nho8e) se conserva como referencia histórica y todavía no representa todos los módulos de este corte.

Fila, citas, consulta, laboratorio, hospitalización e inventario tienen API y pantallas. Ambulancia (solicitud, despacho y bitácora), información pública, privacidad/DPD, historial clínico y vinculación de cuentas están en desarrollo; el estado por módulo está en la sección 4 del [Documento de Arquitectura](docs/entrega/documento-arquitectura.md). Los datos de prueba son ficticios. La APK 0.1 archivada en `instalar/anteriores/` es de la demo antigua y no representa esta fuente.
