# Web (React + TypeScript + Vite)

Lee antes `../AGENTS.md`. Spec base: `specs/120-cliente-web/`. Roles que usan la web: Administrador, Jefe de Operaciones, Recepción, Laboratorio, Delegado de protección de datos (y la pantalla pública sin sesión).

## Estructura (la crea 120-T01)

```
web/
  src/
    api/          cliente generado desde ../contrato/openapi.json con openapi-typescript; no se edita a mano
    auth/         sesión con supabase-js
    realtime/     useCanales.ts: suscripción a canales y invalidación de consultas
    ui/           componentes del sistema de diseño (botón, campo, tabla, franja de aviso, estados)
    features/<modulo>/   páginas y hooks por módulo (pacientes, personal, camas, ...)
    routes.tsx    rutas y menú por permiso
```

## Reglas

- TypeScript estricto. Datos del servidor con TanStack Query; nada de `fetch` suelto en componentes.
- Tiempo real: un evento de Realtime llama `queryClient.invalidateQueries` con la clave que corresponde. Prohibido `setInterval` para refrescar.
- El menú y las acciones se muestran según los permisos de `/api/v1/me`, nunca según el nombre del rol.
- Toda pantalla tiene sus 8 estados (cargando, vacío, error, sin permiso, sin conexión, en vivo, conflicto, sesión por vencer): `docs/diseno/claude-design/04-estados-y-avisos.html`.
- Diseño: abre el HTML del rol en `docs/diseno/claude-design/` (05 a 09) y busca el código de pantalla (W01, W26...). Colores y tipografía de `01-sistema-claro.html` y `02-sistema-oscuro.html`: azul CLIMESA `#0043B2`, Atkinson Hyperlegible Next. Iconos Material Symbols.
- Textos de interfaz en español. Accesible: etiquetas en cada campo, foco visible, contraste AA.
- Las pantallas W40 a W57 son nivel F (fuera del curso): no se construyen.

## Comandos

```bash
cd web
npm ci
npm run dev          # http://localhost:5173
npm run build
npm test             # Vitest
npx openapi-typescript ../contrato/openapi.json -o src/api/schema.d.ts
```

## Variables (`web/.env.local`, nunca se sube)

Ver `.env.example`. Solo variables `VITE_*`; nunca la llave `service_role`.
