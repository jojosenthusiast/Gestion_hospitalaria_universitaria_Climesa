# Fuentes V4 y nivel de lectura
Consulta: 12/10/2026. Versiones/ediciones pendientes de fijar para cualquier producto candidato.

| ID | Fuente | Acceso y uso | Límite |
|---|---|---|---|
| S401 | [ERPNext Purchase Receipt](https://docs.frappe.io/erpnext/purchase-receipt) | Página/secciones de recepción y calidad recuperadas | Patrón de recibidas/aceptadas/rechazadas y unidades; no SOP sanitario |
| S402 | [ERPNext Stock Received but not Billed](https://docs.frappe.io/erpnext/stock-received-but-not-billed) | Fragmento oficial indexado | Patrón obligación provisional/cotejo; política contable local pendiente |
| S403 | [ERPNext FIFO and Moving Average](https://docs.frappe.io/erpnext/fifo-and-moving-average) | Página recuperada; lectura específica inestable | Referencia de métodos; no elección aprobada |
| S404 | [ERPNext Purchase Invoice](https://docs.frappe.io/erpnext/purchase-invoice) | Fragmentos indexados; apertura falló | CxP/recepción previa/cuentas; probar versión y configuración |
| S405 | [Odoo 19 Manage vendor bills](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/manage.html) | Fragmento oficial indexado; apertura falló | Cotejo/control de facturas; no garantía de bloqueo completo |
| S406 | [Odoo 19 Consignment](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/owned_stock.html) | Fragmento oficial; apertura timeout | Propietario del stock; probar segregación en versión real |
| S407 | [OMS TRS1025 anexo7, almacenamiento/distribución](https://www.who.int/publications/m/item/trs-1025-annex-7) | Ficha oficial recuperada; PDF completo pendiente | Referencia de calidad; no regulación salvadoreña automática |
| S408 | [HL7 MedicationRequest R4](https://www.hl7.org/fhir/R4/medicationrequest.html) | Scope/modelo recuperados | Orden de suministro/administración, versión R4 publicada |
| S409 | [HL7 MedicationDispense R4](https://www.hl7.org/fhir/R4/medicationdispense.html) | Apertura falló; definición cruzada en S408/S410 | Suministro distinto de administración; detalles del recurso pendientes |
| S410 | [HL7 MedicationAdministration R4](https://hl7.org/fhir/R4/medicationadministration.html) | Scope/modelo recuperados | Evento, autor, tiempo, dosis y motivo no realizado; no protocolo de tratamiento |
| S411 | [OMS Medication safety in transitions of care](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.9) | Ficha/resumen oficial leídos, informe completo pendiente | Conciliación y continuidad; no plazos de CLIMESA |
| S412 | [Poon et al., barcode/eMAR, 2010, PMID20445181](https://pubmed.ncbi.nlm.nih.gov/20445181/) | Resumen parcial indexado; apertura no dio texto | Estudio de implementación; no promesa de eficacia local |
| S413 | [Koppel et al., workarounds BCMA, 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2442264/) | Secciones indexadas; artículo bloqueado por captcha | Observación/entrevistas/FMEA/logs; implementación organizativa |
| S414 | [van der Veen et al., workarounds/errors BCMA](https://pmc.ncbi.nlm.nih.gov/articles/PMC7646849/) | Secciones indexadas; artículo bloqueado | Observacional multicéntrico neerlandés; asociación, no causalidad |
| S415 | [GNU Health prescriptions](https://docs.gnuhealth.org/his/userguide/basics/coremodule/prescriptions.html) | Página recuperada | Medicamento/vía/unidades/pauta/stock; no integración probada |
| S416 | [GNU Health products/services](https://docs.gnuhealth.org/his/userguide/healthcenter/products.html) | Página recuperada | Presentación/UOM y relación económica; validar antigüedad y versión |
| S417 | [Bahmni medication administration/tasks](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/3719561222/Medication%2BAdministration%2BAnd%2BNon%2BMedication%2BTasks) | Fragmento oficial indexado; apertura sin cuerpo útil | Tareas/omisión/urgencia; detalle y demo pendientes |
| S418 | [SRS controlados en establecimientos de salud](https://www.srs.gob.sv/?wpdmpro=lineamiento-para-el-manejo-de-medicamentos-controlados-en-establecimientos-de-salud) | Ficha oficial leída: v01, carga/actualización 16/10/2025; descarga 403 | No se leyó articulado/ámbito/vigencia; no se atribuyen obligaciones específicas |
| S419 | [SRS guía BPA/transporte droguerías/almacenamiento](https://www.srs.gob.sv/wp-content/uploads/2025/10/Guia-para-la-Evaluacion-de-Buenas-Practicas-de-Almacenamiento-y-Transporte-Aplicadas-a-Droguerias-y-Centros-de-Almacenamiento.pdf) | Referencia oficial indexada, documento completo pendiente | Ámbito nombrado no equivale a farmacia hospitalaria; aplicabilidad por verificar |
| S420 | [SRS herramientas de farmacovigilancia](https://www.srs.gob.sv/?wpdmcategory=herramientas-ctft) | Referencia oficial indexada | Referente/formularios; requisitos/plazos aún no extraídos |
| S421 | [MINSAL disposición final 2024, acuerdo1439](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosparaladisposicionfinaldemedicamentosvacunasinsumosyquimicospeligrososydeterioradosyvencidos-Acuerdo-Ejecutivo-1439-06052024_v2.pdf) | Fragmento oficial indexado | Texto menciona hospitales nacionales; ámbito privado no presumido |
| S422 | [OMS TRS1044 anexo8, vida útil remanente](https://www.who.int/publications/m/item/trs-1044-annex-8-shelf-life-medical-products-delivery) | Ficha indexada | Base para investigar criterio por producto/contrato, no porcentaje universal |

## Lectura crítica de productos
S401 diferencia cantidades/almacenes aceptados y rechazados, conversión UOM e inspección. Implicación propuesta: inspección separada y cotejo por línea. Documento ERP no garantiza trazabilidad clínica.
S415 representa receta por paciente/profesional y líneas con forma, vía, dosis/unidad y pauta; permite enlazar movimientos. Se propone comparar su modelo con texto libre actual, no copiar reglas terapéuticas.
S416 contiene descripciones de facturación cuyo vocabulario de estados requiere validar edición/versión; no se adopta la afirmación de que postear una factura demuestra pago. El paquete mantiene pago y documento separados.
S417 aporta candidato eMAR, pero solo la referencia indexada no prueba comportamiento en producción ni permisos.
Un issue de un producto es señal para preparar pruebas, no demostración de que todas sus versiones fallan.

## Lectura crítica de literatura
Poon: el resumen atribuye reducción de errores al uso barcode/eMAR, sin eliminación total. Falta lectura íntegra para evaluar diseño/transferibilidad; no se reporta ahorro ni efecto CLIMESA.
Koppel: investigación multimétodo en hospitales describe atajos y causas del uso BCMA; sirve para observar entorno, etiquetas, escaneo y overrides. Contexto histórico, no prevalencia actual local.
van der Veen: estudio prospectivo observacional multicéntrico en servicios hospitalarios adultos relaciona workarounds y errores. Asociación no acredita causalidad ni generaliza automáticamente a UCI/pediatría/El Salvador.
No son una revisión sistemática ni fundamento para reemplazar juicio clínico con automatización.

## Registro legal de este grupo
| Materia | Estado | Resultado técnico provisional |
|---|---|---|
| Controlados SRS | Lineamiento localizado; contenido no recuperado | Preparar registro/custodia/dispensación/residuo/descargo con campos configurables; reglas legales pendientes |
| Lista de sustancias | Se encontró lista anunciada 2024; actualización 2026 no demostrada | No congelar clasificación vigente con referencia antigua |
| Almacenamiento/vida útil | Guías SRS/OMS identificadas; ámbitos diferentes | Separar condición, evidencia y autoridad de liberación; validar producto/SOP |
| Disposición final | Fuente MINSAL2024; referencia2019 alojada en derogados | No usar derogada como obligación; confirmar vía aplicable a privado/controlados |
| Farmacovigilancia | Herramientas SRS localizadas | Casos y responsable internos; revisar formatos, canales y plazos externos |
| CxP/fiscal | Mantener lectura MH de v3 | Validar tributos/retenciones/DTE y marco contable; no nuevas tasas inventadas |

El permiso o ajuste contable interno no reemplaza autorización sanitaria que resulte exigible. Se trata de una separación de procesos propuesta, no dictamen de aplicabilidad.

## Búsquedas representativas
- site.srs.gob.sv medicamentos controlados farmacia hospital
- site.salud.gob.sv farmacia hospital dispensacion medicamentos norma enfermeria
- site.who.int medication safety transitions care medication reconciliation
- site.docs.frappe.io/erpnext purchase receipt purchase invoice batch valuation
- site.hl7.org/fhir/R4 medicationrequest medicationdispense medicationadministration dosage
- site.who.int good storage distribution practices medical products FEFO quarantine
- site.pubmed.ncbi.nlm.nih.gov barcode medication administration Poon 2010
- site.odoo.com/documentation/19.0 vendor bills three way matching consignment
- site.docs.gnuhealth.org pharmacy medication stock prescription
- site.srs.gob.sv buenas prácticas almacenamiento
- site.srs.gob.sv descargo medicamentos
- site.srs.gob.sv farmacovigilancia notificación

Fuentes extranjeras, privadas o referencias derivadas no se usaron como obligación legal salvadoreña. Cada regla clínica/tributaria local pendiente permanece abierta.
