# ADR-024: Backend oficial con Node.js

- **Estado:** aceptada
- **Fecha:** 2026-10-20
- **Decisión:** reemplazar ASP.NET Core como tecnología de implementación del backend.

## Decisión

El backend de SGHU-CLIMESA se desarrollará con **Node.js + TypeScript**, usando **NestJS** como estructura modular y **Fastify** como adaptador HTTP. El sistema conservará el enfoque de monolito modular: cada dominio hospitalario tendrá sus módulos, casos de uso, validaciones, políticas de autorización y pruebas dentro de una API unificada.

Supabase será utilizado como plataforma de datos y servicios: PostgreSQL para persistencia, Supabase Auth para identidad, Storage para archivos y Realtime para los eventos autorizados. El backend será la única entrada para reglas de negocio y operaciones sensibles; la clave `service_role` nunca se distribuirá a Android, web o iOS.

La API se documentará con OpenAPI, tendrá validación de DTOs, auditoría, control de permisos por rol y pruebas unitarias e integración. Las migraciones SQL se mantendrán versionadas dentro del repositorio para que la base pueda reproducirse en el proyecto de Supabase confirmado por el usuario.

## Consecuencias

- El código nuevo del backend se organizará como un workspace Node.js/TypeScript.
- Las tareas y criterios que indiquen `dotnet build` deberán traducirse a comandos `npm`/`pnpm` y pruebas equivalentes de NestJS.
- Los documentos que mencionan ASP.NET Core se conservan como material histórico del análisis original; no son una instrucción de implementación.
- En el corte 0.3.0, Android sustituye el repositorio de demo por la API. La demo antigua se conserva únicamente como referencia y APK archivada.

## Implementación al 24 de octubre

El core incluye PostgreSQL vía node-postgres, CommandService, PolicyRegistry, idempotencia, auditoría encadenada, outbox y CRUD S1/S2. Falta comprobar despliegue, correo y login remoto con acceso al proyecto correcto. Ver `REVISION_SEMANAS_1_Y_2.md`.
