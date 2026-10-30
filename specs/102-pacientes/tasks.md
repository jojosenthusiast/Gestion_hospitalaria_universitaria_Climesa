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
- [x] T03 · S2 · R · CRUD: buscar, registrar tras buscar, ver, editar con historial, inactivar
  - Cubre: FR-102-01, FR-102-02, FR-102-06, FR-102-07, FR-102-08, FR-102-11
  - Depende de: T02, 100-T05
  - Hecho cuando: escenarios 1, 2 y 4 pasan como pruebas de integración
  - Verificado: 28-oct-2026 `api/tests/patients-dominio.spec.ts`: escenario 1 (la búsqueda "hernandes basquez jose" devuelve al paciente con motivo "Coincidencia fonética" y solo los campos mínimos), escenario 2 (DUI repetido responde 409 y el detalle nombra el expediente) y escenario 4 (la corrección conserva el valor anterior, el motivo y la versión 2); más `tests/core.integration.spec.ts` (registro tras búsqueda, token vencido o ajeno, 409 por versión, inactivación con historial, hash de búsquedas). Se corrigió un defecto: editar un paciente provisional ya no convierte la fecha `estimada` en `exacta` (prueba en rojo antes de la corrección). El motivo de coincidencia ahora distingue documento, expediente, fecha, nombre y fonética. 151 de 151 pruebas pasan.
- [x] T04 · S3 · R · Filtrado de campos por permiso y contexto
  - Cubre: FR-102-10
  - Depende de: T03
  - Hecho cuando: la misma ficha devuelve campos distintos para REC, LAB y PAC según `privacidad.md`
  - Verificado: 29-oct-2026 `api/tests/patients-fichas.spec.ts` (22 pruebas, en rojo antes del cambio) y `api/tests/patients-dominio.spec.ts`: la política vive en `api/src/patients/patient.privacy.ts` y la aplica `PatientsService`. La misma ficha entrega a REC nombre, fecha, documento, contacto e historial; a MED y al PAC titular lo mismo sin historial; a AST, ENF y PAR nombre, sexo y fecha de nacimiento; a LAB nombre, sexo y `ageRange` por decenios («30-39», «90+») sin fecha exacta, documento ni contacto; a JOP solo nombre y sexo. Contexto: ENF solo abre la ficha de un hospitalizado en una cama de un área donde tiene turno en curso; AST solo la de un número llamado hoy a un consultorio de un área donde tiene turno, o con consulta abierta en él; LAB solo la de un paciente con orden pendiente o en proceso; fuera de eso responde 403 `sin_permiso` (pruebas: dentro del área sí, otra área, sin turno y otro día no). `npm test -- --ci` en api: 225 de 225 pasan; `npx tsc --noEmit` sin errores. Sin migración ni cambio de contrato (la respuesta de la ficha no está tipada en OpenAPI).
  - Alcance: `pacientes.ver_ficha` sigue con contexto `x` en `permisos.csv`; el límite de AST, ENF y LAB se aplica en el servicio por rol, porque cambiar el contexto toca la semilla de acceso (pregunta 31 en `docs/preguntas-abiertas.md`). No hay campo de contacto de emergencia en el esquema, ni se devuelve la cama (§2 los da a ENF en su área), ni la dirección del servicio del PAR, ni el reporte prehospital para ENF de emergencia; quedan para las historias de hospitalización y ambulancia.
- [ ] T05 · S2 · R · Pantallas de pacientes en web (W26) y Android (A30)
  - Cubre: FR-102-01, FR-102-02
  - Depende de: T03, 120-T02, 121-T02
  - Hecho cuando: recepción busca, registra y edita desde web y Android
  - Avance 28-oct-2026 (solo web, W26): `web/src/__tests__/pacientes.test.tsx` (9 pruebas): la búsqueda muestra candidatos con su motivo de coincidencia, "Registrar paciente" se bloquea sin búsqueda vigente o con el recibo vencido, el registro envía `searchToken` y `searchQuery`, un DUI duplicado muestra el expediente, un conflicto de versión pide recargar, la corrección exige un motivo de al menos 10 caracteres, e inactivar y reactivar envían `active`, versión y motivo. 19 de 19 pruebas web pasan. **Sigue abierta**: falta A30 en Android y comprobar a mano con la cuenta `rec@climesa`.
- [ ] T06 · S4 · R · Registro provisional desde la app del paramédico (A73)
  - Cubre: FR-102-05
  - Depende de: T03, 109-T04
  - Hecho cuando: escenario 3 pasa en Android
- [x] T07 · S5 · E · Casos de posible duplicado
  - Cubre: FR-102-09
  - Depende de: T03
  - Hecho cuando: un registro parecido abre caso y no fusiona
  - Verificado: 28-oct-2026 `api/tests/patients-duplicados.spec.ts` (24 pruebas): al registrar un paciente con la misma clave fonética de apellido y nombres y la misma fecha de nacimiento que otro, se abre exactamente un caso `sospechado` en `pacientes.caso_duplicado`, ambos pacientes siguen activos y la respuesta de registro no cambia; una fecha o fonética distinta no abre caso; un DUI repetido sigue dando 409 sin caso; el reintento con la misma clave de idempotencia no duplica el caso; el par se guarda ordenado, por lo que el índice único impide repetirlo. `GET /api/v1/pacientes/casos-duplicado` lista los casos abiertos solo para JOP y REC (los demás roles reciben 403) y audita cada lectura. Sin migración nueva: usa la tabla existente. 175 de 175 pruebas pasan. Alcance: no hay pantalla para revisar los casos ni cambio de estado (descartar o confirmar); quedan para una historia posterior.


## Verificación del corte 0.3.0 · 24-oct-2026

api/tests/core.integration.spec.ts y patients.service.spec.ts: fonética, DUI, búsqueda previa por actor, versiones, historial, privacidad REC/LAB/PAC e identidad provisional. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
