# 113. Tareas

- [ ] T01 · S2 · R · Tablero inicial con tarjetas de camas, turnos y pacientes y marcadores de semana
  - Cubre: FR-113-01, FR-113-03, FR-113-06
  - Depende de: 102-T03, 103-T02, 120-T02
  - Hecho cuando: el tablero se ve en la web desplegada para el avance, con conteos directos de camas, personal y pacientes (las vistas en vivo llegan en T02)
  - Avance: 29-oct-2026 `npm test` en web/: 9 archivos, 82 pruebas pasan (web/src/__tests__/tablero.test.tsx cubre tarjetas de camas libres, ocupadas y en limpieza, turnos en curso y pacientes con datos del API, marcadores "Disponible en la semana 4" para ambulancia, fila y laboratorio, estados cargando, error con reintento, vacío y sin permiso `metricas.ver`, y nueva petición al cambiar la versión de tiempo real); `npx tsc --noEmit` en web/ y api/ sin errores; `npm test -- --ci` en api/ incluye la prueba de `GET /inicio` con camas en limpieza, turnos en curso y pacientes solo agregados. Falta para marcarla: verlo en la web desplegada (no hay despliegue en esta sesión) y la tarjeta de huecos de cobertura de turnos (FR-113-01)
- [ ] T02 · S4 · R · Tarjetas en vivo y bandejas por rol
  - Cubre: FR-113-02, FR-113-04
  - Depende de: T01
  - Hecho cuando: escenario 1 pasa
- [ ] T03 · S4 · R · Completar tarjetas de laboratorio, fila y ambulancia
  - Cubre: FR-113-01
  - Depende de: T02, 107-T03, 105-T02, 109-T04
  - Hecho cuando: todas las tarjetas tienen datos reales y escenario 2 pasa
- [ ] T04 · S5 · E · Indicadores por rango de fechas (W33)
  - Cubre: FR-113-05
  - Depende de: T03
  - Hecho cuando: los cinco indicadores se calculan sobre datos de prueba con valores esperados
