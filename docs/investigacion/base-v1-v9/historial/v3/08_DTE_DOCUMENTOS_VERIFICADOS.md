# DTE: documentos recuperados y alcance de lectura
Fuentes S317/S318. Se descargaron archivos desde enlaces oficiales del portal MH. Hashes y tamaños en fuentes_fiscales_verificadas.json. No se redistribuyen los PDFs.

## Normativa de cumplimiento DTE
Portada verificada: versión 2.0, 25/05/2026; 137 páginas. PDF escaneado: extracción directa vacía. Se inspeccionaron visualmente portada, índice, p.35 y p.43; OCR auxiliar p.42–43 y p.136–137.
Hechos seleccionados:
- Regla 20, p.35: vigencia desde publicación; adaptación del Sistema de Transmisión según plazo establecido por Administración Tributaria.
- Anexo I, 4/4.1, p.42–43: archivo JSON con estructura de datos, firma electrónica y sello; representación coherente con datos; entrega controlada.
No se confirmó en esta lectura una fecha específica de adaptación asignada a CLIMESA.

## Manual funcional
PDF con texto; portada versión 2.0, historial 05/2026. Lectura de índice y sección XXIV; tabla revisada visualmente en página PDF79, numerada 76.

| Documento | Transmisiones satisfactorias mínimas indicadas |
|---|---:|
| Factura | 90 |
| Comprobante de Crédito Fiscal | 75 |
| Nota de Remisión | 50 |
| Nota de Crédito | 50 |
| Nota de Débito | 25 |
| Comprobante de Retención | 50 |
| Comprobante de Liquidación | 75 |
| Documento Contable de Liquidación | 50 |
| Factura de Exportación | 90 |
| Factura de Sujeto Excluido | 25 |
| Comprobante de Donación | 25 |

La misma tabla indica cinco pruebas para cada evento: invalidación, contingencia, retorno y operaciones especiales. El alcance aplicable debe validarse según los tipos habilitados del emisor; no supone que CLIMESA deba emitir todos esos documentos.

## Trabajo técnico propuesto a partir de la lectura
Preparar un registro de versiones por ambiente, emisor, tipo de documento y periodo de implementación.
Separar payload a firmar, firma, respuesta y archivo entregado; definir hashes y verificación de integridad.
Generar representación desde artefacto final, conservar constancia de entrega y permitir recuperación autorizada.
Planificar suite fiscal y evidencias de aceptación MH por tipo aplicable, separada de los 32 criterios funcionales locales.
Antes de implementación recuperar/contrastar esquemas JSON vigentes y leer apartados de invalidación/contingencia/retorno, redondeos/holguras y manual técnico de reintentos.
Registrar matriz prestación/entidad/profesional/pagador/documento/tributo aprobada por contador; no deducir clasificación de servicios de los ejemplos genéricos.
No se transmitió ningún DTE ni se usaron credenciales fiscales. Las pruebas mínimas aquí son requisitos de trabajo, no resultados aprobados.

## Advertencia de método
Portada, fecha web, publicación y plazo de adaptación son evidencias distintas. Se debe confirmar todo el conjunto para el caso de CLIMESA.
OCR puede introducir errores; campos/plazos/cifras productivas se cotejan visualmente y con esquemas oficiales. Las cifras de la tabla anterior sí se comprobaron en la página renderizada.
