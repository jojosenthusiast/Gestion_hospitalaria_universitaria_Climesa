# 110. Privacidad y auditoría

**Estado:** En revisión · **Semanas:** S2, S4, S5 · **Depende de:** 100, 101 · **Investigación:** R21; legado spec 005; LPDP Art. 4, 15-25; Norma 1616 Art. 41-43, 55-57; `docs/arquitectura/privacidad.md`

## Objetivo

La "correcta aplicación de la política de visibilidad pública contra datos médicos privados" que se evalúa en la entrega final: campos filtrados por permiso y contexto, relación de atención, acceso excepcional aprobado por el delegado, auditoría consultable y verificable, y transparencia para el paciente.

## Alcance
- Dentro: motor de contexto (relación de atención, área de turno, propio), filtrado de campos, acceso excepcional, auditoría y verificación, "quién vio mi expediente".
- Fuera: solicitudes formales de derechos LPDP con plazos (F), procedimiento de brecha en 72 h (F, documentado), retención y depuración (F, legado 005).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-110-01 | El sistema debe determinar el contexto de cada acceso a datos de un paciente: propio, relación de atención activa, área de turno en curso o acceso excepcional vigente. | R | REQ-PRV-02; D-031 |
| FR-110-02 | Cuando la API responde datos de un paciente, debe incluir solo los campos que la tabla de `privacidad.md` permite para ese permiso y contexto. | R | REQ-PRV-02, 03 |
| FR-110-03 | Si alguien sin contexto válido pide datos clínicos, entonces el sistema debe responder 403 sin revelar si el dato existe y auditar el intento. | R | REQ-PRV-02 |
| FR-110-04 | Administrador, Jefe de Operaciones y médicos no tratantes deben poder pedir acceso excepcional a un paciente con motivo y duración de hasta 24 h. | R | D-031; RN-40 |
| FR-110-05 | Solo el Delegado de protección de datos debe aprobar o negar un acceso excepcional, nunca uno propio. | R | D-031; RN-38 |
| FR-110-06 | Cuando vence un acceso excepcional, el sistema debe dejar de concederlo sin intervención. | R | RN-40 |
| FR-110-07 | El delegado debe poder buscar auditoría por persona, paciente, acción y fecha, y verificar la integridad de la cadena. | R | D-009 |
| FR-110-08 | El paciente debe poder ver quién consultó su expediente (fecha, rol y motivo), sin nombres del personal. | E | LPDP Art. 16 |
| FR-110-09 | En urgencia, un médico de emergencia debe poder abrir acceso inmediato ("romper el vidrio") que queda pendiente de revisión posterior del delegado. | E | legado 000 FR-031 |
| FR-110-10 | La matriz de control de acceso y la política de campos deben publicarse como documentos generados desde los mismos datos que usa el sistema. | R | entregable 2 del curso |

## Escenarios de aceptación

1. **Médico no tratante.** Dado un médico sin relación con el paciente X, cuando abre su historial, entonces recibe "No tienes acceso a esta información" y el intento queda auditado.
2. **Administración autorizada.** Dado un Jefe de Operaciones que pide acceso a X por una queja, cuando el delegado aprueba por 2 h, entonces ve el historial durante 2 h y luego no.
3. **Laboratorio.** Dada una orden en proceso, cuando el laboratorista abre la ficha, entonces ve nombre, edad y sexo, pero no el DUI ni el teléfono.
4. **Transparencia.** Dado que un médico vio el historial de Ana, cuando Ana abre "Quién vio mi expediente", entonces ve "Médico, 14 nov 10:32, consulta".

## Reglas, datos, endpoints y pantallas
- Reglas: RN-38 a RN-40. Datos: `ACCESO_EXCEPCIONAL`, `RELACION_ATENCION`, `AUDITORIA`.
- Endpoints: spec 110. Pantallas: W30 a W32, A11, I11.

## Preguntas abiertas
Ninguna.
