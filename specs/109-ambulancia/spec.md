# 109. Ambulancia

**Estado:** En revisión · **Semanas:** S3, S4, S5 · **Depende de:** 102, 103 · **Investigación:** R04 (prehospital, transferencias); D-041, D-042, D-056, D-058

## Objetivo

Recurso crítico del curso: una sola ambulancia con solicitud y despacho en tiempo real, estados Disponible, En Servicio y En Mantenimiento, y bitácora filtrable. Extra pedido por el equipo: la tripulación envía la información del paciente antes de llegar, aunque pierda señal, y su ubicación en vivo.

## Alcance
- Dentro: unidad única, estados, solicitudes (paciente y teléfono), confirmación, despacho con bloqueo, hitos, reporte prehospital sin conexión, recepción en emergencia, mantenimiento, bitácora con filtros y privacidad, ubicación en vivo.
- Fuera: varias unidades (F; el modelo ya lo permite), facturación del servicio (F), integración con el 911 (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-109-01 | El sistema debe tener una única unidad con estado Disponible, En Servicio o En Mantenimiento, visible en vivo para despacho, tripulación y emergencia. | R | REQ-AMB-01, 02; RN-28 |
| FR-109-02 | Cuando un paciente verificado pide ambulancia, el sistema debe registrar la solicitud "por confirmar" con ubicación, motivo y teléfono, y mostrar el aviso del 911. | R | D-033, D-058; RN-33 |
| FR-109-03 | Recepción debe poder registrar solicitudes recibidas por teléfono. | R | D-042 |
| FR-109-04 | Cuando despacho confirma y despacha, el sistema debe pasar la unidad a En Servicio en la misma transacción, solo si estaba Disponible. | R | RN-29 |
| FR-109-05 | Si dos personas despachan a la vez, entonces una debe confirmarse y la otra recibir "la ambulancia ya fue despachada". | R | REQ-AMB-05; D-063 |
| FR-109-06 | Mientras no haya paramédico con turno en curso, la unidad no debe poder estar Disponible. | R | RN-30 |
| FR-109-07 | La tripulación debe registrar los hitos en orden (salida, en escena, trasladando, en hospital, finalizado) y poder finalizar sin traslado con motivo. | R | RN-32 |
| FR-109-08 | Cuando se finaliza un servicio, la unidad debe volver a Disponible. | R | RN-32 |
| FR-109-09 | El Jefe de Operaciones debe poder poner y quitar mantenimiento con motivo, solo sin servicio activo. | R | RN-31 |
| FR-109-10 | La tripulación debe enviar un reporte prehospital (motivo, signos, prioridad, hora estimada); si no hay señal, se guarda cifrado en el teléfono y se reenvía con la misma clave. | E | REQ-AMB-04; D-041; RN-34 |
| FR-109-11 | Cuando llega un reporte prehospital, emergencia debe recibirlo en vivo y por push. | E | D-041 |
| FR-109-12 | La tripulación debe poder registrar un paciente sin identidad desde el servicio. | R | spec 102 FR-102-05 |
| FR-109-13 | Mientras haya servicio activo, la app de la tripulación debe enviar su ubicación cada 10 s y el despacho verla en un mapa. | E | D-041 |
| FR-109-14 | El sistema debe mostrar una bitácora filtrable por fecha, tipo, estado final, prioridad, tripulación, municipio y tiempo de respuesta. | R | REQ-AMB-03; D-056 |
| FR-109-15 | La bitácora debe ocultar los datos del paciente a quien no tenga relación de atención. | R | REQ-PRV-02; D-056 |
| FR-109-16 | El paciente debe ver en vivo el estado de su solicitud y los hitos. | R | REQ-ROL-04 |
| FR-109-17 | Cuando un servicio termina "en hospital", recepción debe poder crear la admisión con origen ambulancia. | R | D-038 |

## Escenarios de aceptación

1. **Despacho único.** Dada la unidad Disponible y dos solicitudes confirmadas, cuando dos personas despachan a la vez, entonces solo un servicio queda activo y la unidad está En Servicio.
2. **Sin paramédico.** Dado que no hay paramédico de turno, cuando se intenta poner Disponible, entonces se rechaza.
3. **Sin señal.** Dado el paramédico sin conexión, cuando envía el reporte prehospital, entonces queda en cola; al volver la señal se envía una sola vez y emergencia lo recibe.
4. **Paciente sigue su ambulancia.** Dada una solicitud de Ana desde iOS, cuando se despacha y avanza, entonces Ana ve "confirmada", "en camino" y "llegó" sin recargar.
5. **Bitácora privada.** Dado un Jefe de Operaciones sin relación con el paciente, cuando filtra la bitácora, entonces ve tiempos y destinos pero no el nombre del paciente.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-28 a RN-35. Datos: `UNIDAD`, `SOLICITUD_AMBULANCIA`, `SERVICIO`, `HITO`, `REPORTE_PREHOSPITAL`, `UBICACION`.
- Endpoints: spec 109. Pantallas: W18, W19, A36, A54, A70 a A74, A09, I09, A25, I25.

## Preguntas abiertas
Ninguna.
