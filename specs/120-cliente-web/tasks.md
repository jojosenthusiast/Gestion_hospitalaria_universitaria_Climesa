# 120. Tareas

- [ ] T01 · S1 · R · Proyecto React con TypeScript, rutas, ingreso con Supabase y despliegue
  - Cubre: FR-120-01, FR-101-01
  - Depende de: ninguna
  - Hecho cuando: la URL desplegada permite ingresar con un usuario de prueba
- [x] T02 · S2 · R · Navegación por rol desde `/auth/me`, estados comunes y cliente de API generado
  - Cubre: FR-120-02, FR-120-03, FR-120-06, FR-120-07
  - Depende de: T01, 101-T03
  - Hecho cuando: escenario 1 pasa y cada rol web ve su menú
- [ ] T03 · S2 · R · Suscripción a Realtime con invalidación y reconexión
  - Cubre: FR-120-04, FR-120-05
  - Depende de: T02, 100-T03
  - Hecho cuando: escenario 2 pasa
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
