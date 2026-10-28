# Despliegue de la API en Render (100-T08)

Qué hace `render.yaml` (en la raíz, donde Render lo busca): publica `sghu-api` (Docker, `api/`) y `sghu-web` (sitio estático, `web/`). Render usa `/salud` como health check (responde 503 si la base no conecta, y el despliegue se marca fallido) y inyecta `PORT`; la API ya escucha en `0.0.0.0`.

## Variables (se escriben a mano en el panel de Render)

| Variable | Valor | Nota |
|---|---|---|
| `SUPABASE_URL` | URL del proyecto | pública |
| `SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_…` | pública |
| `SUPABASE_SECRET_KEY` | clave secreta del proyecto | **solo servidor**, nunca en `VITE_` ni en las apps |
| `DATABASE_URL` | cadena del **pooler** de Supabase | ver abajo |
| `WEB_APP_URL` | ya fijada: `https://sghu-web.onrender.com` | CORS admite un solo origen |

## Web (servicio `sghu-web`)

Se compila con `npm ci && npm run build` y las variables `VITE_*` quedan **dentro del bundle**: solo valores públicos. `VITE_API_BASE_URL` ya apunta a `https://sghu-api.onrender.com/api/v1`. A mano: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. La regla de rewrite `/* → /index.html` hace que las rutas del SPA no den 404.

**Por qué no hay dependencia circular:** los nombres fijan las URLs públicas, así que cada servicio ya conoce la del otro. Si Render dice que un nombre está tomado y le añade sufijo, cambia `WEB_APP_URL` y `VITE_API_BASE_URL` juntos y vuelve a desplegar ambos.

## Dos puntos que suelen romper el despliegue

1. **IPv6.** La conexión directa de Supabase (`db.<ref>.supabase.co`) es solo IPv6 y Render no la alcanza. Usa la cadena del *Session pooler* (`aws-0-<region>.pooler.supabase.com:5432`, usuario `sghu_api.<ref>`).
2. **Migraciones.** El despliegue no migra. `/salud` solo ejecuta `SELECT 1`, así que basta con que `DATABASE_URL` conecte; pero el resto de la API necesita `supabase/migrations` aplicadas al proyecto remoto y la contraseña de `sghu_api` fijada (tarea GES-15).

## Verificación (criterio de T08)

`GET https://<servicio>.onrender.com/salud` → 200 con la base de Supabase conectada. El plan `free` duerme tras 15 minutos sin tráfico; la primera llamada tarda ~1 minuto.

## Mantener la API despierta (plan free)

El plan `free` duerme la API tras 15 minutos sin tráfico y la primera llamada tarda ~1 minuto. Para ambulancia eso es un riesgo: el paramédico puede ser quien llame cuando nadie más tiene la web abierta (la web consulta `/eventos` cada 5 s mientras hay una sesión abierta, pero sin sesiones no hay tráfico).

Mitigación sin costo:

1. Crea un monitor externo gratuito (UptimeRobot, cron-job.org u otro) con `GET https://sghu-api.onrender.com/salud` cada 5 minutos.
2. `/salud` ejecuta `SELECT 1`, así que también mantiene activa la base de Supabase.

Límites: el ping reduce el riesgo pero no lo elimina (un reinicio de Render sigue costando ~1 minuto). Para uso real con ambulancias, cambiar `plan: free` a `plan: starter` en `render.yaml` (instancia de pago, siempre encendida).

## SSL hacia Supabase (`SELF_SIGNED_CERT_IN_CHAIN`)

El pooler de Supabase firma con su propia CA, que Node no conoce, así que `?sslmode=require` falla. Dos salidas:

1. **Rápida, menos segura:** terminar `DATABASE_URL` en `?uselibpqcompat=true&sslmode=require`. Cifra, pero no verifica la identidad del servidor.
2. **Correcta:** en Supabase, Database → Settings → SSL Configuration, descarga el certificado y pega su contenido PEM completo en la variable `DB_SSL_CA` de Render. Quita `sslmode` de `DATABASE_URL`: la API lo hace sola cuando hay CA y verifica el servidor.
