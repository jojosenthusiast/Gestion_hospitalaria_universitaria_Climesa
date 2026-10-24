# Entrega 02 del backend: integración segura con Supabase

La API ya tiene un proveedor de Supabase encapsulado en `backend/src/supabase/`. El servicio usa una clave secreta únicamente en el servidor y no expone esa clave a Android, web ni iOS. La clave moderna `SUPABASE_SECRET_KEY` es la preferida; `SUPABASE_SERVICE_ROLE_KEY` se mantiene como compatibilidad temporal.

La base recuperada ya contiene la migración de pacientes `supabase/migrations/20261017000300_pacientes.sql`, junto con las migraciones de plataforma, acceso, personal, atención, laboratorio, hospitalización, ambulancia, inventario, público y seguridad. Por eso no se creó otra tabla duplicada de pacientes.

La migración de pacientes contempla expediente con dígito verificador, identidad provisional, identificadores exclusivos, historial de cambios, token de búsqueda de diez minutos y casos de posible duplicado. La migración de seguridad habilita RLS y limita el acceso directo; el backend usará la conexión privada configurada para la API.

La conexión remota no se aplicó en esta sesión porque la cuenta conectada no autorizó las operaciones de lectura del proyecto mediante el conector. El código quedó preparado y la base no fue modificada. Antes de conectar una ruta de pacientes, se debe verificar el estado real de esas migraciones en `gvmvmrusscsfbndnbvbr` y después generar los tipos TypeScript desde el esquema vigente.

## Rutas implementadas

- `GET /api/v1/pacientes?query=...&limit=20`: devuelve candidatos mínimos.
- `POST /api/v1/pacientes/busquedas`: registra una búsqueda autenticada y devuelve un token con vigencia de diez minutos.

Ambas rutas exigen un JWT válido de Supabase. El alta definitiva todavía no se habilita: primero debe utilizar el token y resolver el expediente transaccional con su dígito verificador.

## Verificación local

Desde `backend/`:

```text
npm install
npm test -- --runInBand
npm run build
```

La API reporta `supabase: not_configured` mientras no exista un `.env` local con la clave secreta. Esto permite ejecutar el health check sin inventar credenciales ni conectarse a otro proyecto.
