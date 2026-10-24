# R06. Compras, inventario y cuentas por pagar

**Versión:** 1 (2026-10-13). **Alimenta:** módulo de abastecimiento (spec posterior a 006), conecta con medicación (R05), cargos (R14), DTE recibidos (R15) y contabilidad (R16).

## 1. Conclusión

V4-02 y V4-03 ya separan correctamente cantidad, condición de calidad, ubicación, propietario y valor; recepción de factura; FEFO de método de valuación; y reserva de consumo. Se conservan casi completos. Lo nuevo es el marco legal salvadoreño que fija formato y método del inventario, la autoridad sanitaria correcta y que las facturas de proveedores ahora llegan como DTE en JSON, lo que permite un cotejo automático que V4 no podía suponer.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V4 CP01-CP02 | Requisición, aprobación, orden multilínea versionada, proveedor calificado, cambio de cuenta bancaria con revisión independiente | Se conserva |
| V4 CP03-CP04 | Recepción por lote con cuarentena, liberación explícita, devolución con custodia | Se conserva |
| V4 CP05 | Cotejo por línea (orden, recepción, factura), no solo totales; duplicados por emisor y número | Se conserva; con DTE la llave es el código de generación |
| V4 CP06-CP07 | Recibido no facturado, propuesta de pago, doble aprobación, conciliación | Se conserva |
| V4 CP08 | Reclamo comercial con dueño | Se conserva |
| V4 INV01-INV06 | Libro físico por movimientos, elegibilidad, FEFO, transferencias, preparación con genealogía, retiro y excursión térmica, conteo ciego | Se conserva |
| V4 VAL01 | Valoración separada del precio de venta; revaloración trazable | Se conserva; método legal en sección 4 |
| V2-03 E05 | Consignación: posesión no es propiedad | Se conserva; relevante para implantes y material de osteosíntesis |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| Aldara: compra de una línea, recepción crea lote | Descartado; la recepción contra orden multilínea con cuarentena es el mínimo |
| V4 S419: guía SRS de buenas prácticas de almacenamiento "aplicabilidad por verificar" | Sigue pendiente: el título la dirige a droguerías y centros de almacenamiento; usar OMS como referencia técnica |
| Referencias a DNM en V4 | Se leen como SRS (Decreto 891) |

## 4. Marco legal verificado

| Norma | Regla | Regla del sistema |
|---|---|---|
| Código Tributario Art. 142 | Inventario físico al inicio y al final de cada ejercicio; registro de control de inventarios permanente, especial e independiente | Kardex permanente por producto; cierre anual con conteo físico |
| CT Art. 142-A | Encabezado con título, contribuyente, periodo, NIT y NRC; saldo en unidades y saldo monetario a costo | Reporte de kardex legal con esos campos |
| CT Art. 143 | Métodos permitidos: costo de adquisición, última compra, promedio por aligación directa, promedio, PEPS | Método configurable por entidad, declarado y estable; FEFO físico independiente |
| Ley IVA Art. 54, 66 | Crédito fiscal 13% en compras con CCF; proporcionalidad si hay operaciones exentas | Crédito fiscal capturado desde el DTE del proveedor |
| Normativa DTE 2.0 | Proveedores emiten DTE en JSON con código de generación | Importación de DTE recibidos, validación de sello y prevención de duplicados |
| Ley SRS (Decreto 891) Art. 4, 22, 25 | Autoriza establecimientos farmacéuticos, registro sanitario, controla estupefacientes, fija precios máximos | Producto con número de registro sanitario y clasificación de control; compra de controlados con permiso |
| Reglamento de Estupefacientes DE 20 de 2013 Art. 28, 30, 33 | Transferencias de controlados con autorización; destrucción de vencidos con autoridad | Movimientos de controlados con número de autorización |
| [Lineamientos MINSAL de disposición final de medicamentos vencidos, Acuerdo 1439 de 2024](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosparaladisposicionfinaldemedicamentosvacunasinsumosyquimicospeligrososydeterioradosyvencidos-Acuerdo-Ejecutivo-1439-06052024_v2.pdf) | Heredada de V4 S421; ámbito privado no confirmado | Pendiente de lectura |

Fuentes: Código Tributario Art. 142-143 citado en [manual UPES](https://sistemas.pedagogica.edu.sv/sistema/app-documentos/repositorio/documentos/614_disenio-de-manual-para-el-control-de-inventario-utilizado-en-industrias-fenix-san-salvador-2012.pdf) (leído); [Ley IVA](https://transparencia.mh.gob.sv/downloads/pdf/DC5828.pdf); [Ley SRS](https://www.srs.gob.sv/wp-content/uploads/2025/06/LEY-DE-SUPERINTENDENCIA-DE-REGULACION-SANITARIA-ACTUALIZADA-JUNIO-2025.pdf).

## 5. Referencias técnicas

| Fuente | Aporte | Uso |
|---|---|---|
| [OMS, normas de almacenamiento y distribución](https://www.who.int/teams/health-product-and-policy-standards/standards-and-specifications/norms-and-standards-for-pharmaceuticals/guidelines/distribution) | TRS 1025 Anexo 7 (2020) buenas prácticas de almacenamiento y distribución; TRS 961 Anexo 9 (2011) y suplementos 1-16 para productos sensibles a tiempo y temperatura, incluido mapeo térmico; TRS 1044 Anexo 8 (2022) vida útil remanente al recibir | Requisitos de cadena de frío, mapeo térmico de refrigeradores, criterio de vida útil mínima por contrato |
| ERPNext / Odoo (V4 S401-S405) | Recibido no facturado, cotejo de tres vías | Heredada |
| [Módulo Odoo DTE](https://apps.odoo.com/apps/modules/19.0/l10n_sv_mh_dte_einvoice) | Crea facturas de proveedor desde el JSON del DTE con prevención de duplicados | Función de referencia para la importación |
| GS1 / DataMatrix | No se encontró obligación salvadoreña de serialización ni de código 2D en medicamentos | El escaneo depende del código que traiga el producto; etiquetado interno de dosis unitaria con código propio |

## 6. Requisitos derivados

1. Catálogo de producto con registro sanitario SRS, principio activo, concentración, forma, presentación, unidad base y conversiones, clasificación de control, condición de almacenamiento y precio máximo cuando aplique.
2. Kardex permanente con campos del CT Art. 142-A y método de valuación del Art. 143 elegido por el contador.
3. Recepción contra orden con lote, vencimiento, temperatura de llegada y cuarentena; liberación explícita.
4. Importación de DTE del proveedor: validar sello y esquema, prevenir duplicados por código de generación, cotejar por línea contra orden y recepción, registrar crédito fiscal.
5. Consignación con propiedad del proveedor hasta el consumo; liquidación periódica.
6. Registro de temperatura de refrigeradores con alertas y bloqueo de lotes ante excursión hasta evaluación.
7. Conteo físico anual obligatorio y conteos cíclicos con conteo ciego.
8. Controlados: compra con permiso, saldo separado, libro conciliado con el de dispensación (R05).
9. Disposición de vencidos con acta y autoridad cuando corresponda.

## 7. Pendientes para CLIMESA

1. ¿Quién compra hoy (farmacia, administración, cada servicio)? ¿Hay almacén central?
2. ¿Qué método de valuación declaran?
3. ¿Usan material en consignación (implantes, prótesis)?
4. ¿Tienen registro de temperatura de refrigeradores?
5. ¿Reciben ya DTE de proveedores y cómo los registran?
