# 105. Fila del día y citas

**Estado:** En revisión · **Semanas:** S3, S4 · **Depende de:** 102, 103, 104 · **Investigación:** R03; Aldara 3.3; D-033, D-035

## Objetivo

Dos formas de llegar a consulta general: el número de fila del día (el "turno" que consulta el paciente) y la cita agendada o pedida desde la app. Ambas en tiempo real para recepción, consultorio, paciente y pantalla pública.

## Alcance
- Dentro: emisión de números por servicio y día, llamado a consultorio, estados, mi número en la app, agenda por médico, disponibilidad, solicitudes del paciente, confirmación, cancelación, pantalla pública de llamados.
- Fuera: recordatorios por SMS (F), lista de espera de citas (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-105-01 | Cuando recepción emite un número, el sistema debe asignar el siguiente número del servicio para el día, único y sin huecos, aunque se emitan varios a la vez. | R | REQ-ROL-03; RN-18; D-063 |
| FR-105-02 | El sistema debe reiniciar la numeración cada día a la medianoche local. | R | RN-18 |
| FR-105-03 | Cuando el médico o asistente llama un número, el sistema debe asociarlo al consultorio y avisar en vivo al paciente y a la pantalla pública. | R | REQ-ROL-04; REQ-PLT-06 |
| FR-105-04 | El sistema debe permitir solo las transiciones en espera, llamado, en atención, atendido, no se presentó. | R | RN-19 |
| FR-105-05 | Si un número se llama tres veces sin presentarse, entonces el sistema debe marcarlo "no se presentó". | E | RN-19 |
| FR-105-06 | Mientras el paciente tiene un número activo, la app debe mostrar el número, cuántos faltan y el consultorio al ser llamado. | R | REQ-ROL-04 |
| FR-105-07 | El sistema debe agendar citas por médico sin traslapes, garantizado por la base de datos. | R | REQ-CON-02; RN-20 |
| FR-105-08 | Cuando un paciente verificado pide una cita, el sistema debe crearla como "solicitada" hasta que recepción la confirme o rechace con motivo. | R | D-033; RN-20 |
| FR-105-09 | El sistema debe mostrar horarios libres por médico y fecha, calculados desde sus turnos y citas. | R | REQ-CON-02 |
| FR-105-10 | El paciente debe poder cancelar su cita hasta 2 h antes. | R | RN-21 |
| FR-105-11 | La pantalla pública debe mostrar los números llamados y su consultorio sin nombres. | E | REQ-PRV-01 |
| FR-105-12 | Cuando una cita confirmada llega a su hora, recepción debe poder convertirla en atención sin emitir número. | R | REQ-CON-02 |

## Escenarios de aceptación

1. **Emisión concurrente.** Dados 50 pedidos simultáneos de número para consulta general, entonces se emiten del 1 al 50 sin repetidos ni huecos.
2. **Llamado.** Dado el número 12 de Ana, cuando el asistente lo llama al C-102, entonces el teléfono de Ana vibra con "Pasa al consultorio C-102" y la pantalla pública muestra "12 → C-102".
3. **Cita solicitada.** Dado un paciente verificado, cuando pide cita con el Dr. López el martes 10:00, entonces recepción la ve en vivo y al confirmarla el paciente recibe aviso.
4. **Traslape de citas.** Dadas dos recepcionistas agendando al mismo médico a la misma hora, entonces solo una cita queda.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-18 a RN-21. Datos: `CONTADOR_FILA`, `TICKET_FILA`, `CITA`.
- Endpoints: spec 105. Pantallas: W28, W29, W34, A05, A06, I05, I06, A31, A32, A40, A20, I20.

## Preguntas abiertas
Ninguna.
