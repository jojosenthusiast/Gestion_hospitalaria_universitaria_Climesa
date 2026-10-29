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
  - Verificado: 28-oct-2026 `api/tests/patients.service.spec.ts` y `api/tests/patients-dominio.spec.ts`: claves fonéticas y acentos, DUI válido e inválido (sin guion al guardar), expediente ISO 7064 MOD 11-2 para varias secuencias y tres vectores públicos, reglas de nombre, teléfono y correo, identidad provisional con caso positivo y límites de edad. 151 de 151 pruebas pasan en `api/`. No hay un conjunto "del legado" en el repositorio contra el cual compararlas; el criterio se cumple con estas pruebas del dominio.
- [ ] T03 · S2 · R · CRUD: buscar, registrar tras buscar, ver, editar con historial, inactivar
  - Cubre: FR-102-01, FR-102-02, FR-102-06, FR-102-07, FR-102-08, FR-102-11
  - Depende de: T02, 100-T05
  - Hecho cuando: escenarios 1, 2 y 4 pasan como pruebas de integración
  - Verificado: 28-oct-2026 `api/tests/patients-dominio.spec.ts`: escenario 1 (la búsqueda "hernandes basquez jose" devuelve al paciente con motivo "Coincidencia fonética" y solo los campos mínimos), escenario 2 (DUI repetido responde 409 y el detalle nombra el expediente) y escenario 4 (la corrección conserva el valor anterior, el motivo y la versión 2); más `tests/core.integration.spec.ts` (registro tras búsqueda, token vencido o ajeno, 409 por versión, inactivación con historial, hash de búsquedas). Se corrigió un defecto: editar un paciente provisional ya no convierte la fecha `estimada` en `exacta` (prueba en rojo antes de la corrección). El motivo de coincidencia ahora distingue documento, expediente, fecha, nombre y fonética. 151 de 151 pruebas pasan.
- [ ] T04 · S3 · R · Filtrado de campos por permiso y contexto
  - Cubre: FR-102-10
  - Depende de: T03
  - Hecho cuando: la misma ficha devuelve campos distintos para REC, LAB y PAC según `privacidad.md`
  - Avance 28-oct-2026: `api/tests/patients-fichas.spec.ts` verifica los campos de la misma ficha para REC, MED, LAB, PAC dueño, AST, ENF, PAR y JOP, y los 403. **Sigue abierta**: según `privacidad.md` §2, Laboratorio debe ver rangos de edad y sexo (hoy ve la fecha exacta y el sexo), y AST, ENF y LAB deben limitarse a su área o consultorio (hoy leen cualquier ficha). Es una decisión de producto pendiente.
- [ ] T05 · S2 · R · Pantallas de pacientes en web (W26) y Android (A30)
  - Cubre: FR-102-01, FR-102-02
  - Depende de: T03, 120-T02, 121-T02
  - Hecho cuando: recepción busca, registra y edita desde web y Android
  - Avance 28-oct-2026 (solo web, W26): `web/src/__tests__/pacientes.test.tsx` (9 pruebas): la búsqueda muestra candidatos con su motivo de coincidencia, "Registrar paciente" se bloquea sin búsqueda vigente o con el recibo vencido, el registro envía `searchToken` y `searchQuery`, un DUI duplicado muestra el expediente, un conflicto de versión pide recargar, la corrección exige un motivo de al menos 10 caracteres, e inactivar y reactivar envían `active`, versión y motivo. 19 de 19 pruebas web pasan. **Sigue abierta**: falta A30 en Android y comprobar a mano con la cuenta `rec@climesa`.
- [ ] T06 · S4 · R · Registro provisional desde la app del paramédico (A73)
  - Cubre: FR-102-05
  - Depende de: T03, 109-T04
  - Hecho cuando: escenario 3 pasa en Android
- [ ] T07 · S5 · E · Casos de posible duplicado
  - Cubre: FR-102-09
  - Depende de: T03
  - Hecho cuando: un registro parecido abre caso y no fusiona


## Verificación del corte 0.3.0 · 24-oct-2026

api/tests/core.integration.spec.ts y patients.service.spec.ts: fonética, DUI, búsqueda previa por actor, versiones, historial, privacidad REC/LAB/PAC e identidad provisional. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
