# 100. Plan

## Backend
- Solución `backend/Sghu.slnx`: `Sghu.Api` (host y endpoints), `Sghu.Platform` (portado del legado `Climesa.Platform`), un proyecto por módulo con `Contracts` separados, `Sghu.Tests`.
- Portar del legado: `Db`, `CommandRunner`, `Idempotency`, `Outbox`, `Audit` y `AuditReader`, `CanonicalJson`, `PolicyRegistry`, `Clock`, `DomainError`. Cambio principal: `Actor` se construye desde el JWT de Supabase y las asignaciones de rol.
- Autenticación: validar JWT con las llaves públicas del proyecto Supabase (`/auth/v1/.well-known/jwks.json`) usando `Microsoft.IdentityModel.JsonWebTokens`; caché de llaves con renovación.
- Permisos: atributo o metadato `RequiresPermission("camas.asignar")` en cada endpoint; filtro que consulta `acceso.asignacion_rol` y `acceso.rol_permiso` (caché de 60 s por usuario, invalidada por evento de cambio de roles).
- Errores: `ProblemDetails` con `codigo` estable (`cama_ocupada`, `version_conflicto`, `sin_permiso`).
- OpenAPI: generado en `/openapi/v1.json`; cada operación incluye `x-permiso`.

## Base de datos
- Migración `supabase/migrations/0001_plataforma.sql`: esquemas, roles `sghu_api` (mínimos privilegios), extensiones `btree_gist`, `pg_trgm`, `pgcrypto`; tablas `outbox`, `idempotencia`, `auditoria`, `politica`.
- Disparador `plataforma.publicar_evento()` sobre `outbox` AFTER INSERT que llama `realtime.send(carga, evento, canal, true)` para cada canal del evento.
- RLS activado en todas las tablas de negocio sin políticas para `anon` ni `authenticated`.
- Políticas de `realtime.messages` para canales privados según `app_canales` del token (ADR-0004).

## Eventos de tiempo real
Mecanismo común; el catálogo está en `docs/arquitectura/tiempo-real.md`.

## Clientes
Ninguno directo; cada cliente implementa el manejo de errores uniforme (spec 120 a 122).

## Pruebas
- Portar las 8 pruebas de plataforma del legado y adaptarlas al JWT.
- Nuevas: JWT inválido, sin permiso, evento no publicado tras reversión (verificando la tabla de mensajes de Realtime en PostgreSQL local con un esquema `realtime` simulado), formato de error.

## Riesgos
- `realtime.send` existe en Supabase pero no en PostgreSQL local: se crea un esquema `realtime` de prueba con la misma firma para las pruebas automáticas.
- Paquetes NuGet: en el entorno de desarrollo del equipo se restauran normalmente.
