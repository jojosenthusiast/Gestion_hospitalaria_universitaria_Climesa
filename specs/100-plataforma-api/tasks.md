# 100. Tareas

- [x] T01 · S1 · R · Crear monorepo y solución backend con proyectos por módulo
  - Cubre: FR-100-18
  - Depende de: ninguna
  - Hecho cuando: `npm run build --prefix backend` (ADR-024) y `tools/generar_docs.py --verificar` pasa en el repositorio
- [x] T02 · S1 · R · Portar plataforma del legado (Db, CommandRunner, Idempotency, Outbox, Audit, PolicyRegistry, Clock)
  - Cubre: FR-100-04, FR-100-05, FR-100-06, FR-100-07, FR-100-10, FR-100-16
  - Depende de: T01
  - Hecho cuando: las pruebas de plataforma portadas pasan contra PostgreSQL local
- [x] T03 · S1 · R · Migración 0001 de plataforma con roles, RLS y disparador de Realtime
  - Cubre: FR-100-08, FR-100-09
  - Depende de: T01
  - Hecho cuando: `supabase db push` aplica en el proyecto de la nube y la prueba local de reversión no publica eventos
  - Verificado: Migración aplicada en Supabase (proyecto gvmvmrusscsfbndnbvbr, 17-oct) y prueba local 15 de supabase/pruebas/01_invariantes.sql: OK outbox y Realtime (reversión no publica)
- [x] T04 · S1 · R · Validación del JWT de Supabase y construcción del actor
  - Cubre: FR-100-01
  - Depende de: T02
  - Hecho cuando: pruebas de token válido, vencido, firma falsa y emisor ajeno pasan
- [x] T05 · S1 · R · Filtro de permisos por endpoint con auditoría de denegados
  - Cubre: FR-100-02, FR-100-03
  - Depende de: T04
  - Hecho cuando: prueba de paciente contra `POST /turnos` da 403 y deja auditoría
- [x] T06 · S1 · R · Errores uniformes, conflicto de versión y registro sin datos sensibles
  - Cubre: FR-100-11, FR-100-12, FR-100-15
  - Depende de: T02
  - Hecho cuando: prueba de 409 por versión y revisión de registros sin cuerpos de solicitud
- [x] T07 · S2 · R · OpenAPI con permisos y endpoint de salud
  - Cubre: FR-100-13, FR-100-14
  - Depende de: T05
  - Hecho cuando: `/openapi/v1.json` lista cada endpoint con `x-permiso` y `/salud` responde 200
- [ ] T08 · S2 · R · Contenedor y despliegue de la API en la nube
  - Cubre: FR-100-18
  - Depende de: T07
  - Hecho cuando: `/salud` responde desde la URL pública con la base de Supabase
- [ ] T09 · S5 · E · Límite de búsquedas por usuario
  - Cubre: FR-100-17
  - Depende de: T05
  - Hecho cuando: la búsqueda 21 en un minuto devuelve 429 y queda auditada
- [ ] T10 · S5 · E · Trabajador de push FCM y APNs con registro de dispositivos
  - Cubre: FR-100-19
  - Depende de: T03
  - Hecho cuando: un evento con push llega una sola vez a un Android y a un iPhone con la app cerrada


## Verificación del corte 0.3.0 · 24-oct-2026

Core NestJS 0.3.0; pruebas HTTP, comandos, políticas y OpenAPI en backend/test. SQL ejecutado localmente con PGlite; no implica despliegue remoto. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
