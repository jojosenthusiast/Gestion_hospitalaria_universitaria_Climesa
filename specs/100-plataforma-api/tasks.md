# 100. Tareas

- [x] T01 · S2 · R · Crear monorepo y solución backend con proyectos por módulo
  - Cubre: FR-100-18
  - Depende de: ninguna
  - Hecho cuando: `npm run build --prefix api` sin errores y `tools/generar_docs.py --verificar` pasa en el repositorio
  - Verificado: 24-oct-2026 en api/: `npm run build` sin errores; en la raíz: `python tools/generar_docs.py --verificar` sale con código 0 (10 roles, 75 permisos, 108 endpoints, 116 pantallas)
- [x] T02 · S2 · R · Portar plataforma del legado (Db, CommandRunner, Idempotency, Outbox, Audit, PolicyRegistry, Clock)
  - Cubre: FR-100-04, FR-100-05, FR-100-06, FR-100-07, FR-100-10, FR-100-16
  - Depende de: T01
  - Hecho cuando: las pruebas de plataforma portadas pasan contra PostgreSQL local
  - Verificado: 24-oct-2026 `npm test -- --ci` en api/: 9 suites, 52 pruebas pasan; tests/platform.spec.ts cubre idempotencia con auditoría del conflicto, PolicyRegistry por fecha y sin política vigente, cadena de auditoría con fila alterada y borrada, y zona America/El_Salvador. El SQL corre en PGlite (PostgreSQL embebido), no en un servidor PostgreSQL ni en la nube
- [x] T03 · S1 · R · Migración 0001 de plataforma con roles, RLS y disparador de Realtime
  - Cubre: FR-100-08, FR-100-09
  - Depende de: ninguna
  - Hecho cuando: `supabase db push` aplica en el proyecto de la nube y la prueba local de reversión no publica eventos
  - Verificado: Migración aplicada en Supabase (proyecto gvmvmrusscsfbndnbvbr, 17-oct) y prueba local 15 de supabase/pruebas/01_invariantes.sql: OK outbox y Realtime (reversión no publica)
- [x] T04 · S2 · R · Validación del JWT de Supabase y construcción del actor
  - Cubre: FR-100-01
  - Depende de: T02
  - Hecho cuando: pruebas de token válido, vencido, firma falsa y emisor ajeno pasan
  - Verificado: 24-oct-2026 tests/core.integration.spec.ts, `rechaza token vencido, firma falsa y emisor ajeno` (3 casos 401) y `cada rol recibe plataformas y permisos` (token válido, actor construido); 52 de 52 pruebas pasan. La firma se delega a `auth.getUser` de Supabase (simulado en prueba); no hay verificación local de firma
- [x] T05 · S2 · R · Filtro de permisos por endpoint con auditoría de denegados
  - Cubre: FR-100-02, FR-100-03
  - Depende de: T04
  - Hecho cuando: prueba de paciente contra `POST /turnos` da 403 y deja auditoría
  - Verificado: 24-oct-2026 tests/core.integration.spec.ts, `un paciente no planifica turnos y queda auditoría de denegación` (403 y fila `denegado` con permiso `turnos.planificar`); 52 de 52 pruebas pasan
- [x] T06 · S2 · R · Errores uniformes, conflicto de versión y registro sin datos sensibles
  - Cubre: FR-100-11, FR-100-12, FR-100-15
  - Depende de: T02
  - Hecho cuando: prueba de 409 por versión y revisión de registros sin cuerpos de solicitud
  - Verificado: tests/errors.filter.spec.ts (problem+json, versionActual, registros sin cuerpo/token/campos clínicos) y tests/core.integration.spec.ts (PATCH con versión antigua → 409 ersion_conflicto con ersionActual=2); los 7 puntos de conflicto de versión usan VersionConflictException; 
pm test -- --ci en api: 9 suites, 52 pruebas OK
- [ ] T07 · S2 · R · OpenAPI con permisos y endpoint de salud
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

Core NestJS 0.3.0; pruebas HTTP, comandos, políticas y OpenAPI en api/tests. SQL ejecutado localmente con PGlite; no implica despliegue remoto. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
