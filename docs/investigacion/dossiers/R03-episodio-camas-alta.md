# R03. Episodio, admisión, camas, traslados y alta

**Versión:** 1 (2026-10-13). **Alimenta:** spec 002 (episodio y encuentro), y define hitos que usa 006 (cuenta).

## 1. Conclusión

V3-03, V7-02 y V7-06 aciertan en el principio central: atención, estancia, cama, alta médica, salida física, limpieza y cierre económico son hechos distintos que no caben en un solo estado. Esta revisión agrega lo que faltaba de la ley salvadoreña y lo vuelve regla concreta:

- **El cobro de estancia termina cuando el médico firma el alta**, no cuando el paciente sale (LDDPPSS Art. 29).
- **No se puede retener ni negar atención por deuda.** Negar o deficientar atención por condición económica es infracción grave (LDDPPSS Art. 42 b y e; Art. 11).
- **El alta voluntaria existe en la ley** y exige constancia escrita del paciente (Art. 9 k, 27 e).
- **La cama solo vuelve a estar disponible después de la limpieza terminal registrada con checklist y firma** (lineamientos MINSAL de limpieza y desinfección, 2024).

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V3 AT01 | Atención con identidad resuelta o provisional; idempotencia; tiempos del acto vs de captura; urgencia sin cita ni cama | Se conserva |
| V3 AT02 / V7 HOS03 | Traslado = solicitud → aceptación → ejecución → entrega → recepción; rechazo mantiene responsable; ausencia temporal ≠ alta | Se conserva |
| V3 AT03 / V7 DIS01-05 | Alta médica, salida física, cama, cierre de cuenta y aceptación fiscal separados; pendientes con dueño | Se conserva |
| V3 AT04 | Retorno real = nueva atención relacionada; corrección ≠ reapertura | Se conserva |
| V7 HOS02 | Cama física, plaza habilitada, ocupación, reserva, limpieza, bloqueo como estados separados | Se conserva; se agrega regla de liberación MINSAL |
| V7 HOS05 | Ocupación con denominador explícito; corte de estancia no es 24 h por supuesto | Se conserva; el corte económico queda fijado por Art. 29 |
| V7 DIS02 | Conciliación de medicamentos al alta; orden hospitalaria no se vuelve receta automática | Se conserva; parámetros en R05 |
| V7 "Casos de salida voluntaria, rechazo, fallecimiento... pendientes de análisis" | Pendiente legal | **Se cierra en parte:** LDDPPSS Art. 9 k, 13 e, 27 e regulan alta voluntaria y rechazo |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| Aldara: `Bed.Status` = Available/Occupied, alta libera la cama | Descartado: la cama pasa a "pendiente de limpieza", no a disponible |
| V7 HOS05: "coste de estancia y tarifa pueden usar cortes distintos... no redondeo supuesto" | Se precisa: el **cobro** al paciente de servicios privados corre hasta la firma del alta (Art. 29); el **costeo** interno puede usar otro corte |
| P01 §5: "atención urgente y alta no se bloquearán por deuda inventada" | Se confirma con base legal (Art. 11, 42 b, 42 e) |

## 4. Marco legal verificado

| Norma | Regla | Consecuencia |
|---|---|---|
| LDDPPSS Art. 29 | Costos hospitalarios desde el ingreso hasta que el facultativo firma el alta | Hito `alta_medica_firmada` cierra cargos de estancia; la salida física no genera días adicionales |
| LDDPPSS Art. 14 | Informe escrito de alta con diagnósticos, resultados, procedimientos, estancia, seguimiento y, en privados, detalle de costos | Documento de alta une resumen clínico y estado de cuenta |
| LDDPPSS Art. 9 k | Alta voluntaria: paciente solicita alta y suspensión del tratamiento pese a aclaración de riesgos | Tipo de egreso "alta voluntaria" con documento firmado |
| LDDPPSS Art. 13 e, 27 e | Informar consecuencias de rechazar; el paciente deja constancia escrita al rehusar o pedir alta voluntaria | Formulario de rechazo/alta voluntaria firmado; si se niega a firmar, constancia con testigos (política pendiente) |
| LDDPPSS Art. 11, 42 b, 42 e | No discriminar por condición económica; negar emergencia o atender deficientemente por ello es grave | Ninguna regla del sistema bloquea atención, alta o salida por saldo |
| LDDPPSS Art. 22 | Segunda opinión; en privado la paga el paciente | Registro de solicitud de segunda opinión; impedirla antes de un procedimiento es infracción (Art. 43 c) |
| Norma 1616 Art. 16 b, 17 | Hospitalización registra ingreso, egreso, circunstancia y procedencia, tipo y circunstancia de egreso, fecha y hora | Campos obligatorios del episodio |
| Ley SNIS Art. 9 c, 24 | Privados contribuyen al Sistema Único de Información en Salud | Exportación de egresos para MINSAL (formato SIMMOW pendiente) |
| [Lineamientos de limpieza y desinfección SNIS, Acuerdo 941 de 2024](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosdelimpiezaydesinfeccionenestablecimientosdelsistemanacionalintegradodesalud-Acuerdo-Ejecutivo-941-09102024_v1.pdf) | Limpieza terminal al egreso o traslado (V.8.a); rutinaria al menos 3 veces al día (V.7.a); checklist con fecha, responsable y firma del jefe de área (V.8.2); jefes de unidad supervisan, comité IPC asesora | Estado "pendiente de limpieza" → "limpieza registrada" → "disponible", con checklist firmado; el lineamiento no fija tiempo mínimo de espera ni criterio de liberación, eso es política local |

Lectura de LDDPPSS: [CSSP](https://local.cssp.gob.sv/wp-content/uploads/2019/06/LDDPPSS.pdf) (leída en los artículos citados). Lineamiento de limpieza: leído; su aplicabilidad a privados se deduce del ámbito SNIS (público y privado), sin cláusula privada explícita.

## 5. Estándares y referencias técnicas

| Fuente | Aporte | Uso |
|---|---|---|
| [HL7 v2 eventos ADT](https://www.hl7.eu/v2plusvocab/CodeSystem-eventV180.json.html) | A01 ingreso, A02 traslado, A03 alta, A04 registro, A05 preingreso, A06/A07 cambio de clase, A08 actualización, A11/A12/A13 cancelaciones, A14-A16 pendientes, A17 intercambio de pacientes, A40 merge | Catálogo de eventos internos del episodio: cada evento tiene su cancelación explícita, nunca se borra |
| HL7 FHIR Encounter / EpisodeOfCare (V3 S302/S303) | Contacto vs responsabilidad de cuidado; historial de ubicaciones | Heredada |
| [AHRQ RED Tool 3](https://www.ahrq.gov/patient-safety/settings/hospital/red/toolkit/redtool3.html) | Preparación y educación de alta | Heredada (V7 H713) |
| [High 5s, conciliación de medicamentos](https://www.safetyandquality.gov.au/sites/default/files/migrated/High-5s-Project-Assuring-Medication-Accuracy-at-transitions-of-Care-Aust-Int-Report.pdf) | BPMH dentro de 24 h del ingreso; indicadores MR-1 a MR-4 | Indicadores del alta (detalle en R05) |
| [NEWS2, RCP](https://www.rcp.ac.uk/media/mrllczrj/news2-chart-4_clinical-response-to-news-trigger-thresholds_0.pdf) | Umbral 5 respuesta urgente, 7 emergencia, 3 en un parámetro aviso inmediato | Deterioro en sala (detalle en R05) |

## 6. Modelo resultante para la spec 002

| Objeto | Estados | Regla clave |
|---|---|---|
| Atención (encounter) | prevista, llegada, en curso, suspendida, finalizada, cancelada, registrada por error | Urgencia sin cita ni cama; doble envío no crea dos atenciones |
| Episodio hospitalario | solicitado, aceptado, activo, alta médica firmada, salida física, cerrado administrativamente | Alta médica firmada es el hito de Art. 29 |
| Segmento de ubicación | reservado, ocupado, ausencia temporal, liberado | Sin solapamiento de dos pacientes en plaza exclusiva (restricción de exclusión en PostgreSQL sobre rango de tiempo) |
| Cama/plaza | habilitada/no habilitada; disponible, reservada, ocupada, pendiente de limpieza, en limpieza, bloqueada | Solo "disponible" acepta asignación; limpieza terminal con checklist firmado la libera |
| Traslado | solicitado, aceptado, rechazado, en tránsito, recibido, cancelado | Rechazo conserva responsable y ubicación de origen |
| Alta | planificada, médica firmada, voluntaria firmada, fallecimiento, referida, fuga/abandono | Cada tipo con su documento; pendientes con dueño |
| Pendiente de continuidad | abierto, aceptado, resuelto, escalado | Resultados y citas postalta con responsable |

Eventos con cancelación explícita (modelo ADT): admitir/cancelar admisión, trasladar/cancelar traslado, dar alta/cancelar alta (revocación por deterioro conserva la primera decisión).

## 7. Requisitos derivados para la spec 002

1. Hito `alta_medica_firmada` separado de `salida_fisica`; cargos de estancia se calculan hasta el primero.
2. Tipo de egreso obligatorio según Norma Art. 17: alta médica, voluntaria, referida, fallecimiento, abandono; con documento asociado.
3. Alta voluntaria y rechazo de tratamiento con formulario firmado por el paciente o representante y registro de riesgos explicados.
4. Prohibición en el motor de reglas: ninguna validación económica puede impedir abrir episodio de emergencia, registrar alta o salida.
5. Cama con exclusión temporal garantizada en base de datos y ciclo de limpieza terminal con checklist, responsable y firma del jefe de área.
6. Traslados y ausencias temporales como segmentos, con aceptación del destino.
7. Informe de alta que combina resumen clínico (spec 003) y detalle de costos (spec 006).
8. Pendientes postalta con responsable, vencimiento y escalamiento.
9. Censo por hora con denominador explícito (plazas habilitadas vs operativas).
10. Exportación de egresos con CIE-10 para MINSAL, formato pendiente.

## 8. Pendientes para CLIMESA

1. Cuántas camas, por servicio, y cuáles son habilitadas por el CSSP (INS01).
2. Procedimiento actual de alta voluntaria y formato que firman.
3. Quién libera la cama hoy (enfermería, limpieza, admisión) y si hay checklist.
4. Si reportan egresos al MINSAL y por qué medio.
5. Cómo cobran hoy la estancia (por día calendario, por 24 h, hasta salida) para medir la brecha con Art. 29.

## 9. Fuentes nuevas

[LDDPPSS](https://local.cssp.gob.sv/wp-content/uploads/2019/06/LDDPPSS.pdf) (leída, artículos citados); [Lineamientos de limpieza y desinfección 2024](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosdelimpiezaydesinfeccionenestablecimientosdelsistemanacionalintegradodesalud-Acuerdo-Ejecutivo-941-09102024_v1.pdf) (leída); [HL7 v2 eventos](https://www.hl7.eu/v2plusvocab/CodeSystem-eventV180.json.html) (leída); [SIMMOW, tabla de egresos MINSAL](https://transparencia.gob.sv/institutions/minsal/documents/358654/download) (leída; confirma el sistema, no sus obligaciones).
