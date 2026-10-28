# Despliegue de la API en Render (100-T08)

Qué hace `render.yaml`: construye `api/Dockerfile` y publica el servicio `sghu-api`. Render usa `/salud` como health check (responde 503 si la base no conecta, y el despliegue se marca fallido) y inyecta `PORT`; la API ya escucha en `0.0.0.0`.

## Variables (se escriben a mano en el panel de Render)

| Variable | Valor | Nota |
|---|---|---|
| `SUPABASE_URL` | URL del proyecto | pública |
| `SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_…` | pública |
| `SUPABASE_SECRET_KEY` | clave secreta del proyecto | **solo servidor**, nunca en `VITE_` ni en las apps |
| `DATABASE_URL` | cadena del **pooler** de Supabase | ver abajo |
| `WEB_APP_URL` | URL pública de la web | CORS admite un solo origen |

## Dos puntos que suelen romper el despliegue

1. **IPv6.** La conexión directa de Supabase (`db.<ref>.supabase.co`) es solo IPv6 y Render no la alcanza. Usa la cadena del *Session pooler* (`aws-0-<region>.pooler.supabase.com:5432`, usuario `sghu_api.<ref>`).
2. **Migraciones.** El despliegue no migra. `/salud` solo ejecuta `SELECT 1`, así que basta con que `DATABASE_URL` conecte; pero el resto de la API necesita `supabase/migrations` aplicadas al proyecto remoto y la contraseña de `sghu_api` fijada (tarea GES-15).

## Verificación (criterio de T08)

`GET https://<servicio>.onrender.com/salud` → 200 con la base de Supabase conectada. El plan `free` duerme tras 15 minutos sin tráfico; la primera llamada tarda ~1 minuto.

