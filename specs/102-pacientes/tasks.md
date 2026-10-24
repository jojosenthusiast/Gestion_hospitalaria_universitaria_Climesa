# 102. Tareas

- [x] T01 · S1 · R · Migración 0003 de pacientes portada del legado
  - Cubre: FR-102-03, FR-102-04, FR-102-12
  - Depende de: 100-T03
  - Hecho cuando: el índice parcial del DUI rechaza duplicados en una prueba concurrente
  - Verificado: Aplicada en Supabase; supabase/pruebas/02_concurrencia.sh caso 5: 1 DUI registrado de 2 simultáneos
- [x] T02 · S2 · R · Portar dominio: claves fonéticas, DUI, expediente, identidad provisional
  - Cubre: FR-102-04, FR-102-05
  - Depende de: T01
  - Hecho cuando: pruebas de dominio del legado pasan en el módulo nuevo
- [x] T03 · S2 · R · CRUD: buscar, registrar tras buscar, ver, editar con historial, inactivar
  - Cubre: FR-102-01, FR-102-02, FR-102-06, FR-102-07, FR-102-08, FR-102-11
  - Depende de: T02, 100-T05
  - Hecho cuando: escenarios 1, 2 y 4 pasan como pruebas de integración
- [x] T04 · S2 · R · Filtrado de campos por permiso y contexto
  - Cubre: FR-102-10
  - Depende de: T03
  - Hecho cuando: la misma ficha devuelve campos distintos para REC, LAB y PAC según `privacidad.md`
- [ ] T05 · S2 · R · Pantallas de pacientes en web (W26) y Android (A30)
  - Cubre: FR-102-01, FR-102-02
  - Depende de: T03, 120-T02, 121-T02
  - Hecho cuando: recepción busca, registra y edita desde web y Android
- [ ] T06 · S4 · R · Registro provisional desde la app del paramédico (A73)
  - Cubre: FR-102-05
  - Depende de: T03, 109-T04
  - Hecho cuando: escenario 3 pasa en Android
- [ ] T07 · S4 · E · Casos de posible duplicado
  - Cubre: FR-102-09
  - Depende de: T03
  - Hecho cuando: un registro parecido abre caso y no fusiona


## Verificación del corte 0.3.0 · 24-oct-2026

backend/test/core.integration.spec.ts y patients.service.spec.ts: fonética, DUI, búsqueda previa por actor, versiones, historial, privacidad REC/LAB/PAC e identidad provisional. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
