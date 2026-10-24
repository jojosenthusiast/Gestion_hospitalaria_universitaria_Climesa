# 113. Tareas

- [ ] T01 · S2 · R · Tablero inicial con tarjetas de camas, turnos y pacientes y marcadores de semana
  - Cubre: FR-113-01, FR-113-03, FR-113-06
  - Depende de: 104-T02, 103-T03, 120-T02
  - Hecho cuando: el tablero se ve en la web desplegada para el avance
- [ ] T02 · S3 · R · Tarjetas en vivo y bandejas por rol
  - Cubre: FR-113-02, FR-113-04
  - Depende de: T01
  - Hecho cuando: escenario 1 pasa
- [ ] T03 · S5 · R · Completar tarjetas de laboratorio, fila y ambulancia
  - Cubre: FR-113-01
  - Depende de: T02, 107-T03, 105-T02, 109-T04
  - Hecho cuando: todas las tarjetas tienen datos reales y escenario 2 pasa
- [ ] T04 · S5 · E · Indicadores por rango de fechas (W33)
  - Cubre: FR-113-05
  - Depende de: T03
  - Hecho cuando: los cinco indicadores se calculan sobre datos de prueba con valores esperados
