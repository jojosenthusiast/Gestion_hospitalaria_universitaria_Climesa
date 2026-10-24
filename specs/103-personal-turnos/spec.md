# 103. Personal de salud y turnos

**Estado:** En revisión · **Semanas:** S2, S3, S4 · **Depende de:** 100, 101, 104 · **Investigación:** R17; Código de Trabajo Art. 161 y siguientes; D-053, D-054

## Objetivo

CRUD del personal de salud (avance) y control de turnos del personal (regla de negocio 2 del curso): registro y visualización de horarios de doctores, enfermeras, alergistas, emergencia, asistentes, recepcionistas y otros, con reglas que impiden turnos imposibles.

## Alcance
- Dentro: personal (con o sin cuenta), tipos y especialidades, inscripciones con vigencia, turnos, publicación, cobertura mínima, mis turnos, médicos de turno públicos.
- Fuera: planilla y nómina (F, R22), intercambio de turnos entre personas (F), marcación de asistencia (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-103-01 | El sistema debe permitir crear, ver, editar e inactivar personal de salud con tipo, especialidad y área. | R | avance "CRUD de personal de salud" |
| FR-103-02 | El sistema debe permitir registrar personal sin cuenta de usuario (motorista, limpieza) para efectos de turnos. | R | D-053 |
| FR-103-03 | El sistema debe registrar inscripciones profesionales (junta, número, vigencia) por persona. | E | R17; D-012 |
| FR-103-04 | Cuando se crea o mueve un turno, el sistema debe rechazar traslapes de la misma persona, garantizado por la base de datos. | R | RN-12; D-063 |
| FR-103-05 | Si un turno dura menos de 4 h o más de 12 h (24 h en guardia médica), entonces el sistema debe rechazarlo. | R | RN-12 |
| FR-103-06 | Si entre dos turnos de una persona hay menos descanso del mínimo vigente, entonces el sistema debe rechazar el turno. | R | RN-13 |
| FR-103-07 | Cuando una persona supera 44 h semanales diurnas, el sistema debe advertir y exigir justificación sin bloquear. | E | RN-14 |
| FR-103-08 | El sistema debe calcular la cobertura por área y hora contra los mínimos vigentes y mostrar los huecos. | R | RN-15 |
| FR-103-09 | Cuando el Jefe de Operaciones publica un rango con huecos de cobertura, el sistema debe advertir y registrar quién publicó. | R | REQ-ROL-05; RN-15 |
| FR-103-10 | Si una persona sin inscripción vigente se programa en un rol clínico, entonces el sistema debe rechazarlo. | E | RN-16 |
| FR-103-11 | El sistema debe mostrar a cada persona sus turnos publicados y avisarle en tiempo real si cambian. | R | REQ-TUR-01 |
| FR-103-12 | El sistema debe publicar los médicos de turno (nombre, especialidad, área) como información pública. | R | REQ-TUR-02, RN-17 |
| FR-103-13 | Cuando un turno empieza o termina, el sistema debe actualizar su estado (en curso, completado) sin intervención. | R | D-054 |
| FR-103-14 | Las reglas de duración, descanso, horas y cobertura deben ser políticas con vigencia, no constantes. | R | D-005 |

## Escenarios de aceptación

1. **Traslape.** Dada la enfermera Ana con turno de 07:00 a 15:00, cuando se le asigna otro de 14:00 a 22:00, entonces se rechaza con "traslapa con su turno de 07:00 a 15:00".
2. **Traslape concurrente.** Dados dos jefes creando al mismo tiempo turnos solapados para la misma persona, entonces solo uno se guarda.
3. **Descanso.** Dado un médico que sale de guardia de 24 h a las 07:00, cuando se le programa a las 15:00, entonces se rechaza por descanso mínimo de 12 h.
4. **Hueco de cobertura.** Dada Emergencia sin médico de 22:00 a 06:00, cuando se publica la semana, entonces aparece la advertencia y queda registrada.
5. **Pública.** Dado un médico con turno en curso, cuando cualquiera abre la pantalla pública, entonces ve su nombre, especialidad y área.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-12 a RN-17. Datos: `PERSONA_PERSONAL`, `INSCRIPCION`, `TURNO`.
- Endpoints: spec 103 en la matriz RBAC. Pantallas: W07, W08, W16, W17, A26, I26, W34.

## Preguntas abiertas
Ninguna.
