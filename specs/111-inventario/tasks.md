# 111. Tareas

- [x] T01 · S1 · R · Migración de inventario y semilla
  - Cubre: FR-111-01, FR-111-02
  - Depende de: 104-T01
  - Hecho cuando: la semilla carga artículos con lotes en dos bodegas
  - Verificado: Aplicada en Supabase; semilla de 10 artículos con lotes en BOD-CEN y BOD-LAB
- [ ] T02 · S3 · R · Movimientos atómicos sin negativos y sin lotes vencidos
  - Cubre: FR-111-03, FR-111-04, FR-111-05, FR-111-08
  - Depende de: T01
  - Hecho cuando: escenario 1 pasa como prueba concurrente
- [ ] T03 · S3 · R · Alerta de mínimo en vivo y pantallas W22, W23
  - Cubre: FR-111-06
  - Depende de: T02, 120-T03
  - Hecho cuando: escenario 2 pasa
- [ ] T04 · S5 · E · Consumo desde enfermería y laboratorio (A53)
  - Cubre: FR-111-07
  - Depende de: T02, 121-T03
  - Hecho cuando: un consumo desde Android baja la existencia y aparece en el historial
