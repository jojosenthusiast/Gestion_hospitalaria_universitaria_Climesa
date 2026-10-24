# Entrega 01 del backend Node.js

Esta entrega establece el punto de partida ejecutable para la API de SGHU-CLIMESA.

## Incluye

- Node.js 22 o superior, TypeScript y NestJS.
- Adaptador HTTP Fastify.
- Configuración por variables de entorno con validación Joi.
- Prefijo configurable de API (`/api/v1`).
- Documentación OpenAPI en `/api/v1/docs` cuando el servicio está en ejecución.
- Health check en `GET /api/v1/health`.
- Prueba unitaria del health check.
- `.env.example` con el proyecto Supabase ya identificado, sin secretos.

## Verificación realizada

Desde `backend/` se ejecutaron correctamente:

```text
npm test -- --runInBand
npm run build
```

Resultado: 1 suite aprobada, 1 prueba aprobada y compilación TypeScript exitosa.

## Ejecutar localmente

1. Copiar `.env.example` como `.env`.
2. Completar las claves necesarias según el entorno. La clave `SUPABASE_SERVICE_ROLE_KEY` nunca debe llegar a Android, web ni iOS.
3. Ejecutar `npm install`.
4. Ejecutar `npm run start:dev`.
5. Abrir `http://localhost:3000/api/v1/health` o `http://localhost:3000/api/v1/docs`.

Todavía no se han creado tablas ni se ha modificado el proyecto remoto de Supabase. La siguiente entrega agregará el módulo de configuración de Supabase y las primeras migraciones versionadas, después de revisar el modelo de pacientes.
