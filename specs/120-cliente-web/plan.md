# 120. Plan

- Vite + React 18 + TypeScript estricto; React Router; TanStack Query; supabase-js (Auth y Realtime); cliente HTTP generado desde OpenAPI (`openapi-typescript`); componentes propios según el sistema de diseño de Figma; Leaflet para el mapa de ambulancia.
- `src/realtime/useCanales.ts`: suscribe a los canales de `/me` y traduce eventos a `queryClient.invalidateQueries`.
- Despliegue en Vercel o Azure Static Web Apps con variables `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Pruebas: Vitest para hooks y componentes; Playwright para los flujos de la defensa (tablero vivo, asignación con conflicto, despacho).
