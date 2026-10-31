# 120. Tareas

- [x] T01 · S2 · R · Proyecto React con TypeScript, rutas, ingreso con Supabase y despliegue
  - Cubre: FR-120-01, FR-101-01
  - Depende de: ninguna
  - Hecho cuando: la URL desplegada permite ingresar con un usuario de prueba
  - Verificado: 29-oct-2026 de solo lectura, sin imprimir ni guardar credenciales: `https://sghu-web.onrender.com` responde 200; el ingreso con Supabase Auth (`/auth/v1/token?grant_type=password`) de las cuentas demo ADM, REC y LAB devuelve sesión y `GET https://sghu-api.onrender.com/api/v1/auth/me` responde con plataformas que incluyen web y 15, 28 y 11 permisos (los mismos que `permisos.csv`). No se abrió el formulario en un navegador; la pantalla de ingreso se cubre con `web/src/__tests__/acceso.test.tsx` Límite conocido: la evidencia en la nube es una comprobación manual con fecha, no automatizada, y la API corre como `postgres` (omite RLS) hasta que GES-15 fije el rol `sghu_api`. Estructura real de `web/src`: `features` (módulos), `components`, `lib` (api, identidad, tiempo real, supabase) y `design`; el enrutamiento por hash está en `features/shell.tsx` (`App.tsx` solo resuelve el ingreso) y no hay carpetas `api/` ni `routes/` como pedía FR-120-01, que solo cambia con una decisión registrada.
- [x] T02 · S2 · R · Navegación por rol desde `/me`, estados comunes y cliente de API generado
  - Cubre: FR-120-02, FR-120-03, FR-120-06, FR-120-07
  - Depende de: T01, 101-T03
  - Hecho cuando: escenario 1 pasa y cada rol web ve su menú
  - Verificado: 29-oct-2026 `web/src/__tests__/navegacion.test.tsx` (19 pruebas) renderiza el portal con los permisos reales de ADM, JOP, REC, LAB y DPD leídos de `docs/arquitectura/datos/permisos.csv` y comprueba el menú exacto de cada rol y la ausencia de entradas ajenas (el laboratorista ve Inicio, Laboratorio, Inventario y Perfil), que el menú sigue los permisos de `/auth/me` y no el nombre del rol, la ruta ajena con "Sin permiso", el rol sin web (FR-120-03), los estados cargando, vacío, error, sin permiso (403) y sin conexión/reconectando, y el uso del cliente generado (`web/src/lib/generated/openapi.d.ts`). Corrección mínima en `shell.tsx`: las entradas Laboratorio, Inventario, Fila del día, Citas y Accesos excepcionales ahora exigen su permiso y "Mi cuenta" pasa a "Perfil" (W35). `npm test` en `web/`: 6 archivos, 58 pruebas pasan; `npx tsc --noEmit` sin errores. El conflicto por versión y la idempotencia (FR-120-06/07) ya cubiertos en `api-error.test.tsx`
- [x] T03 · S2 · R · Suscripción a Realtime con invalidación y reconexión
  - Cubre: FR-120-04, FR-120-05
  - Depende de: T02, 100-T03
  - Hecho cuando: escenario 2 pasa
  - Verificado: 29-oct-2026 en web/: `npm test` 5 archivos y 42 pruebas pasan (8 nuevas en `tiempo-real.test.tsx`: sin sondeo al avanzar el reloj, evento de canal sube `version`, reconexión de canal con una sola consulta `/eventos?after=`, falla de la recuperación sin reintento por reloj, y escenario 2 con el tablero de camas que vuelve a pedir `/camas` al volver la red); `npx tsc --noEmit` sin errores. Las pruebas nuevas fallaban (7 de 8) contra el `setInterval` anterior. Se eliminó el estado `polling`: quedan en vivo, reconectando y sin conexión.
  - Avance 29-oct-2026: la validación con dos clientes remotos (un cliente sin red durante un cambio de cama en Supabase Realtime real) necesita la nube y **no se ejecutó**; lo automatizado usa Supabase y fetch simulados.
- [ ] T04 · S3 · R · Pantalla pública en modo televisor
  - Cubre: FR-120-09
  - Depende de: T03, 112-T01
  - Hecho cuando: `/publico` se actualiza sola sin sesión
- [ ] T05 · S5 · R · Accesibilidad, cierre por inactividad y pruebas Playwright de la defensa
  - Cubre: FR-120-08, FR-120-10
  - Depende de: T03
  - Hecho cuando: revisión de contraste sin errores y los flujos Playwright pasan


## Verificación del corte 0.3.0 · 24-oct-2026

Módulos actuales y menús ADM/JOP/REC/LAB/DPD revisados en navegador; tipos generados desde OpenAPI. Realtime/reconexión implementados pero pendientes de prueba con dos clientes remotos. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
