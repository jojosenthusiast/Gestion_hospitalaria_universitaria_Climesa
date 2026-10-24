# Despliegue del core S1/S2

## Estado de esta revisión

La API y la web compilan localmente. La nueva migración `20261024070241_core_semanas_1_2.sql` y todas las anteriores se probaron en PostgreSQL WASM. No se aplicó nada en la nube: las conexiones disponibles de Supabase no exponen el proyecto CLIMESA `gvmvmrusscsfbndnbvbr`. No hay una URL HTTPS de API verificada ni credenciales de base en el entorno. El contenedor y los workflows están preparados, pero no ejecutados aquí.

## Base del proyecto correcto

La carpeta `supabase/` tiene configuración local, migraciones y semilla. Usa la CLI instalada en `api/node_modules/.bin` después de `npm ci --prefix api`. Antes de escribir, verifica en tu cuenta que la referencia coincida con CLIMESA. Las migraciones de `pruebas/` simulan Auth/Realtime y solo se usan en bases de prueba; nunca se aplican al proyecto remoto.

```sh
supabase projects list
supabase link --project-ref gvmvmrusscsfbndnbvbr
supabase db push --dry-run
supabase db push
```

No ejecutes la semilla sobre datos reales. El historial previo afirma que las 13 migraciones originales estaban aplicadas el 17 de octubre; confírmalo contra el remoto antes de aplicar la nueva. No marques esas afirmaciones históricas como revalidadas por esta revisión.

Configura el login de base para la API con el mínimo acceso: `sghu_api` ya tiene permisos por tabla y RLS; la contraseña se establece fuera del repositorio. También puede usarse un login con membresía para `SET ROLE sghu_api`. En el entorno del backend agrega `DATABASE_URL` con `sslmode=verify-full`, y `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY` únicamente para el proveedor de invitaciones. La clave publicable es suficiente para verificar identidad; no sustituye la conexión SQL.

Activa el Custom Access Token Hook `acceso.hook_token` en Auth → Hooks del proyecto remoto. `supabase/config.toml` lo habilita para el entorno local; no demuestra que esté activado remotamente. Configura Site URL y Redirect URLs con el dominio web y `/aceptar-invitacion`. Comprueba correo confirmado, invitación SMTP, registro PAC y perfil de cada rol antes de cerrar la entrega.

## API

```sh
docker compose up --build -d api
```

El contenedor usa `api/.env`, corre como usuario `node` y expone `127.0.0.1:3000`. Colócalo detrás de HTTPS en el servidor elegido. Configura `WEB_APP_URL` con el origen exacto de la web para CORS y correos. `/api/v1/health` solo comprueba proceso; `/salud` debe dar 200 con la base operativa. Una base no configurada responde 503 sin revelar secretos.

## Web y apps

Para compilar web define las variables públicas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_API_BASE_URL` HTTPS y ejecuta `npm ci --prefix web` / `npm run build --prefix web`. Sirve `web/dist` con fallback SPA a `index.html` para `/registro` y `/aceptar-invitacion`. No publiques `work-preview.html` ni fixtures con el build normal.

Android Release requiere `CLIMESA_API_BASE_URL` HTTPS; iOS requiere la misma Build Setting y configuración de firma. Verifica los dos clientes con el backend desplegado. Los binarios y simuladores no se compilaron en esta revisión.

## Concurrencia nativa en un entorno desechable

Con Docker, desde la raíz:

```sh
docker compose -f compose.test.yaml up --wait db
docker compose -f compose.test.yaml exec -T db psql -U postgres -d sghu_test -v ON_ERROR_STOP=1 -f /checks/pruebas/01_invariantes.sql
docker compose -f compose.test.yaml exec -T -e PSQL="psql -U postgres -d sghu_test" db bash /checks/pruebas/02_concurrencia.sh
docker compose -f compose.test.yaml down -v
```

La base usa almacenamiento temporal y no publica puertos. Inicializa Auth/Realtime simulados, las 14 migraciones y la semilla ficticia. El script concurrente exige resultados exactos y falla con código 1 si hay duplicados o faltan registros. Debe ejecutarse una vez por base recién creada. El workflow `postgres-native` reproduce estos pasos. PGlite tiene una sola conexión y sus pruebas no se presentan como carreras nativas.
