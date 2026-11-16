# 114. Tareas

- [ ] T01 · S3 · R · Catálogo de niveles, franja urgente y campana en web, Android e iOS
  - Cubre: FR-114-01, FR-114-05, FR-114-06, FR-114-07, FR-114-10
  - Depende de: 120-T03, 121-T03, 122-T03
  - Hecho cuando: escenarios 2 y 3 pasan en las tres plataformas
  - Avance 16-nov-2026 (Fase 2, PR #136, #139, #142): niveles Informativo, Importante y Crítico; audiencia por rol o por área; área **Avisos** propia en web, Android e iOS con filtros **Todos**, **Sin leer** y **Críticos**. Solo el aviso crítico dirigido al rol o al área queda arriba en Inicio hasta **Enterado**, con **Recordarme en 4 h**; quien publica ve cuántas cuentas dieron Enterado, sin nombres. Migración 20261125007000 aplicada (16 avisos pasan a informativo, política de 4 h). Pruebas: `api/tests/fase2-avisos.spec.ts` (8) y `api/tests/avisos-audiencia.spec.ts`. **Sigue abierta**: la franja urgente con sonido y la campana de los escenarios 2 y 3, y la prueba a mano en Android e iOS
- [ ] T02 · S3 · R · Sesión por vencer con cuenta regresiva
  - Cubre: FR-114-08
  - Depende de: 120-T02, 121-T02, 122-T02
  - Hecho cuando: a los 14 minutos de inactividad en web aparece la cuenta regresiva y continuar mantiene la sesión
- [ ] T03 · S5 · E · Aviso crítico a pantalla completa con confirmación, pausa y escalamiento
  - Cubre: FR-114-02, FR-114-03, FR-114-04, FR-114-09
  - Depende de: T01, 107-T06
  - Hecho cuando: escenario 1 pasa y un crítico sin confirmar escala a los 5 minutos con el reloj de prueba
  - Avance 16-nov-2026 (Fase 2, PR #136): el aviso crítico persistente con **Enterado** auditado y recordatorio a las 4 h cubre parte de la confirmación. **Sigue abierta**: la pantalla completa con sonido, la pausa de 2 minutos y el escalamiento a los 5 minutos
