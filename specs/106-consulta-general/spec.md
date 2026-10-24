# 106. Consulta general

**Estado:** En revisión · **Semanas:** S3 · **Depende de:** 102, 105 · **Investigación:** R05; Norma 1616 Art. 16-17, 23, 42, 70; LDDPPSS Art. 13-14; legado spec 003

## Objetivo

Registro de diagnósticos, recetas y solicitudes de exámenes (regla de negocio 3 del curso), firmado por un médico con inscripción vigente, y el historial clínico que ven el médico tratante y el paciente.

## Alcance
- Dentro: iniciar consulta desde número o cita, signos vitales, motivo, examen físico, diagnósticos CIE-10, recetas, órdenes de laboratorio, firma, addendum, indicación de hospitalización, historial.
- Fuera: documentos clínicos completos con plantillas y consentimientos (F, legado 003), firma electrónica certificada (F), dispensación en farmacia (F).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-106-01 | Cuando el médico inicia una consulta desde un número llamado o una cita, el sistema debe crear la consulta y la relación de atención con el paciente. | R | RN-22 |
| FR-106-02 | El sistema debe permitir que asistente, enfermería o médico registren signos vitales con validación de rangos físicamente posibles y marca de fuera de rango. | R | REQ-CON-01 |
| FR-106-03 | El sistema debe registrar uno o más diagnósticos codificados en CIE-10 con buscador, uno de ellos principal. | R | REQ-CON-01 |
| FR-106-04 | El sistema debe registrar recetas con medicamento, dosis, vía, frecuencia, duración e indicaciones. | R | REQ-CON-01 |
| FR-106-05 | El sistema debe crear órdenes de laboratorio con exámenes o paneles del catálogo y prioridad. | R | REQ-CON-01; spec 107 |
| FR-106-06 | Cuando el médico firma, el sistema debe verificar su inscripción vigente en ese instante y cerrar la consulta. | R | RN-23; D-012 |
| FR-106-07 | Si se intenta editar una consulta firmada, entonces el sistema debe rechazarlo y ofrecer addendum. | R | RN-23; D-003 |
| FR-106-08 | El addendum debe conservar el texto original, el autor, el motivo y el instante. | E | Norma 1616 Art. 42 |
| FR-106-09 | El sistema debe mostrar el historial clínico del paciente en orden cronológico al médico con relación de atención o acceso excepcional. | R | REQ-ROL-02; D-031 |
| FR-106-10 | El paciente debe ver en su historial sus consultas firmadas, diagnósticos y recetas. | R | REQ-ROL-04 |
| FR-106-11 | El médico debe poder indicar hospitalización desde la consulta, lo que crea una solicitud de admisión de origen "consulta". | R | D-038 |
| FR-106-12 | Toda lectura del historial debe quedar auditada. | R | D-009 |

## Escenarios de aceptación

1. **Consulta completa.** Dado el número 12 llamado al C-102, cuando el médico registra signos, diagnóstico J06.9, receta y una orden de hemograma, y firma, entonces la consulta queda cerrada, la orden aparece en la cola del laboratorio y el paciente ve la consulta en su historial.
2. **Inscripción vencida.** Dado un médico con inscripción vencida ayer, cuando intenta firmar, entonces se rechaza.
3. **Firmada no se edita.** Dada una consulta firmada, cuando el médico cambia el diagnóstico, entonces se le pide addendum con motivo.

## Reglas, datos, endpoints y pantallas
- Reglas: RN-22, RN-23. Datos: `CONSULTA`, `SIGNOS_VITALES`, `DIAGNOSTICO`, `RECETA`, `RELACION_ATENCION`.
- Endpoints: spec 106. Pantallas: A20 a A22, I20 a I22, A41, A08, I08.

## Preguntas abiertas
Catálogo CIE-10: se carga un subconjunto de consulta general (unos 300 códigos frecuentes) para el curso; el completo es F.
