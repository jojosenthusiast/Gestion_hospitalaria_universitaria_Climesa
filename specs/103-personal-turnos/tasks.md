# 103. Tareas

- [x] T01 · S1 · R · Migración 0004 de personal y turnos con exclusión
  - Cubre: FR-103-04
  - Depende de: 100-T03, 104-T01
  - Hecho cuando: prueba de traslape concurrente deja un solo turno
  - Verificado: Aplicada en Supabase; 02_concurrencia.sh caso 4: 1 turno guardado de 2 simultáneos
- [ ] T02 · S2 · R · CRUD de personal (con y sin cuenta)
  - Cubre: FR-103-01, FR-103-02
  - Depende de: T01, 100-T05
  - Hecho cuando: pruebas de crear, editar con versión e inactivar
- [ ] T03 · S2 · R · Crear y mover turnos con duración y descanso por política
  - Cubre: FR-103-04, FR-103-05, FR-103-06, FR-103-14
  - Depende de: T01
  - Hecho cuando: escenarios 1, 2 y 3 pasan
- [ ] T04 · S2 · R · Pantallas de personal en web (W07, W08)
  - Cubre: FR-103-01
  - Depende de: T02, 120-T02
  - Hecho cuando: el administrador crea y edita personal desde la web
- [ ] T05 · S2 · E · Inscripciones y bloqueo de roles clínicos sin inscripción
  - Cubre: FR-103-03, FR-103-10
  - Depende de: T02
  - Hecho cuando: programar a un médico vencido se rechaza
- [ ] T06 · S2 · R · Cobertura, publicación con advertencias y estados automáticos
  - Cubre: FR-103-08, FR-103-09, FR-103-13
  - Depende de: T03
  - Hecho cuando: escenario 4 pasa y un turno cambia a "en curso" con el reloj de prueba
- [ ] T07 · S3 · R · Planificador web (W16, W17) y mis turnos en Android e iOS (A26, I26)
  - Cubre: FR-103-11
  - Depende de: T06, 121-T02, 122-T02
  - Hecho cuando: un cambio de turno aparece en el teléfono de la persona sin recargar
- [ ] T08 · S3 · R · Médicos de turno públicos
  - Cubre: FR-103-12
  - Depende de: T06
  - Hecho cuando: escenario 5 pasa contra `/publico/medicos-de-turno`
- [ ] T09 · S5 · E · Aviso de horas semanales con justificación
  - Cubre: FR-103-07
  - Depende de: T03
  - Hecho cuando: el turno que pasa de 44 h pide justificación y se guarda


## Verificación del corte 0.3.0 · 24-oct-2026

API de personal y turnos con versión; pruebas de duración, solapamiento, descanso, reprogramación y cancelación. Alta de personal y formularios comprobados en la galería web ficticia. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
