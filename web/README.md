# Portal web CLIMESA (React + TypeScript + Vite)

Portal administrativo para Administrador, Jefe de Operaciones, Recepción, Laboratorio y Delegado de protección de datos. Reglas de trabajo en [AGENTS.md](AGENTS.md); instalación completa y entorno demo en el [README raíz](../README.md).

## Requisitos

- Node.js 22 o superior y npm.
- La API en ejecución (ver [../api/README.md](../api/README.md)) o la del entorno demo.

## Instalación y ejecución

```sh
cd web
npm ci
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
npm run dev              # http://localhost:5173
```

Usa `npm ci` (no `npm install`) para respetar `package-lock.json`.

## Variables de entorno

Solo variables `VITE_*`: quedan dentro del bundle, así que nunca llevan una clave secreta ni `service_role`. Vite lee `.env` y `.env.local`; ninguno se sube.

| Variable | Secreta | De dónde sale |
|---|---|---|
| `VITE_SUPABASE_URL` | No | Supabase, Project Settings, API (ya viene en el ejemplo) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No | Clave publicable de Supabase (ya viene en el ejemplo) |
| `VITE_API_BASE_URL` | No | URL de la API con prefijo; `http://localhost:3000/api/v1` en local, o la del entorno demo |

## Scripts

```sh
npm run dev            # servidor de desarrollo
npm run build          # tsc -b && vite build
npm test               # Vitest (jsdom)
npm run api:generate   # tipos de la API desde ../contrato/openapi.json
npm run build:design   # compilación con las galerías de diseño
```

Antes de entregar un cambio corre `npm test`, `npx tsc --noEmit` y `npm run build`.

## Revisar el diseño sin credenciales

Con el servidor abierto: http://localhost:5173/work-preview.html (módulos por rol, con datos ficticios en memoria) y http://localhost:5173/design-preview.html (ingreso y activación). No escriben en Supabase.

## Invitaciones

Un administrador inicia sesión, invita a una persona y esta establece su contraseña desde el enlace del correo. La ruta de aceptación es `http://localhost:5173/aceptar-invitacion` y debe estar autorizada en Supabase, Authentication, URL Configuration, Redirect URLs.

## Tiempo real

La web se suscribe a los canales de `/auth/me` y vuelve a pedir lo que cambió; no hay sondeo periódico. Catálogo de eventos en [../docs/arquitectura/tiempo-real.md](../docs/arquitectura/tiempo-real.md).