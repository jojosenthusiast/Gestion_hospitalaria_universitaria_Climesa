# Evidencia del código y decisiones candidatas
Los nombres de archivo se refieren a src/AldaraHospital.Web dentro de la base. Revisión estática; no se ejecutó aplicación ni BD.

| ID | Observado | Problema operativo | Decisión candidata |
|---|---|---|---|
| B301 | Patient.cs exige DocumentNumber, nombres, DateOfBirth y Gender | Desconocidos/fecha incierta necesitan datos fabricados para ajustarse al modelo actual | Identidad provisional y datos desconocidos explícitos; no crear DUI o nacimiento falso |
| B302 | PatientService busca LIKE por nombre/apellido/documento, página de 10 | No se observan búsqueda por variantes ni explicación de coincidencia | Búsqueda por capas con estado de evidencia; medir duplicados y falsos positivos |
| B303 | DocumentExistsAsync comprueba cadena Trim; EF índice único DocumentNumber | Un número sin tipo/emisor no distingue dominios; comprobación previa no resuelve carrera por sí sola | Unicidad de identificador según sistema/emisor/tipo y política |
| B304 | UpdateAsync sobrescribe demografía y fecha de modificación | No conserva por sí mismo diferencias, motivo, origen ni resolución | Historial de valores, evidencia y corrección con permiso específico |
| B305 | SetActiveStatusAsync cambia bool; otros servicios exigen IsActive | Restricción transversal sin semántica del motivo | Estados independientes y reglas de elegibilidad por operación |
| B306 | EmergencyContact solo enlaza contacto al paciente | No acredita autoridad para consentir/exportar ni obligación de pago | Relaciones tipadas con ámbito y vigencia |
| B307 | Appointment/Admission/ClinicalRecord comparten PatientId; Consultation usa ClinicalRecordId | No se encontró entidad general de atención ni vínculo Admission-Consultation | Atención común y relación explícita con estancia y cuenta |
| B308 | Invoice enlaza PatientId, no atención/cuenta/pagador | Difícil distribuir seguros/responsables o separar retornos | Cuenta y responsable financiero propios |
| B309 | No se encontraron operación de merge, mapa de IDs o consumidores en estos archivos | Duplicado corregido necesita seguimiento fuera de paciente | Job de reconciliación con evidencias por consumidor |
| B310 | PatientService conserva paginación con Count antes de Take | Patrón útil ya existente | Preservar; adaptar búsqueda sin perder conteo total ni permisos |

## Decisiones y alcance
D301 — Usar ID interno inmutable, independiente de MRN/documento. Sustento S301; modelo local propuesto en 02.
D302 — Mantener datos originales y derivados de búsqueda separados. La normalización no modifica nombres legales.
D303 — No auto-fusionar por nombre/fecha/teléfono. La puntuación puede priorizar revisión; aprobación con evidencia.
D304 — Segregar identidad y finanzas: el merge no transfiere por sí solo deudas, contratos ni documentos fiscales a otra persona jurídica.
D305 — Definir atención local como unidad de trabajo, con estancia/segmentos y agrupación longitudinal cuando proceda. Mapeo S302/S303, sin forzar la persistencia a FHIR.
D306 — No usar IsActive como sustituto de fallecido o de cuenta cerrada. Registrar significado y efectos por operación.
D307 — Aplicar pagos mediante relaciones de asignación, no escribiendo un PaidAmount sin origen.
D308 — Separar estado clínico, financiero, fiscal e integración; cierre administrativo no silencia resultados.
D309 — Priorizar transformación del modelo sobre nuevas pantallas; no cambiar stack aún.
D310 — Integración con ERP/LIS/PACS depende de versiones y pruebas, no del anuncio de módulos.

## Riesgos pendientes de reproducción
Concurrencia en creación de identidad, actualización demográfica, reserva, aplicación de anticipo y recepción de evento repetido.
Filtros/validaciones de paciente inactivo pueden impedir operaciones justificadas: observar política real y probar escenarios antes de calificarlo como falla productiva.
No se ha comprobado filtración de datos por la búsqueda ni pérdida de resultados; son aspectos por verificar con permisos y consumidores.

