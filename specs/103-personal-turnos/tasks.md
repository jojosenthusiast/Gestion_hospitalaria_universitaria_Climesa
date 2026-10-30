# 103. Tareas

- [x] T01 · S1 · R · Migración 0004 de personal y turnos con exclusión
  - Cubre: FR-103-04
  - Depende de: 100-T03, 104-T01
  - Hecho cuando: prueba de traslape concurrente deja un solo turno
  - Verificado: Aplicada en Supabase; 02_concurrencia.sh caso 4: 1 turno guardado de 2 simultáneos
- [x] T02 · S2 · R · CRUD de personal (con y sin cuenta)
  - Cubre: FR-103-01, FR-103-02
  - Depende de: T01, 100-T05
  - Hecho cuando: pruebas de crear, editar con versión e inactivar
  - Verificado: 29-oct-2026 npm test -- --ci en api/: core.integration.spec.ts (directorio de personal crea, edita y exige versión; inactivar) y personal-inscripciones.spec.ts (motivo obligatorio, 409 con versión obsoleta y versionActual); 188 pruebas pasadas, 0 fallidas
- [x] T03 · S2 · R · Crear y mover turnos con duración y descanso por política
  - Cubre: FR-103-04, FR-103-05, FR-103-06, FR-103-14
  - Depende de: T01
  - Hecho cuando: escenarios 1, 2 y 3 pasan
  - Verificado: 29-oct-2026 npm test -- --ci en api/: core.integration.spec.ts "turnos respetan duración, solapamiento y descanso de guardia" (duración 400, traslape 409, descanso 409, mover con versión y cancelar); 188 pruebas pasadas, 0 fallidas
- [ ] T04 · S2 · R · Pantallas de personal en web (W07, W08)
  - Cubre: FR-103-01
  - Depende de: T02, 120-T02
  - Hecho cuando: el administrador crea y edita personal desde la web
  - Avance: 29-oct-2026 `npm test` en web/: 9 archivos, 86 pruebas pasan (web/src/__tests__/personal.test.tsx, 13 pruebas contra un Api falso: listado con filtro de inactivos y estados cargando, vacío y error; sin `personal.gestionar` no hay botones de alta ni edición; crear con POST /personal sin versión ni motivo; editar con PATCH, versión y motivo de 10 caracteres; inactivar con `active` en falso; 409 `version_conflicto` con aviso y recarga; 409 por turnos futuros y 400 de la API con su mensaje; validación previa en español de nombres, teléfono, DUI y motivo); `npx tsc --noEmit` en web/ sin errores. El alta y la edición contra la API real ya están en T02 (api/). Falta W08: ficha de personal con inscripciones y turnos próximos (el formulario de inscripción no existe en la web), y comprobarlo en la web desplegada contra Supabase
- [x] T05 · S2 · E · Inscripciones y bloqueo de roles clínicos sin inscripción
  - Cubre: FR-103-03, FR-103-10
  - Depende de: T02
  - Hecho cuando: programar a un médico vencido se rechaza
  - Verificado: 29-oct-2026 npm test -- --ci en api/: personal-inscripciones.spec.ts (7 pruebas): médico sin inscripción o vencido y mover fuera de vigencia dan 409 inscripcion_no_vigente; ENF también, AST y ADMINISTRATIVO no; turno publicado con inscripción vencida se conserva y se puede cancelar; 188 pruebas pasadas, 0 fallidas
- [x] T06 · S2 · R · Cobertura, publicación con advertencias y estados automáticos
  - Cubre: FR-103-08, FR-103-09, FR-103-13
  - Depende de: T03
  - Hecho cuando: escenario 4 pasa y un turno cambia a "en curso" con el reloj de prueba
  - Verificado: 29-oct-2026 npm test -- --ci en api/: personal-turnos.spec.ts (6 pruebas): hueco de médico 22:00-06:00 en Emergencia (escenario 4), publicar con huecos devuelve advertencias y registra publicado_por y auditoría, un turno pasa a en_curso y completado con el reloj sustituido; 194 pruebas pasadas, 0 fallidas
  - Avance: la cobertura solo evalúa Emergencia (24 h); planta con ocupación, recepción y laboratorio quedan pendientes porque la política no define su horario ni el cruce con camas ocupadas
- [ ] T07 · S3 · R · Planificador web (W16, W17) y mis turnos en Android e iOS (A26, I26)
  - Cubre: FR-103-11
  - Depende de: T06, 121-T02, 122-T02
  - Hecho cuando: un cambio de turno aparece en el teléfono de la persona sin recargar
- [ ] T08 · S3 · R · Médicos de turno públicos
  - Cubre: FR-103-12
  - Depende de: T06
  - Hecho cuando: escenario 5 pasa contra `/publico/medicos-de-turno`
- [x] T09 · S5 · E · Aviso de horas semanales con justificación
  - Cubre: FR-103-07
  - Depende de: T03
  - Hecho cuando: el turno que pasa de 44 h pide justificación y se guarda
  - Verificado: 29-oct-2026 npm test -- --ci en api/: personal-turnos.spec.ts (9 pruebas, 3 de horas semanales): el turno que lleva la semana a 48 h diurnas da 409 horas_semanales_excedidas sin justificación de 10 caracteres y con ella se guarda con advertencias, justificación y auditoría; 44 h exactas, turnos nocturnos y otra semana no piden nada; mover a una semana saturada también la exige; 197 pruebas pasadas, 0 fallidas


## Verificación del corte 0.3.0 · 24-oct-2026

API de personal y turnos con versión; pruebas de duración, solapamiento, descanso, reprogramación y cancelación. Alta de personal y formularios comprobados en la galería web ficticia. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
