# Respaldo y restauración del entorno demo

Cubre el hallazgo PRO-09 de la auditoría del 13-nov-2026. El entorno demo es el proyecto Supabase de CLIMESA (PostgreSQL 17) y el servicio `sghu-api` de Render. Todos los datos son ficticios, pero el respaldo trae cuentas, roles y auditoría: trátalo como información sensible.

Lo ejecuta la persona dueña del proyecto Supabase. Ningún agente ni flujo de CI se conecta al remoto.

## Cuándo respaldar

- Antes de aplicar a mano una migración en el remoto (ver [ges-15-supabase-remoto.md](../desarrollo/ges-15-supabase-remoto.md)).
- Antes de cada presentación o defensa y antes de borrar o rotar las cuentas demo.
- Al menos una vez por semana mientras el proyecto siga activo.

El plan gratuito de Supabase no tiene restauración a un punto en el tiempo ni respaldos diarios descargables. Este procedimiento es la única copia.

## Qué necesitas

- Supabase CLI. Ya viene en la API: desde `api/`, `npx supabase --version` (paquete `supabase` de `devDependencies`). Requiere Docker en ejecución, porque `db dump` usa la imagen de Postgres.
- `psql` 17 para restaurar y comprobar (cliente de PostgreSQL 17; la imagen `postgres:17-bookworm` de `compose.test.yaml` lo trae).
- La cadena de conexión del dueño: Supabase → **Connect** → *Session pooler* (puerto 5432), usuario `postgres.<ref>`. No uses `sghu_api` para respaldar: no puede leer todos los esquemas.

La contraseña nunca va al repositorio, a un archivo `.env` versionado ni al historial del shell. Defínela solo en la sesión:

```bash
read -rs PGPASSWORD && export PGPASSWORD
export DB_URL='postgresql://postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432/postgres'
```

## Respaldo

Guarda los archivos **fuera del repositorio** (por ejemplo, `~/respaldos-climesa/AAAA-MM-DD/`). Son tres archivos, como en la guía oficial de Supabase (*Backup and restore using the CLI*):

```bash
mkdir -p ~/respaldos-climesa/$(date +%F) && cd ~/respaldos-climesa/$(date +%F)
npx --prefix <ruta-al-repo>/api supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
npx --prefix <ruta-al-repo>/api supabase db dump --db-url "$DB_URL" -f esquema.sql
npx --prefix <ruta-al-repo>/api supabase db dump --db-url "$DB_URL" -f datos.sql --use-copy --data-only
sha256sum roles.sql esquema.sql datos.sql > SHA256SUMS
```

- `roles.sql`: roles propios, entre ellos `sghu_api` (sin su contraseña).
- `esquema.sql`: esquemas `acceso`, `ambulancia`, `atencion`, `hospitalizacion`, `infra`, `inventario`, `laboratorio`, `metricas`, `pacientes`, `personal`, `plataforma` y `publico`, con funciones, disparadores y políticas RLS.
- `datos.sql`: filas de esos esquemas y de `auth` (cuentas de inicio de sesión).

Copia rápida solo de los datos de negocio, sin Docker (formato propio de `pg_dump`, también 17):

```bash
pg_dump "$DB_URL" -Fc --no-owner --no-privileges \
  -n acceso -n ambulancia -n atencion -n hospitalizacion -n infra -n inventario -n laboratorio \
  -n metricas -n pacientes -n personal -n plataforma -n publico \
  -f climesa-negocio.dump
```

Esta copia no incluye `auth.users`; sirve para revisar o recuperar tablas sueltas, no para reconstruir el proyecto.

## Restauración

Restaura siempre primero en un destino de prueba: un proyecto Supabase nuevo o la base local de `supabase start`. Nunca sobre el proyecto demo sin haber probado el respaldo.

```bash
export DESTINO_URL='postgresql://postgres.<ref-destino>@aws-0-<region>.pooler.supabase.com:5432/postgres'
sha256sum -c SHA256SUMS
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file esquema.sql \
  --command 'SET session_replication_role = replica' \
  --file datos.sql \
  --dbname "$DESTINO_URL"
```

`session_replication_role = replica` evita que los disparadores (auditoría, outbox) se ejecuten otra vez al cargar las filas.

Después de restaurar en el destino:

1. Da contraseña al rol de la API (`alter role sghu_api login password '<nueva>';`), como en el paso 2 de GES-15.
2. Activa el gancho de token `acceso.hook_token` y las URL de Auth, que son configuración del panel y no viajan en el respaldo.
3. Si el destino reemplaza al demo, cambia en Render `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` de `sghu-api`, y `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de `sghu-web`.

Con `pg_dump` en formato propio, una tabla suelta se recupera así:

```bash
pg_restore --data-only --table=<tabla> --schema=<esquema> --dbname "$DESTINO_URL" climesa-negocio.dump
```

## Comprobar que el respaldo sirve

En el destino restaurado:

```bash
psql "$DESTINO_URL" -c "select count(*) from auth.users" \
  -c "select count(*) from pacientes.paciente" \
  -c "select count(*) from plataforma.auditoria" \
  -c "select max(seq) from plataforma.outbox"
```

Los números deben coincidir con los del origen tomados el mismo día. Con la API apuntando al destino, `GET /salud` responde 200 con `"database":"ok"`.

Anota en la tabla de abajo cada prueba de restauración. Un respaldo que nunca se restauró no cuenta como respaldo.

| Fecha | Quién | Origen | Destino | Resultado |
|---|---|---|---|---|
| (pendiente) | | | | |
