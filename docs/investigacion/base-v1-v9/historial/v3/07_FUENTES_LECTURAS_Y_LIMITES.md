# Fuentes de iteración 3
Fecha 12/10/2026. Se conservan URLs de referencia; no se redistribuyen manuales completos.

| ID | Fuente | Sección/lectura | Aplicación y límite |
|---|---|---|---|
| S301 | [HL7 Patient R4](https://hl7.org/fhir/R4/patient.html) | Identificadores y consideraciones ID recurso | ID estable vs identificador humano; no obliga esquema local |
| S302 | [HL7 Encounter R4](https://hl7.org/fhir/R4/encounter.html) | Modelo y account | Atención vinculable a cuentas; no agrupar todo automáticamente |
| S303 | [HL7 EpisodeOfCare R4](https://hl7.org/fhir/R4/episodeofcare.html) | Scope/boundaries | Periodo de responsabilidad vs contacto |
| S304 | [IHE PMIR 1.6.0](https://profiles.ihe.net/ITI/PMIR/volume-1.html) | Conceptos/actores/merge | Registro y propagación de identidad; Trial Implementation, políticas y referencias pendientes del dominio |
| S305 | [Joint Commission: two identifiers](https://www.jointcommission.org/en-us/knowledge-library/support-center/standards-interpretation/standards-faqs/000001463) | Contenido de identificación/temporales/etiquetas | Referencia técnica; no afirmar acreditación ni obligación SV |
| S306 | [OpenMRS PatientService](https://docs.openmrs.org/doc/org/openmrs/api/PatientService.html) | merge/identifiers/auditoría | API 2.7.0-SNAPSHOT; no versión deploy probada |
| S307 | [GNU Health patient management](https://docs.gnuhealth.org/his/userguide/patientmanagement/patientmanagement.html) | Separación party/patient | Persona y atributos/roles; no copiar identificador social extranjero |
| S308 | [GNU Health pediatrics](https://docs.gnuhealth.org/his/userguide/modules/pediatrics.html) | Fragmento indexado neonatal | PUID propio; detalles por validar en lectura completa |
| S309 | [HL7 ChargeItemDefinition R4](https://hl7.org/fhir/R4/chargeitemdefinition.html) | Scope/applicability/components | Reglas de cargo/precio; exige perfil/contexto, no regla fiscal salvadoreña |
| S310 | [ERPNext Payment Reconciliation](https://docs.frappe.io/erpnext/payment-reconciliation) | Reconciliación, límites y FAQs | Pago-aplicación-banco separados; revisar edición/versión |
| S311 | [ERPNext Payment Entry](https://docs.frappe.io/erpnext/payment-entry) | Scope/unallocated | Pagos parciales/anticipos; no localización DTE acreditada |
| S312 | [Odoo 19 year-end](https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/year_end.html) | Contenido indexado; apertura falló | Lock dates como candidato; configuración probada pendiente |
| S313 | [Joffe et al., 2012, PMID 23304405](https://pubmed.ncbi.nlm.nih.gov/23304405/) | Resumen completo recuperado | Asociación duplicados/resultados omitidos; estudio retrospectivo ambulatorio |
| S314 | [Rediseño búsqueda/duplicados, PMID 29076957](https://pubmed.ncbi.nlm.nih.gov/29076957/) | Resumen parcial indexado; recuperación inestable | Pruebas de usabilidad de registradores; lectura integral pendiente |
| S315 | [MPI discrepancies, PMID 27134610](https://pubmed.ncbi.nlm.nih.gov/27134610/) | Fragmento de resumen indexado | Discrepancias de campos en múltiples sedes; no umbral de matching listo para usar |
| S316 | [MINSAL norma expediente reformada](https://asp.salud.gob.sv/regulacion/pdf/norma/normatecnicadelexpedienteclinico-Acuerdo-Ejecutivo-1616-30052024_v1-reforma1.pdf) | URL oficial identificada; recuperación completa falló | Norma+reforma candidata consolidada hasta marzo; texto integral pendiente |
| S317 | [MH manual funcional, ficha específica](https://factura.gob.sv/download/3-manual-funcional-del-sistema-de-transmision-amplia-la-aplicacion-de-las-estructuras-de-los-dte-y-los-eventos-asi-como-contiene-las-pruebas-minimas-requeridas/) | PDF oficial descargado; portada, índice y sección XXIV leídos | Versión 2.0; pruebas mínimas confirmadas en 08 |
| S318 | [MH normativa DTE](https://factura.gob.sv/normativa/) | PDF oficial descargado y portada/páginas seleccionadas inspeccionadas | Versión 2.0, 25/05/2026; 137 páginas; lectura parcial en 08 |
| S319 | [DGA ficha ley IVA](https://sitio.aduana.gob.sv/download/ley-de-impuesto-a-la-transferencia-de-bienes-muebles-y-a-la-prestacion-de-servicios-actualizada-con-d-o-no-193-t-425-15-de-octubre-de-2019/) | Ficha leída; archivo no procesado | Fecha web 2026 pero título revisión 2019; no ley consolidada vigente demostrada |

## Evidencia de investigación y transferibilidad
S313: estudio retrospectivo apareado de 904 eventos anormales ambulatorios; reporta asociación de duplicación con resultados omitidos (OR 1.44, IC95% 1.1–1.9). Es asociación, no causalidad ni estimación de CLIMESA. Implicación propuesta: duplicados y continuidad de resultados deben medirse juntos.
S314: los autores estudiaron usabilidad con registradores; el fragmento recuperado señala dificultades con búsqueda fonética. Implicación propuesta: evaluar búsqueda con personal real, no solo algoritmo. No se afirma una tasa de mejora sin texto confirmado.
S315: resumen indexado describe conjunto multisede de duplicados confirmados y discrepancias demográficas. Implicación propuesta: conservar fuentes y variantes; muestra de duplicados no estima prevalencia de población hospitalaria.
Estas lecturas no constituyen revisión sistemática.

## Registro de búsquedas
- site.hl7.org fhir patient merge link identifier encounter account
- site.profiles.ihe.net ITI PMIR patient identity merge
- site.salud.gob.sv norma tecnica expediente clinico 2024 pdf
- site.factura.gob.sv Manual Funcional del Sistema de Transmisión filetype:pdf
- site.asamblea.gob.sv 659 datos pdf
- site.jointcommission.org patient identification two identifiers newborn
- site.pubmed.ncbi.nlm.nih.gov duplicate medical records patient matching study errors
- site.openmrs.org merge patients documentation
- site.docs.gnuhealth.org patient person newborn identification
- site.docs.frappe.io erpnext payment reconciliation advance payment accounting period
- site.odoo.com/documentation/19.0 Lock dates accounting

## Bloqueos y precisión legal
La ficha Decreto 659 sigue accesible en índice pero su apertura falló de nuevo. No se recuperó su PDF íntegro.
MINSAL expone versión reforma1 y clasifica la norma 2019 en derogados. Recuperar/leer íntegramente la versión aplicable antes de asignar artículos de conservación/seguridad.
La biblioteca ESCP se utilizó como directorio para localizar vínculos oficiales; sus etiquetas no se adoptaron como texto legal ni garantía de actualización.
DGA publicó una ficha en 2026 cuyo título dice revisión 2019: fecha de carga no prueba consolidación. Este problema impide derivar impuestos de una fecha web.
No se codificaron plazos fiscales, tasas ni obligaciones nuevas sin fuente íntegra aplicable.

