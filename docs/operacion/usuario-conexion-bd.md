# Usuario de conexión de la API a la base

Cubre PRO-08 y API-19 de la auditoría del 13-nov-2026.

## Estado actual

- La migración `20261017000100_plataforma.sql` crea el rol `sghu_api` sin inicio de sesión y le concede solo lo que la API usa (por ejemplo, `select, insert` en `plataforma.auditoria`, nunca `update` ni `delete`).
- En el remoto la API todavía se conecta como `postgres` y hace `SET LOCAL ROLE sghu_api` en cada transacción (`api/src/platform/database.service.ts`). Las consultas corren con los permisos de `sghu_api`, pero la conexión podría salir de ese rol con `RESET ROLE`: un error de código o una inyección tendría privilegios de dueño.
- Lo correcto es que `DATABASE_URL` use el propio `sghu_api` como usuario de inicio de sesión.

## Pasos (los ejecuta la persona dueña del proyecto)

1. En el SQL Editor de Supabase, da contraseña e inicio de sesión al rol. Genera la contraseña con un gestor y no la pegues en el repositorio ni en el chat:

   ```sql
   alter role sghu_api login password '<contraseña larga y aleatoria>';
   ```

2. Comprueba que el rol no es dueño de nada ni supera RLS:

   ```sql
   select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = 'sghu_api';
   -- esperado: rolsuper = false, rolbypassrls = false, rolcanlogin = true
   ```

3. En Render → `sghu-api` → Environment, cambia `DATABASE_URL` al *Session pooler* con ese usuario (host y región salen del botón **Connect** del panel):

   ```
   postgresql://sghu_api.<ref>:<contraseña>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full
   ```

   Con `verify-full`, define también `DB_SSL_CA` con el certificado CA de Supabase (Settings → Database → SSL). Si no, usa `sslmode=require`.

4. Despliega y comprueba `GET https://sghu-api.onrender.com/salud`: debe responder 200 con `"database":"ok"`.

5. Retira a la API cualquier uso de la cadena de `postgres`. Esa cadena queda solo para respaldos ([respaldo-y-restauracion.md](respaldo-y-restauracion.md)) y migraciones manuales.

## Variables obligatorias en producción

Desde la fase 1 la API no arranca con `NODE_ENV=production` si falta alguna de estas variables (`api/src/config/environment.ts`). El mensaje del registro de despliegue dice cuál falta:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` (HTTPS obligatorio) |
| `SUPABASE_PUBLISHABLE_KEY` | llave publicable del proyecto |
| `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`) | llave privada; solo en Render |
| `DATABASE_URL` | la cadena del paso 3 |

Variables de seguridad de la API (`render.yaml` ya las define):

| Variable | Valor en Render | Para qué |
|---|---|---|
| `TRUST_PROXY_HOPS` | `1` | La IP de cada cliente sale de `X-Forwarded-For` del proxy de Render. Sin esto todos los clientes comparten el límite. |
| `RATE_LIMIT_MAX` | `300` | Solicitudes por IP y minuto en toda la API. `/salud` no cuenta. |

## Pendiente fuera de esta fase

`api/src/app.module.ts` aún trae como valor por defecto de `SUPABASE_URL` la URL real del proyecto. En producción ya no se usa, porque la comprobación de arriba exige la variable. Falta quitar ese valor en un cambio a ese archivo (ver `docs/preguntas-abiertas.md`).
