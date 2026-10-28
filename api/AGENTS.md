# API (Node.js 22 + NestJS)

Lee antes `../AGENTS.md`. Specs de referencia: `specs/100-plataforma-api/` (base) y la spec del módulo de tu tarea. La decisión de stack está en `docs/decisiones/adr/ADR-024-backend-nodejs.md`.

## Estructura

```
api/
  package.json                   scripts npm (ver Comandos)
  tsconfig.json, tsconfig.build.json, jest.config.js
  scripts/openapi.ts             genera ../contrato/openapi.json
  src/
    main.ts                      arranque (Fastify), prefijo /api/v1, OpenAPI
    app.module.ts
    platform/                    CommandService (permiso, transacción, idempotencia, auditoría, outbox),
                                 DatabaseService (pg), PolicyRegistry, Clock, filtro de errores
    auth/                        guard de JWT de Supabase, @RequirePermission, acceso
    supabase/                    cliente de Supabase en el servidor
    health/, users/, patients/, operations/   módulos por dominio (spec 100 a 103 y siguientes)
  tests/                         Jest, contra PostgreSQL real donde la prueba lo pide
```

Cada módulo de dominio vive en su carpeta de `src/` con su `*.module.ts`, controlador, servicios, DTO y reglas puras (`*.rules.ts`). Un módulo solo usa lo que otro exporta por su módulo o `index.ts`, nunca su interior. Los módulos futuros (specs 104 a 113) siguen la misma forma.

## Reglas de la API

- Rutas bajo `/api/v1/`, en español, exactamente como en `docs/arquitectura/datos/endpoints.csv`. Cada endpoint declara su permiso (`@RequirePermission('pacientes.registrar')`) y ese permiso existe en `permisos.csv`.
- JSON en español y camelCase (`fechaNacimiento`, `numeroFila`). Fechas en ISO 8601 UTC; fechas sin hora como `yyyy-MM-dd` en `America/El_Salvador`.
- Errores con `application/problem+json` y un `codigo` estable en snake_case (`cama_ocupada`, `version_conflicto`, `sin_permiso`, `validacion`). El cliente decide el mensaje por el `codigo`, no por el texto.
- Toda escritura pasa por `CommandService`: permiso, transacción, idempotencia (`Idempotency-Key`), auditoría y evento en `plataforma.outbox` en la misma transacción.
- SQL con `pg` y parámetros (`$1`, `$2`). Nada de concatenar texto en consultas. Sin ORM.
- La conexión usa el rol `sghu_api` (variable `DATABASE_URL`). El JWT de Supabase se valida contra el proyecto de `SUPABASE_URL`.
- Campos de paciente filtrados según `docs/arquitectura/privacidad.md` antes de serializar.
- Cuando cambies endpoints, regenera `../contrato/openapi.json` con `npm run api:generate` en el mismo PR. La documentación interactiva queda en `/api/v1/docs`.

## Comandos

```bash
cd api
npm ci
npm run build
npm test                    # necesita PostgreSQL; ver supabase/README.md para crear sghu_test
npm run lint
npm run start:dev           # http://localhost:3000
npm run api:generate        # escribe ../contrato/openapi.json
```

Desde la raíz del repo: `npm run api:generate --prefix api`.

## Variables (`api/.env`, nunca se sube)

Ver `api/.env.example`.
