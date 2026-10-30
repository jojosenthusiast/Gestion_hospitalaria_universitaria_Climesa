# API CLIMESA (Node.js 22 + NestJS)

API REST que concentra todas las escrituras de negocio, valida los JWT de Supabase y publica los eventos de tiempo real. Reglas de trabajo en [AGENTS.md](AGENTS.md); instalación completa, base de datos y entorno demo en el [README raíz](../README.md).

## Requisitos

- Node.js 22 o superior y npm.
- Una cadena `DATABASE_URL` del proyecto CLIMESA para ejecutar la API con datos. Para las pruebas no hace falta: usan PostgreSQL WASM (PGlite) con todas las migraciones.

## Instalación

```sh
cd api
npm ci
```

Copia `.env.example` a `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). El archivo no se sube.

## Variables de entorno

| Variable | Secreta | De dónde sale |
|---|---|---|
| `NODE_ENV` | No | `development` en local |
| `PORT` | No | Puerto de la API (3000 por defecto) |
| `API_PREFIX` | No | Prefijo de rutas (`api/v1` por defecto) |
| `WEB_APP_URL` | No | Origen exacto de la web para CORS y correos |
| `SUPABASE_URL` | No | Supabase, Project Settings, API (ya viene en el ejemplo) |
| `SUPABASE_PUBLISHABLE_KEY` | No | Supabase, Project Settings, API Keys (ya viene en el ejemplo) |
| `SUPABASE_SECRET_KEY` | **Sí** | Supabase, API Keys. Solo servidor; basta con esta o con la siguiente |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Alternativa antigua a la anterior |
| `DATABASE_URL` | **Sí** | Conexión PostgreSQL con el rol `sghu_api` (en la nube, *Session pooler*); pídela al equipo |
| `DB_SSL_CA` | No | Opcional: certificado CA de Supabase (PEM) para verificar TLS |

Sin `DATABASE_URL`, `/salud` y los datos responden 503.

## Base de datos

El esquema es `../supabase/migrations/*.sql` y la semilla ficticia `../supabase/seed.sql`. No uses `supabase db push` contra la nube (las versiones remotas difieren); el procedimiento real está en [../docs/desarrollo/ges-15-supabase-remoto.md](../docs/desarrollo/ges-15-supabase-remoto.md) y la base local desechable en el [README raíz](../README.md#base-de-datos-y-semilla).

## Ejecutar

```sh
npm run start:dev      # http://localhost:3000, recarga al editar
npm run build          # compila a dist/
npm start              # ejecuta dist/main.js
```

Documentación interactiva: http://localhost:3000/api/v1/docs · OpenAPI: http://localhost:3000/openapi/v1.json · base conectada: http://localhost:3000/salud.

## Pruebas y contrato

```sh
npm test -- --ci       # Jest contra PGlite; no necesita PostgreSQL instalado
npm run lint
npm run api:generate   # reescribe ../contrato/openapi.json; hazlo cuando cambies endpoints
```

## Más información

[Arquitectura](../docs/arquitectura/arquitectura.md) · [Endpoints](../docs/arquitectura/datos/endpoints.csv) · [Despliegue](../deployment/README.md) · [Despliegue en Render](../docs/desarrollo/despliegue-render.md)