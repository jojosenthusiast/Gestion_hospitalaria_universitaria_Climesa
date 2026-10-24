# ADR-0004. Autenticación, autorización y acceso a datos

**Estado:** Aceptada (17-oct-2026). Decisiones: D-010, D-015, D-031, D-032, D-061.

## Autenticación
Supabase Auth con correo y contraseña. El paciente se registra solo (D-032). El personal no se registra: el Administrador lo invita desde la web y la API crea la cuenta con la API administrativa de Supabase. La API valida el JWT de Supabase con sus llaves públicas (JWKS) y acepta solo el emisor y la audiencia configurados.

## Autorización
1. Roles y permisos viven en tablas de la API (`acceso.rol`, `acceso.permiso`, `acceso.asignacion`), no en el token. El token solo identifica.
2. Cada endpoint declara un permiso (`pacientes.buscar`, `camas.asignar`, `ambulancia.despachar`). El código nunca pregunta "¿es médico?".
3. Los permisos clínicos además exigen contexto: relación de atención activa con el paciente, o acceso temporal aprobado (D-031).
4. Un "gancho" de Supabase Auth agrega al token la lista de canales de Realtime que el usuario puede escuchar; solo para Realtime, nunca para autorizar la API.

## Acceso a datos
SQL directo con Npgsql y migraciones en `supabase/migrations` (se mantiene D-015). Razones: las invariantes del dominio (exclusión de camas, traslape de turnos, bloqueos) son SQL nativo de PostgreSQL y se prueban mejor así. Las consultas recursivas se escriben como CTE recursivas.

## Consecuencias
Las tablas de negocio tienen RLS activado sin políticas para `anon` y `authenticated` (todo denegado); la API usa un rol propio con permisos mínimos. La auditoría registra quién, qué, a quién, resultado y motivo.
