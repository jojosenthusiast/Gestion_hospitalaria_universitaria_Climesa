# 108. Admisión y hospitalización

**Estado:** En revisión · **Semanas:** S2, S4 · **Depende de:** 102, 104, 106 · **Investigación:** R03, R04; legado specs 002 y 006; D-030, D-036 a D-038

## Objetivo

La forma robusta del "administrador de ingresos" (D-030) y el "algoritmo de asignación lógica de habitaciones" de la planta 2 y 3 (criterio de la entrega final): admisión con origen, sugerencias de cama explicadas, asignación sin sobrecupo ni doble asignación aunque dos personas actúen a la vez, traslados con la regla VIP, alta y salida física que dispara la limpieza.

## Alcance
- Dentro: indicación y creación de admisión, sugerencias de cama, asignación, reserva, traslado, autorización de excepciones, notas de enfermería básicas, alta, salida, vista publicada de ocupación.
- Fuera: cuenta del paciente, cargos y facturación (F, legado 006), alta con documentos clínicos completos (F, legado 003).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-108-01 | El sistema debe crear admisiones con origen consulta, emergencia, ambulancia o programada, guardando la referencia del origen. | R | REQ-ROL-06; D-038; RN-09 |
| FR-108-02 | Si el paciente ya tiene una admisión activa, entonces el sistema debe rechazar una nueva. | R | RN-10 |
| FR-108-03 | Cuando se piden sugerencias de cama, el sistema debe aplicar los filtros duros de RN-05 y ordenar según RN-06, devolviendo para cada cama el motivo. | R | REQ-HAB-04; D-036 |
| FR-108-04 | Si no hay VIP libre para quien la pidió, entonces el sistema debe ofrecer semiprivada con aviso; nunca asignar VIP a quien pidió semiprivada sin autorización del Jefe de Operaciones. | R | RN-05 |
| FR-108-05 | Cuando se confirma una cama, la base de datos debe impedir que otra ocupación se traslape con ella. | R | REQ-HAB-03; RN-02 |
| FR-108-06 | Si dos personas asignan la misma cama a la vez, entonces una debe confirmarse y la otra recibir "otra persona tomó esta cama" con la siguiente sugerencia. | R | RN-07; D-063 |
| FR-108-07 | Si dos admisiones de sexo distinto se asignan a la misma habitación semiprivada vacía a la vez, entonces solo una debe confirmarse. | R | RN-05; ADR-0007 |
| FR-108-08 | Cuando un paciente con aislamiento ocupa una semiprivada, la otra cama debe quedar bloqueada mientras dure la ocupación. | R | RN-05 |
| FR-108-09 | El sistema debe permitir reservar una cama para una admisión programada; la reserva vence a las 2 h de la hora prevista. | E | RN-03 |
| FR-108-10 | Si se intenta trasladar a quien ocupa una VIP, entonces el sistema debe rechazarlo. | R | D-037; RN-08 |
| FR-108-11 | Cuando se traslada a quien ocupa una semiprivada, el sistema debe cerrar la ocupación anterior, abrir la nueva y dejar la cama anterior en limpieza en una sola transacción. | R | RN-08 |
| FR-108-12 | El médico tratante debe firmar el alta con inscripción vigente y con cada pendiente asignado a un responsable. | R | RN-11 |
| FR-108-13 | Cuando se registra la salida física, la ocupación debe cerrarse y la cama pasar a limpieza. | R | RN-04; RN-11 |
| FR-108-14 | La habitación asignada a un paciente solo debe ser visible para el paciente, el equipo tratante, recepción, enfermería del área y el Jefe de Operaciones. | R | REQ-PRV-02 |
| FR-108-15 | El sistema debe publicar la vista `v_ocupacion_activa` para infraestructura y métricas, sin datos personales. | R | modelo de datos |
| FR-108-16 | Enfermería del área debe poder registrar notas y signos del paciente hospitalizado. | E | R05 |

## Escenarios de aceptación

1. **Sugerencia explicada.** Dada HAB-203 con una paciente en la cama A y HAB-204 vacía, cuando se admite a otra paciente semiprivada, entonces la primera sugerencia es HAB-203-B con motivo "habitación con ocupante compatible".
2. **Última cama.** Dada una sola cama libre y dos recepcionistas confirmándola a la vez, entonces una queda y la otra ve el conflicto con la siguiente opción.
3. **Aislamiento.** Dado un paciente con aislamiento, cuando se le asigna HAB-205-A, entonces HAB-205-B queda bloqueada y deja de sugerirse.
4. **VIP no se traslada.** Dado un paciente en VIP-302, cuando se intenta trasladar, entonces la acción no aparece en la interfaz y la API responde 409.
5. **Alta y limpieza.** Dada un alta firmada, cuando se registra la salida, entonces la cama pasa a limpieza y el tablero cambia en vivo.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-02 a RN-11. Datos: `ADMISION`, `OCUPACION_CAMA`, `TRASLADO`, `ALTA`, `NOTA_ENFERMERIA`.
- Endpoints: spec 108. Pantallas: W13 a W15, A34, A50, A51, A24, I24.

## Preguntas abiertas
D-037 es una interpretación de la respuesta del equipo; se confirma al aprobar esta spec.
