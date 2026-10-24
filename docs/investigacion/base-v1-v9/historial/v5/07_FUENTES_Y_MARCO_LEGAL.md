# Fuentes, alcance y marco legal

Consulta: 12 de octubre de 2026. Las referencias apoyan requisitos candidatos; no demuestran operación, adopción o integración en CLIMESA. Congelar edición, fecha y copia autorizada al especificar interfaces. No confundir un índice consultado con el perfil íntegro ni un resumen con el paper completo.

| ID | Fuente | Estado y límite |
|---|---|---|
| L501 | [FHIR R4 ServiceRequest](https://hl7.org/fhir/R4/servicerequest.html) | Página oficial consultada; solicitud no equivale a ejecución. |
| L502 | [FHIR R4 Specimen](https://hl7.org/fhir/R4/specimen.html) | Página oficial consultada. |
| L503 | [FHIR R4 DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html) | Página oficial consultada; informe y observaciones vinculadas. |
| L504 | [FHIR R4 Observation](https://hl7.org/fhir/R4/observation.html) | Lectura completa pendiente; no fundamenta reglas detalladas en esta versión. |
| L505 | [LOINC partes del término](https://loinc.org/kb/users-guide/major-parts-of-a-loinc-term) | Página oficial consultada; mapear componente, propiedad, tiempo, sistema, escala y método. |
| L506 | [UCUM](https://ucum.org/ucum) | Especificación oficial consultada; congelar versión implementada. |
| L507 | [IHE PaLM](https://profiles.ihe.net/PaLM/index.html) | Índice oficial Rev. 11.0; distinguir Final Text de Trial Implementation. Transacciones completas pendientes. |
| L508 | [WHO Laboratory quality management system handbook](https://www.who.int/publications-detail-redirect/9789241548274) | Ficha oficial de 2011; no lectura integral ni acreditación demostrada. |
| L509 | [IHE Radiology](https://profiles.ihe.net/RAD/) | Índice oficial Rev. 23.0, 2025; perfiles completos pendientes. |
| L510 | [DICOM Basic Worklist Management](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/chapter_K.html) | Capítulo oficial consultado; verificar conformance y transacciones con proveedor. |
| L511 | [DICOM Storage Commitment](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/chapter_J.html) | Capítulo oficial PS3.4 2026d consultado. |
| L512 | [Orthanc DICOM guide](https://orthanc.uclouvain.be/book/dicom-guide.html) | Guía oficial consultada; ID Orthanc y UID DICOM no son equivalentes. |
| L513 | [Orthanc security](https://orthanc.uclouvain.be/book/faq/security.html) | Guía oficial consultada; evaluar permisos y configuración de versión concreta. |
| L514 | [OpenELIS funcionalidades](https://openelis-global.org/features-and-functionality/) | Página del proyecto consultada; capacidades anunciadas, integración no probada. |
| L515 | [Roy et al. 2005: resultados pendientes al alta](https://scholars.duke.edu/publication/1111710) | Resumen en institución autora consultado; DOI 10.7326/0003-4819-143-2-200507190-00011. |
| L516 | [Ensayo de avisos postalta](https://pubmed.ncbi.nlm.nih.gov/24154834/) | Registro indexado consultado; texto íntegro pendiente. |
| L517 | [Seguimiento microbiológico postalta](https://pubmed.ncbi.nlm.nih.gov/22278302/) | Registro indexado; texto íntegro pendiente. |
| L518 | [Comunicación radiológica de circuito cerrado](https://pubmed.ncbi.nlm.nih.gov/26374896/) | Registro indexado; texto íntegro pendiente. |
| L519 | [Ensayo de avisos de laboratorio críticos](https://pubmed.ncbi.nlm.nih.gov/10579608/) | Registro indexado; texto íntegro pendiente. |
| L520 | [OpenELIS configuración de analizadores](https://uwdigi.atlassian.net/wiki/spaces/OG/pages/1648361491) | Documentación oficial indexada; lectura completa y configuración de versión pendientes. |
| L521 | [Norma técnica laboratorios SNIS 2023, Acuerdo 1855](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2023/09/FBDBC.PDF) | PDF oficial recuperado; artículos seleccionados revisados, no dictamen legal integral. |
| L522 | [Norma radiológica 2025, Acuerdo 2580](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/11/10E9FA.PDF) | PDF oficial recuperado; ámbito y artículos iniciales revisados. |
| L523 | [Manual MINSAL análisis clínicos 2022](https://docs.bvsalud.org/biblioref/2023/07/1438494/manualdeprocesosyprocedimientosparaanalisisclinicosdemuestrasb_iTh9M40.pdf) | Documento MINSAL alojado BVS; alcance y procedimiento de validación seleccionados revisados. |
| L524 | [Dirección de Protección Radiológica MINSAL](https://www.salud.gob.sv/direccion-de-proteccion-radiologica/) | Ficha indexada; recuperación completa bloqueada. |
| L525 | [Índice MINSAL de normas](https://asp.salud.gob.sv/regulacion/normas.asp) | Índice localizado: control de calidad radiológico 23/10/2025; texto íntegro pendiente. |

## Artículos verificados y aplicación pendiente
La norma de laboratorio de 2023 (L521), Acuerdo 1855, fue publicada el 18/09/2023. Su artículo 2 refiere al personal de laboratorios del SNIS. Varias clasificaciones describen instituciones públicas concretas: no trasladarlas automáticamente al hospital privado.

| Artículo | Control que informa el diseño |
|---|---|
| 44 | Solicitud médica física o digital para análisis. |
| 47 | Procedimientos de toma, embalaje y transporte documentados y socializados. |
| 48 | Aceptación/rechazo y registro de muestras recibidas/rechazadas. |
| 51 | Registro de muestras referidas. |
| 53 | Procesamiento por profesional registrado ante JVPLC. |

La norma radiológica de 2025 (L522), Acuerdo 2580, fue publicada el 05/11/2025. Artículo 2 incluye establecimientos públicos y privados con rayos X diagnósticos e intervencionistas; artículo 3 asigna autoridad a DPR; artículo 5 establece responsabilidades del titular sobre instalación, equipo, personal, dosimetría y mantenimiento. Registrar evidencia y responsables; una conexión DICOM no acredita cumplimiento. No extrapolar ese ámbito a ultrasonido o resonancia sin revisar normativa específica.

El manual MINSAL de 2022 (L523) es referencia operativa anterior a la norma de laboratorio de 2023. Su alcance general menciona proveedores MINSAL y algunos procedimientos al SNIS: resolver aplicabilidad con asesoría local. El procedimiento M03-05-01-01-03-P01 documenta revisión, validación profesional y aviso de críticos. Contiene intervalos distintos según resultado; no convertirlos en un SLA universal de CLIMESA. El PDF tiene 83 páginas y paginación interna distinta.

## Literatura y decisiones
Roy et al. (L515) estudiaron 2,644 altas en dos hospitales terciarios estadounidenses, en 2004. El resumen informa resultados que regresaban después del alta y desconocimiento de resultados relevantes; no determina eventos adversos ni prevalencia en CLIMESA. Fundamenta investigar la responsabilidad postalta, no copiar un porcentaje local. L516–519 requieren lectura íntegra antes de atribuir magnitudes, efectos o calidad metodológica.

## Pendientes de validación
- Asesoría legal local: ámbito institucional, vigencia, reformas, permisos y obligaciones de conservación/firma/entrega; vincular con el marco general de v1–v4.
- Leer norma de control de calidad radiológico localizada en L525 y documentos específicos por modalidad.
- Jefaturas: catálogo, referencias por método/población, críticos, escalamiento, microbiología, POCT y derivaciones.
- Proveedores: versiones, licencias, conformance, perfiles y pruebas con equipos concretos.
- No se verificaron autorizaciones, equipamiento ni acreditación de CLIMESA; no atribuirlas al hospital.
