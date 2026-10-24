# R15. DTE y obligaciones fiscales

**Versión:** 1 (2026-10-13). **Alimenta:** spec 007 (DTE) y 008 (contabilidad).

## 1. Conclusión

V3-08 hizo lo más difícil: descargó la Normativa DTE 2.0 y el Manual Funcional 2.0 oficiales, guardó sus hashes y verificó la tabla de pruebas mínimas que Hacienda exige antes de autorizar a un emisor. Esta revisión agrega el inventario completo de documentos oficiales vigentes, el flujo técnico real de firma y transmisión, una regla legal que cambia el diseño de la factura a consumidor final y las obligaciones mensuales que el sistema debe alimentar.

**La regla que más cambia el diseño:** desde la reforma al Código Tributario aprobada el 17-sep-2024, no se puede exigir nombre ni identificación a una persona natural en una factura de consumidor final por debajo de US$25,000. Las excepciones son que el cliente la pida para deducir un gasto o que la compra supere ese monto. Exigirla se sanciona con 30% del monto por documento, con mínimo de 2 salarios mínimos ([Revista E&N](https://www.revistaeyn.com/empresasymanagement/que-implica-para-las-empresas-de-el-salvador-la-reforma-al-codigo-tributario-HK21815983)). El hospital conoce la identidad del paciente por el expediente, pero **el DTE no puede autollenarla**: el receptor de la factura es un dato fiscal opcional que el cliente decide dar.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V3-08 | Normativa 2.0 (25-may-2026, 137 p.) y Manual Funcional 2.0 descargados con hash | Se conserva como fuente primaria |
| V3-08 | Pruebas mínimas: Factura 90, CCF 75, Nota de Remisión 50, Nota de Crédito 50, Nota de Débito 25, Retención 50, Liquidación 75, Documento Contable de Liquidación 50, Exportación 90, Sujeto Excluido 25, Donación 25; 5 por evento (invalidación, contingencia, retorno, operaciones especiales) | Se conserva; solo aplican los tipos que CLIMESA emita |
| V3-04 | Estados del documento fiscal: preparado → validado → firmado → en transmisión → aceptado/rechazado/desconocido | Se conserva |
| V2-03 E12 | DTE rechazado no borra la prestación; cola durable; reconciliar antes de reemitir | Se conserva |
| V3-08 | Registrar versión de esquema por ambiente, emisor, tipo y periodo; separar payload, firma, respuesta y archivo entregado | Se conserva |
| V9 N908 | Índice MH con fechas 2026 que hay que comparar archivo por archivo | Se cierra en parte (sección 4) |
| V3 S319 | "Ley IVA consolidada no demostrada" | Se cierra: texto de Hacienda leído para Art. 45, 46, 54 y 66 |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| Diseño previo (mío): receptor de factura = paciente del episodio | Prohibido salvo petición del cliente o monto ≥ US$25,000 |
| Doc base: "invalidación 90 días FE, 1 día resto" | Se mantiene; el plazo corre desde el sello de recepción ([resumen](https://invoicedataextraction.com/blog/el-salvador-e-invoicing-requirements)); confirmar con la Normativa 2.0 |
| Usar la guía de integración de 2021 porque aparece indexada | Descartado (coincide con V9): solo los documentos de mayo-2026 en adelante |

## 4. Documentos oficiales vigentes

Inventario del portal [factura.gob.sv, información técnica y funcional](https://factura.gob.sv/informacion-tecnica-y-funcional/) (leído; los enlaces de descarga no se exponen desde aquí):

| Documento | Fecha de actualización | Uso |
|---|---|---|
| Normativa de Cumplimiento de los DTE | 25-may-2026 | Reglas legales y de negocio |
| Manual Tecnológico para la Integración del Sistema de Transmisión | 25-may-2026 | Endpoints, autenticación, reintentos |
| Manual Funcional del Sistema de Transmisión (incluye pruebas mínimas) | 25-may-2026 | Estructuras y pruebas para autorización |
| Json Schemas (anexo al Manual Técnico) | 11-ago-2026 | Validación antes de firmar |
| Catálogos (detalle y actualizado) | 1-jul-2026 | Códigos de tipos, unidades, departamentos, etc. |
| DTE Firmador y SVFE-API-Firmador (código fuente) | 25-may-2026 | Servicio gratuito de firma provisto por Hacienda |
| Manual de Acreditamiento y obtención de certificado de firma | 25-may-2026 | Certificado del emisor |
| Manual para la autorización en línea como emisor | 25-may-2026 | Trámite de autorización |
| Solicitud de ingreso al ambiente de pruebas | 21-sep-2026 | Ambiente de pruebas |
| Guía del proceso de incorporación como emisor | 19-dic-2025 | Proceso completo |

**Tarea antes de escribir la spec 007:** descargar estos archivos desde un navegador, registrar hash y fecha, y leer completos el Manual Técnico, la Normativa (contingencia, invalidación, retorno, redondeos) y los esquemas de los tipos que CLIMESA emitirá.

## 5. Flujo técnico confirmado

| Paso | Detalle | Fuente |
|---|---|---|
| Firma | Servicio firmador de Hacienda (Java, código abierto) expuesto localmente; firma JWS con RS512 (RSA-SHA512); recibe NIT, contraseña de la llave privada y el JSON del DTE | [Ejemplo comunitario del firmador](https://gist.github.com/mcalero11/03af55c0e9872407b121dd77cc41f833) (leído; usa llaves de prueba públicas) y portal MH |
| Código de generación | UUID v4 en mayúsculas | [Normativa resumida](https://dte.raudacloud.com/guia/normativa) |
| Número de control | `DTE-01-M001P025-000000000000001`, correlativo de 15 dígitos que reinicia por ejercicio | Ídem |
| Transmisión | Sistema de Transmisión por API para volumen; portal gratuito para emisores pequeños | [Resumen](https://invoicedataextraction.com/blog/el-salvador-e-invoicing-requirements) |
| Validez | Solo con sello de recepción de Hacienda | Ídem |
| Contingencia | Emitir sin sello, marcar contingencia, transmitir evento y lote al restablecer; 72 h desde el sello del evento | Normativa resumida |
| Invalidación | 90 días para Factura, Exportación y Sujeto Excluido; 1 día para el resto; tipos 1 y 2 requieren reemplazo previo | [Facxi](https://facxi.com/blog/invalidacion-dte-el-salvador-guia-paso-a-paso) |
| Evento de retorno | Nuevo en 2.0: ajustar facturas sin invalidar | [Facxi 2.0](https://facxi.com/blog/normativa-cumplimiento-dte-version-2-el-salvador-2026) |
| Conservación | 10 años del JSON, representación gráfica y eventos | Sovos y resumen |

Endpoints, vigencia del token y códigos de respuesta: **pendientes** del Manual Tecnológico. No se usan valores de blogs.

## 6. Qué emitiría CLIMESA (hipótesis a confirmar con el contador)

| Situación | Documento |
|---|---|
| Paciente particular persona natural | 01 Factura (consumidor final), receptor opcional |
| Empresa con convenio o paciente que pide crédito fiscal | 03 Comprobante de Crédito Fiscal |
| Aseguradora que paga la parte cubierta | 03 CCF a la aseguradora (si es contribuyente) |
| Ajuste a menos de un CCF | 05 Nota de Crédito |
| Ajuste a más de un CCF | 06 Nota de Débito |
| Compra a persona no inscrita (ej. servicios ocasionales) | 14 Factura de Sujeto Excluido |
| Si CLIMESA es agente de retención | 07 Comprobante de Retención |

Cada tipo que se emita multiplica las pruebas mínimas de la sección 2; empezar con Factura, CCF y Notas reduce la certificación inicial a 265 transmisiones más los eventos.

## 7. Obligaciones mensuales y anuales que el sistema alimenta

| Obligación | Contenido | Fuente | Estado |
|---|---|---|---|
| F07 IVA mensual, a más tardar el día 10 | Débito y crédito fiscal; anexos de compras con campos de tipo de operación, clasificación, sector y tipo de costo/gasto desde feb-2024 | [PwC](https://pwc.com/ia/es/publicaciones/Noticias-Tax-Legal/Tax-and-Legal-2024/Cambios-F07-F14.pdf), [Biz Latin Hub](https://www.bizlatinhub.com/es/contabilidad-empresarial-fiscal-empresas-el-salvador/) | Leída |
| F14 pago a cuenta y retenciones | Pago a cuenta 1.75% de ingresos brutos para la actividad general; retenciones de renta (10% servicios sin dependencia, Art. 156); formulario v17 de 2026 | [Consortium Legal](https://consortiumlegal.com/2023/03/27/el-salvador-consideraciones-sobre-el-cierre-anual-fiscal/), [F14 v17](https://www.mh.gob.sv/wp-content/uploads/2026/06/F14-V17.pdf) | Leída |
| F11 renta anual | 30% si ingresos > US$150,000; dentro de 4 meses del cierre | Consortium Legal | Leída |
| F982 partes relacionadas | Si operaciones con relacionadas ≥ US$571,429 | Consortium Legal | Leída |
| Dictamen fiscal | Obligatorio por umbrales de activo o ingresos (CT Art. 131) | Umbrales no verificados en texto abierto | **Pendiente** |
| Inventario físico anual y registro permanente | CT Art. 142-143 | Doc base | Leída |

## 8. Requisitos derivados para la spec 007

1. Receptor de Factura opcional; el sistema nunca lo autollena desde el expediente; solo se captura si el cliente lo pide o el total ≥ US$25,000 (umbral como política versionada).
2. Validación contra el JSON Schema vigente antes de firmar; versión de esquema registrada por documento.
3. Firmador de Hacienda como servicio local aislado; llave privada fuera de la base de datos, en almacén de secretos.
4. Máquina de estados con `desconocido` tras timeout; consulta antes de reintentar; nunca un segundo código de generación para la misma operación.
5. Contingencia con evento y lote; plazo de 72 h vigilado con alerta.
6. Invalidación con ventana por tipo calculada desde el sello; reemplazo previo cuando corresponda.
7. Archivo inmutable de JSON firmado, respuesta, sello y representación con QR; 10 años.
8. Suite de pruebas mínimas automatizada contra el ambiente de pruebas para los tipos habilitados.
9. Libros y anexos del F07 y F14 generados desde los DTE emitidos y recibidos.
10. Importación de DTE de proveedores (JSON) para compras, con prevención de duplicados por código de generación.

## 9. Pendientes para CLIMESA (INS10)

1. ¿Ya son emisores DTE? ¿Con qué sistema o proveedor? ¿Qué tipos emiten?
2. ¿CLIMESA es agente de retención de IVA?
3. ¿Tienen dictamen fiscal? ¿Quién es el auditor fiscal?
4. Certificado de firma emitido por Hacienda: ¿quién lo custodia?
5. Volumen mensual de documentos (define si sirve el portal gratuito o hace falta el Sistema de Transmisión).

## 10. Referencias de mercado

[Módulo Odoo 19 para DTE (Pokutsoft)](https://apps.odoo.com/apps/modules/19.0/l10n_sv_mh_dte_einvoice) (leído): 11 tipos, eventos de invalidación, retorno y operaciones especiales, importación de DTE de proveedores, consulta de estado para recuperar sellos perdidos; licencia propietaria OPL-1, US$77.84. Sirve como lista de verificación de funciones, no como dependencia.
