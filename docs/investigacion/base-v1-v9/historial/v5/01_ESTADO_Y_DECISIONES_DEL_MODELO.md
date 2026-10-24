# Estado actual y evidencias
Se revisó ApplicationDbContext, ClinicalEntities, ClinicalRecordService, AdmissionService, HospitalRoles y políticas; hashes en evidencia_codigo.json.
Búsqueda por términos específicos dentro de Models/Services/Controllers C#: Specimen, DiagnosticReport, LaboratoryOrder, ResultNotification, Accession, DICOM, PACS, HL7, FHIR y Radiology: cero coincidencias en ese ámbito.
No significa que CLIMESA carezca de sistemas externos, ni una auditoría de todo su entorno.
Las coincidencias genéricas con OperationResult no se contaron como resultados diagnósticos.

| Hallazgo | Evidencia | Consecuencia candidata |
|---|---|---|
| B501 | DbSet no registra orden diagnóstica, muestra, estudio o informe | Crear relaciones explícitas o delegar a LIS/RIS manteniendo mapa |
| B502 | ClinicalEntities representa consulta/diagnóstico/signos/receta | Consulta narrativa no reemplaza seguimiento de prueba/resultados |
| B503 | VitalSign ligado a consulta; no resultado analítico/método/validación | Modelo de observación debe distinguir propósito/origen/catálogos |
| B504 | Ocho roles actuales no incluyen laboratorio/técnico/radiólogo/validador | Permisos y privilegios del servicio por diseñar |
| B505 | No operación de notificación crítica en servicios/controladores buscados | Circuito de entrega/acuse/actuación nuevo |
| B506 | AdmissionService finaliza ingreso/libera cama en su camino actual | No demuestra continuidad de resultados postalta |
| B507 | No referencias HL7/FHIR/DICOM en ámbito buscado | Integración necesita contratos, proveedor/versiones y aceptación |
| B508 | Facturación actual manual sin origen de orden diagnóstica | Cargos por prestación/reflex/repetición deben ser trazables |

## Decisiones candidatas
D501 — Separar pedido clínico, solicitud aceptada por servicio, prueba/ejecución, muestra/estudio e informe.
D502 — Identidad de muestra/alícuota y estudios con emisores/UID; no inferir por nombre y fecha.
D503 — Publicación de dato crudo no equivale a autorización del informe.
D504 — Criticidad y validación analítica son dimensiones diferentes; protocolo aprobado para aviso urgente provisional.
D505 — Corrección genera versión y proceso de reentrega/revisión; no sobrescritura silenciosa.
D506 — Un resultado tiene dueño de seguimiento durante traslado/alta/ausencia del solicitante.
D507 — Catálogos/unidades/método/rango/interpretación versionados; no conversión automática insegura.
D508 — RIS/PACS/visor y LIS/analizador requieren aceptación distinta; no “compatible” por abrir archivo.
D509 — Entrega técnica idempotente y custodia verificable; ACK no significa completado clínico.
D510 — Cargo/costo solo con origen/hito/política; no repetir cobro por retransmisión o repetición técnica.

## Reutilización y evaluación
Preservar identidad/autorización/paginación/servicios que resulten útiles; extender a acceso contextual y privilegios.
Comparar construir subdominio propio vs OpenELIS u otro LIS y RIS/PACS de proveedores reales. Orthanc es referencia de archivo DICOM, no solución completa de radiología ni decisión ya aprobada.
No se propone cambio de framework ni migración en esta fase.

