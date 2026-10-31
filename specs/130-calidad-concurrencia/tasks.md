# 130. Tareas

- [ ] T01 · S3 · R · Proyecto de pruebas con PostgreSQL real y ayudante de concurrencia
  - Cubre: FR-130-02
  - Depende de: 100-T01
  - Hecho cuando: una prueba concurrente de ejemplo corre en local y en CI
- [ ] T02 · S3 · R · Integración continua en GitHub
  - Cubre: FR-130-03
  - Depende de: T01, 120-T01, 121-T01
  - Hecho cuando: un PR muestra el estado de todas las verificaciones
- [ ] T03 · S3 · R · Pruebas de arquitectura de módulos
  - Cubre: FR-130-05
  - Depende de: 100-T02
  - Hecho cuando: referenciar el interior de otro módulo rompe la compilación de pruebas
- [ ] T04 · S5 · R · Las siete pruebas de concurrencia de ADR-0007
  - Cubre: FR-130-01
  - Depende de: 108-T04, 109-T03, 103-T03, 105-T01, 111-T02
  - Hecho cuando: las siete pasan 20 veces seguidas sin fallos intermitentes
- [ ] T05 · S5 · R · Script de demostración de concurrencia
  - Cubre: FR-130-04
  - Depende de: T04
  - Hecho cuando: escenario 1 pasa contra la API desplegada
- [x] T06 · S2 · R · Lista de pruebas manuales por pantalla
  - Cubre: FR-130-06
  - Depende de: ninguna
  - Hecho cuando: el equipo de pruebas tiene la lista escrita
  - Verificado: 29-oct-2026 `docs/pruebas/pruebas-manuales.md` (escrito a mano, no generado por herramienta) existe y cubre, por rol web (ADM, JOP, REC, LAB, DPD), las pantallas web implementadas (W01, W02, W03/W04, W05/W06, W07, W09, W12, W16/W17, W18, W26, W32, W35) con pasos, resultado esperado y requisito de nube/dispositivo/2 sesiones; los casos se contrastaron con `web/src/features/shell.tsx`, `permisos.csv` e `inventario-pantallas.md`. Todos los casos están en estado "sin ejecutar": la ejecución con el equipo de pruebas sigue pendiente y no se afirma como hecha.


## Verificación del corte 0.3.0 · 24-oct-2026

architecture.spec.ts verifica imports públicos entre módulos y guardas/permisos de todos los endpoints de negocio; un import interno hace fallar la prueba. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
