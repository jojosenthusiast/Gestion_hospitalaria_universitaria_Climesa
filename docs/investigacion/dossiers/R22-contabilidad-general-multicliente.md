# R22. Flujo de la contadora general (CLIMESA y cartera propia)

**Versión:** 1 (2026-10-13). **Alimenta:** spec 008 (contabilidad), 007 (DTE), 009 (aseguradoras), una posible línea de producto para contadores con varios clientes, y el cuestionario de levantamiento con la contadora.

**Contexto:** el contacto de CLIMESA es contadora general, lleva además clientes propios y hoy llena papeles a mano por falta de sistema. Este dossier arma la base normalizada del trabajo profesional completo, para mostrársela y refinarla con ella.

## 1. Conclusión

1. **El problema no es la falta de información legal, es la falta de un flujo.** Las obligaciones están dispersas en el Código de Comercio, el Código Tributario, el reglamento del Código Tributario, la Ley de IVA, la Ley de Renta, el Código de Trabajo, la Ley Integral del Sistema de Pensiones, el ISSS y las ordenanzas municipales. Además se tienen que cumplir por cada cliente. El valor está en una **cola única de trabajo por cliente y período**: qué entra, qué se calcula, qué se revisa, qué se presenta y qué se archiva.
2. **Desde 2026 el dato fiscal nace en JSON firmado (DTE).** Por eso la captura manual de compras y ventas debería desaparecer: el sistema importa los DTE emitidos y recibidos, los clasifica y arma los libros y los anexos. La contadora revisa excepciones en vez de digitar.
3. **El reporte de libros de IVA que da Hacienda es un auxiliar, no el libro legal.** Según [ContaPortable (12-oct-2026)](https://www.contaportable.com/libros-de-iva-hacienda-el-salvador/):
   - solo muestra los últimos tres períodos más el actual
   - no admite compras manuales ni importaciones
   - cuenta las invalidaciones como positivas, lo que duplica totales
   - no está disponible para quien usa el Sistema de Transmisión
   
   El libro legal sigue siendo obligación del contribuyente: autorizado, foliado y firmado (Código de Comercio Art. 438; Código Tributario Art. 141).
4. **Hacienda prohíbe automatizar su sistema de facturación gratuito.** El aviso de agosto de 2026 prohíbe scripts, extensiones, bots y macros sobre la interfaz gratuita ([resumen ContaPortable](https://www.contaportable.com/bloqueo-sistemas-facturacion-hacienda-dte/), texto oficial pendiente). Toda automatización tiene que ir por el API publicado y con autorización de emisor, o trabajar sobre archivos ya descargados (JSON y Excel). **Nunca operar el portal por el usuario.**
5. **Hay una obligación hospitalaria que casi nadie menciona: el F-958.** Es el informe semestral de cirugías, operaciones y tratamientos médicos (Código Tributario Art. 122-A), con vencimiento en febrero y julio. Pide por cada médico su NIT, su número de junta, el documento que emitió y el valor pagado por cada paciente ([formulario F-958 v2](https://www.mh.gob.sv/wp-content/uploads/2020/11/PMHDC8261.pdf)). Si los honorarios no están ligados a cada procedimiento, este informe se arma a mano. Es un argumento concreto para el módulo hospitalario.
6. **Lo que no se automatiza:** juicio profesional, firmas, clasificación fiscal dudosa y presentación final. El sistema prepara, valida y cuadra; la contadora decide y presenta.

## 2. Marco legal verificado

| Tema | Regla | Fuente | Estado |
|---|---|---|---|
| Contabilidad formal | Todo comerciante lleva contabilidad organizada (Código de Comercio Art. 435); estados financieros, diario y mayor como libros mínimos (Art. 435, 442, 446) | [elsalvadorlegis](https://www.elsalvadorlegis.com/aspectos-legales-de-la-contabilidad-en-el-salvador/) | Leída (secundaria con artículos) |
| Quién lleva la contabilidad | Comerciante individual con activo ≥ US$12,000 y toda sociedad: contador público autorizado, firma, bachiller de comercio o tenedor de libros (Art. 437) | Ídem | Leída |
| Autorización de libros | Hojas numeradas y autorizadas por el contador público que nombre el comerciante; en sociedades, por el auditor externo (Art. 438). Los sistemas contables los aprueba quien ejerce la auditoría (Art. 435) | Ídem | Leída |
| Asientos | Diarios, cronológicos, sin blancos ni alteraciones; error se corrige con asiento de rectificación (Art. 439). Fiscalmente se admite hasta 2 meses de atraso (Código Tributario Art. 139) | Ídem | Leída |
| Libros de IVA | Compras, ventas a contribuyentes y ventas a consumidores finales; empastados, foliados, autorizados (Código Tributario Art. 141) | Ídem; [checklist del libro de consumidor final, Reglamento Art. 83](https://elcontadorsv.com/requisitos-formales-libro-ventas-consumidores-finales/) | Leída |
| Plazo de anotación de IVA | Fuentes en conflicto: 15 días calendario (Art. 141 a según elsalvadorlegis), 10 días hábiles (Art. 141 a reformado según ContaPortable), 15 días (Reglamento Art. 74) | Ambas | **Conflicto: usar el más estricto (10 días hábiles) hasta leer el texto vigente** |
| Conservación | 10 años para registros y documentos (Código de Comercio Art. 451, 454; Código Tributario Art. 147); el DTE en el formato en que se emitió | Ídem; [ContaPortable](https://www.contaportable.com/5-obligaciones-emisores-dte-normativa-2-0/) | Leída |
| Estados financieros al Registro | Balance, resultados y cambios en el patrimonio certificados por contador público y depositados en el Registro de Comercio; sin depósito no tienen efecto probatorio (Art. 441); depósito tras aprobación (Art. 282) | elsalvadorlegis; [NOVIS 2025](https://novislegal.com/en/commercial-obligations-of-corporations-in-el-salvador-what-you-should-know/) | Leída |
| Junta General Ordinaria | En los primeros cinco meses del ejercicio: memoria, estados financieros, nombramiento de auditores (Art. 223) | NOVIS | Leída |
| Matrícula de empresa | Renovación anual en el mes de inscripción (Art. 420) | NOVIS | Leída |
| Marco contable | NIIF para las PYMES obligatoria desde 2011 para no cotizantes (R16). **La tercera edición se publicó en 2025 y rige desde el 1-ene-2027**, con aplicación anticipada permitida; cambia ingresos (sección 23), instrumentos financieros (sección 11), valor razonable (sección 12, nueva), consolidación y combinaciones de negocios | [IFRS](https://www.ifrs.org/content/dam/ifrs/shop/main/2025/spanish/es-ifrs-for-smes-a4-one-pager.pdf) | Leída. Adopción por el CVPCPA: pendiente |
| Dictamen fiscal | Obligados con activo > US$1,142,857.14 al 31-dic anterior o ingresos > 4,817 salarios mínimos de comercio y servicios (Art. 131). Nombramiento del 1-ene al 31-may; avisar en 10 días hábiles; dictamen (F-455) a fin de mayo o inicio de junio | [Portal DGII](https://portaldgii.mh.gob.sv/nombramientofiscal/frecuentes); [calendario MH 2026](https://www.mh.gob.sv/wp-content/uploads/2025/12/Calendario-Tributario-2026.pdf) | Leída |
| IVA | 13%; débito menos crédito; declaración F-07 | R15 | Leída |
| Retención y percepción de IVA | Gran contribuyente retiene 1% al comprar (Art. 162) y percibe 1% al vender para reventa (Art. 163), sobre montos > US$100 netos; anticipo del 2% en pagos con tarjeta (Art. 162-A) | [ivacalculator](https://ivacalculator.com/el-salvador/retencion-percepcion-iva/); [invoicedataextraction](https://invoicedataextraction.com/blog/el-salvador-withholding-tax-invoices) | Secundaria. El comprobante de retención es DTE tipo 07 según el catálogo oficial (R15); esas fuentes dicen 11, lo cual es incorrecto |
| Pago a cuenta | 1.75% de ingresos brutos mensuales (F-14). El F-14 v17 trae además tasas de 0.75% y 0.3% para actividades específicas | [F-14 v17](https://www.mh.gob.sv/wp-content/uploads/2026/06/F14-V17.pdf) | Leída (formulario) |
| Retenciones de renta | 10% a servicios sin dependencia (Art. 156); 20% general y 25% a regímenes preferentes para no domiciliados (Art. 158); salarios por tabla (Art. 155) | invoicedataextraction; calendario PwC | Secundaria |
| Tabla de retención de salarios 2025 | Decreto Ejecutivo 10 (30-abr-2025): mensual exento hasta US$550; 10% sobre el exceso de 550 más US$17.67 hasta 895.24; 20% sobre el exceso de 895.24 más US$60 hasta 2,038.10; 30% sobre el exceso de 2,038.10 más US$288.57. Recálculos en junio (exento 3,300) y diciembre (exento 6,600) | [Decreto Ejecutivo 10](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/04/10A052.PDF) | Leída |
| Renta anual de personas naturales | Exento hasta US$6,600 (Decreto Legislativo 293, 30-abr-2025) | [El Mundo](https://diario.elmundo.sv/politica/esto-dice-la-reforma-que-amplio-el-monto-exento-del-impuesto-sobre-la-renta) | Leída |
| ISSS | 7.5% patronal y 3% laboral, base máxima US$1,000 | [PwC tax summaries, 27-sep-2026](https://taxsummaries.pwc.com/el-salvador/individual/other-taxes) | Leída |
| Pensiones | 8.75% patronal y 7.25% laboral, total 16%, sin tope de cotización (Ley Integral del Sistema de Pensiones, dic-2022) | [EY](https://www.ey.com/es_ce/technical/tax/tax-alerts/el-salvador-ey-integral-del-sistema-de-pensiones-02); PwC | Leída. Rivermate dice 7.75% con tope: descartado frente a EY y PwC |
| Plazo de pago de pensiones | Primeros 10 días hábiles del mes siguiente (reglamento de recaudación del SAP, Art. 14) | [SSF](https://ssf.gob.sv/wp-content/uploads//ssf2018/normativa-tecnica-marco-legal/sistema-previsional/Reglamentos-SAP/RECAUDACION%20DE%20COTIZACIONES%20AL%20SAP.pdf) | Leída. Vigencia con la ley de 2022: confirmar |
| Planilla Única | ISSS y AFP se reportan en el Sistema de Planilla Única de la SSF, obligatorio desde julio de 2023 | [SSF](https://ssf.gob.sv/wp-content/uploads/2023/07/Preguntas-frecuentes-sobre-el-SPU.pdf) | Leída |
| INSAFORP | 1% patronal en empresas con más de 10 trabajadores | [Rivermate](https://rivermate.com/es/guias/el-salvador/calculadora-costo-empleado) | Secundaria: confirmar |
| Aguinaldo | 15, 19 o 21 días según antigüedad (1 a 3, 3 a 10, más de 10 años); proporcional bajo un año (Código de Trabajo Art. 196-198). Reforma 2026 (Decreto Legislativo 669): pago entre 1-oct y 20-dic, cálculo con corte al 12-dic; publicación oficial pendiente al 11-oct | [El Diario de Hoy](https://www.eldiariodehoy.com/negocios/como-calcular-el-aguinaldo-guia-practica-segun-el-codigo-de-trabajo/43148/2025/); [ContaPortable](https://www.contaportable.com/aguinaldo-en-octubre-fecha-de-corte/) | Leída. Monto exento de renta 2026: pendiente |
| Vacaciones e indemnización | 15 días más 30%; indemnización de 30 días por año | Rivermate | Secundaria |
| Facturación a consumidor final | No exigir datos bajo US$25,000 (Código Tributario Art. 114, 119-G, 239, 239-A) | R15 | Leída |
| Lavado de dinero | Las empresas son sujetos obligados: oficial de cumplimiento y auditor externo en la materia | [E&N 2023](https://www.revistaeyn.com/empresasymanagement/lo-que-deben-saber-las-empresas-salvadorenas-sobre-el-auditor-externo-para-prevencion-de-lavado-de-dinero-DO14921516) | Secundaria; si los contadores son sujetos obligados: pendiente |
| Datos personales | Con clientes propios, ella es responsable o encargada de los datos (LPDP reformada por el Decreto 659) | R01, R20 | Leída |
| Depreciación fiscal | Porcentajes máximos por clase de bien (Ley de Renta Art. 30) | Heredada | **Pendiente de verificar** |

## 3. Matriz de obligaciones (2026)

Las fechas son del [calendario PwC 2026](https://www.pwc.com/ia/es/Tax-legal-news/calendario-fiscal-2026/el-salvador/Abril.html), comparado con el [calendario oficial del MH](https://www.mh.gob.sv/wp-content/uploads/2025/12/Calendario-Tributario-2026.pdf). El sistema las calcula con días hábiles y asuetos versionados, no las escribe a mano.

| Obligación | Formulario | Frecuencia | Plazo | Base | De dónde sale el dato | Aplica a |
|---|---|---|---|---|---|---|
| IVA, retenciones, percepciones, anticipos | F-07 con anexos | Mensual | Primeros 10 días hábiles (2026: 16-ene, 13-feb, 13-mar, 20-abr, 12-jun, 14-jul) | Ley IVA Art. 93-94; Código Tributario Art. 161-163 | DTE emitidos y recibidos, comprobantes de retención | Contribuyentes de IVA |
| Pago a cuenta y retenciones de renta | F-14 | Mensual | Igual que el F-07 | Código Tributario Art. 151-152, 155, 156, 158 | Ingresos brutos, planilla, honorarios, no domiciliados | Todos los que tengan ingresos, retenciones o planilla |
| Informe de retenciones de IVA | F-930 | Mensual | Primeros 15 días hábiles (2026: 23-ene, 20-feb, 20-mar, 27-abr) | Art. 123-A | Comprobantes de retención emitidos y recibidos | Agentes de retención |
| Estado de origen y aplicación de fondos | F-950 | Según el calendario MH (2026: ene, abr, jun, sep) | Con el F-07 | Art. 146 | Contabilidad | Quien la Administración Tributaria designe (confirmar alcance) |
| Informe de donaciones | F-960 | Mensual si aplica | Con el F-07 | Art. 146 | Comprobantes de donación (DTE 15) | Donantes y donatarios |
| Autorización de sistemas y libros | F-463 | Trimestral (ene, abr, jul, oct) | Con el F-07 | Art. 149-C | Libros autorizados por el contador | **El contador público que autoriza libros o sistemas** |
| Informe anual de retenciones | F-910 | Anual | 2-feb-2026 | Art. 123 | Retenciones del año por sujeto | Agentes de retención (incluye planilla) |
| Accionistas y utilidades | F-915 | Anual | 2-feb-2026 | Art. 124 | Libro de accionistas, distribución | Sociedades |
| Cirugías y tratamientos médicos | F-958 | Semestral | 2-feb y 31-jul | Art. 122-A | Procedimientos, médico, junta, documento, valor por paciente | **Hospitales y clínicas** |
| Proveedores, clientes, acreedores y deudores | F-987 | Semestral | 2-feb y 31-jul | Art. 125 | Saldos y operaciones por tercero | Según requisitos del formulario |
| Informe de inventario | F-983 | Anual | 2-mar-2026 | Art. 142 | Kardex y conteo físico al 31-dic | Quien maneje inventarios |
| Partes relacionadas | F-982 | Anual | 31-mar-2026 | Art. 124-A | Operaciones con relacionadas o paraísos fiscales | Si supera el umbral |
| Renta anual y estados financieros | F-11 y F-971 | Anual | 30-abr-2026 | Ley de Renta Art. 48; Código Tributario Art. 91 | Estados financieros y conciliación fiscal | Todos los contribuyentes de renta |
| Nombramiento de auditor fiscal | Línea del dictamen | Anual | 1-ene al 31-may; avisar en 10 días hábiles | Art. 131 | Activo e ingresos del año anterior | Si supera los umbrales |
| Dictamen fiscal | F-455 | Anual | 1-jun-2026 | Art. 134 | Auditor fiscal | Obligados al dictamen |
| Dirección para notificaciones | F-211 | Anual | Enero | Art. 90 | Datos del cliente | Todos |
| Planilla ISSS y pensiones | Planilla Única (SSF) | Mensual | Primeros 10 días hábiles para pensiones; ISSS por confirmar | Ley Integral del Sistema de Pensiones; Ley del ISSS | Planilla | Empleadores |
| Aguinaldo | Pago | Anual | 1-oct a 20-dic (reforma 2026, publicación pendiente) | Código de Trabajo Art. 196-200 | Planilla y antigüedad | Empleadores |
| Recálculo de renta de salarios | En planilla | Junio y diciembre | Con la planilla del mes | Decreto Ejecutivo 10 de 2025 | Planilla acumulada | Empleadores |
| Junta General Ordinaria | Acta | Anual | Primeros 5 meses | Código de Comercio Art. 223 | Estados financieros aprobados | Sociedades |
| Depósito de estados financieros | Registro de Comercio | Anual | Tras la aprobación | Art. 282, 441 | Estados financieros certificados | Comerciantes |
| Renovación de matrícula | Registro de Comercio | Anual | Mes de inscripción | Art. 420 | Datos del cliente | Comerciantes |
| Impuestos municipales | Según municipio | Mensual o anual | Ordenanza local | Ley General Tributaria Municipal | Activo o ingresos | **Por confirmar por cliente y municipio** |
| Conservación | Archivo | Continuo | 10 años | Código de Comercio Art. 451; Código Tributario Art. 147 | Todo | Todos |

**Lo que el sistema hace con esta matriz:** cada cliente tiene un perfil de obligaciones (contribuyente de IVA, gran contribuyente, empleador, sociedad, hospital, inventarios, partes relacionadas, dictamen). El perfil genera las tareas del período con su fecha calculada, quién la hace y qué datos le faltan. Cambiar el perfil cambia las tareas, sin tocar código.

## 4. Procesos del trabajo profesional

| Código | Proceso | Entradas | Salidas | Puntos de control | Automatización propuesta |
|---|---|---|---|---|---|
| C01 | Alta y perfil del cliente | Escritura, NIT, NRC, matrícula, giro, municipio, empleados | Perfil de obligaciones, catálogo de cuentas, calendario | Revisión anual del perfil | Plantillas por tipo de cliente (comercio, servicios, clínica, profesional independiente) |
| C02 | Recepción de documentos | DTE (JSON) emitidos y recibidos, estados bancarios, planillas, recibos, contratos | Bandeja por cliente y período | Documento sin clasificar no pasa al libro | Buzón de correo o carpeta por cliente; lectura del JSON; deduplicación por código de generación; rechazo de PDF sin JSON como respaldo fiscal |
| C03 | Ventas | DTE emitidos, notas de crédito y débito, invalidaciones | Libro de ventas a contribuyentes y a consumidor final, cuentas por cobrar, asiento de ventas | Invalidados restan, no suman; correlativos sin huecos | Generación del libro y del asiento desde los DTE; alerta de huecos de correlativos |
| C04 | Compras y gastos | DTE recibidos, sujeto excluido, importaciones | Libro de compras, cuentas por pagar, crédito fiscal, gasto deducible o no deducible | Crédito fiscal solo con DTE válido y NRC del cliente como receptor | Clasificación sugerida por proveedor e historial; la contadora confirma; anexo del F-07 con los campos de 2024 |
| C05 | Retenciones y percepciones | Comprobantes de retención (DTE 07), cobros con tarjeta | Libro de retenciones, F-930, crédito en F-07 | Que cuadren con lo reportado por terceros | Cruce automático por documento relacionado |
| C06 | Bancos | Estados en Excel, CSV o PDF | Conciliación bancaria mensual | Partidas en tránsito con antigüedad | Importación y cruce por monto, fecha y referencia; lo dudoso queda para revisión, nunca se aplica solo |
| C07 | Cuentas por cobrar y por pagar | Facturas, pagos, anticipos | Antigüedad de saldos, estados de cuenta, base del F-987 | Saldos contra el mayor | Estado de cuenta por tercero con un clic; recordatorios de cobro |
| C08 | Inventario | Compras, ventas, ajustes, conteo | Kardex (Código Tributario Art. 142-A), costo de ventas, F-983 | Conteo físico anual; método de valuación estable | Kardex desde las compras y ventas; conteo ciego en celular |
| C09 | Activos fijos | Facturas de activos, bajas | Depreciación contable y fiscal, conciliación | Diferencias contable y fiscal | Tabla de depreciación mensual automática; diferencia temporaria calculada |
| C10 | Planilla | Empleados, asistencia, incapacidades, horas extra | Planilla, ISSS, pensiones, renta, INSAFORP, boletas, asiento | Recálculo de junio y diciembre | Tablas versionadas por decreto; archivo para la Planilla Única; aguinaldo, vacaciones y liquidación calculados |
| C11 | Honorarios y servicios | Recibos de profesionales | Retención del 10%, F-14, constancias, F-910 | Sujeto excluido vs contribuyente | Constancia de retención generada |
| C12 | Declaraciones mensuales | Libros cerrados | Borradores del F-07, F-14 y F-930 con anexos | Libro igual a F-07 igual a contabilidad | Validación cruzada de tres vías antes de presentar; la presentación es manual en el portal |
| C13 | Cierre mensual | Todo lo anterior | Balance de comprobación, estados del mes | Checklist de cierre | Checklist por cliente con estado; cierre bloquea el período y la reapertura queda auditada |
| C14 | Cierre anual | Doce cierres, inventario, activos, provisiones | Estados financieros NIIF PYMES, conciliación fiscal, F-11, F-971, F-910, F-915, F-983, F-987 | Revisión analítica año contra año | Borradores generados; notas a los estados financieros con plantilla |
| C15 | Societario | Estados aprobados | Acta de junta, depósito en el Registro, renovación de matrícula | Plazos del Código de Comercio | Recordatorios con documento listo |
| C16 | Hospitalario (CLIMESA) | Cuentas de pacientes, aseguradoras, honorarios médicos | CCF a aseguradoras, coaseguro, F-958, conciliación de remesas | Honorario ligado a procedimiento y médico | F-958 armado desde los procedimientos (requiere spec 006) |
| C17 | Archivo | Todo | Expediente fiscal por cliente, año y mes, 10 años | Integridad (hash) | Respaldo propio fuera del sistema de facturación |
| C18 | Atención al cliente | Solicitudes, dudas, documentos faltantes | Lista de pendientes enviada al cliente | Pendientes con fecha | Mensaje con lo que falta por cliente, generado desde la bandeja |

## 5. Diseño para una contadora con varios clientes

- **Tablero de cartera:** cada cliente en una fila y cada obligación del mes en una columna, con semáforo (listo, en revisión, falta información, vencido). Es la primera pantalla del día.
- **Bandeja por cliente y período:** todo documento entra a una bandeja; clasificar es una acción de un clic con sugerencia; lo no clasificado bloquea el cierre.
- **Modo guiado y modo experto:** al inicio, un asistente paso a paso por proceso. Cuando lo domina, atajos de teclado, captura por lotes y edición en tabla. Así es como llega a hacer el trabajo "de mariposa".
- **Validaciones cruzadas antes de presentar:**
  - libro contra declaración
  - declaración contra mayor
  - retenciones contra comprobantes
  - planilla contra F-14
- **Biblioteca normativa versionada:** tasas, tablas y plazos con fecha de vigencia, fuente y quién los aprobó. Cuando cambia un decreto, se carga una versión nueva y el sistema recalcula solo los períodos afectados.
- **Lo que no hace:** no presenta declaraciones por ella, no opera el portal de Hacienda, no decide la clasificación fiscal dudosa.

## 6. Referencias de mercado

| Producto | Qué ofrece | Qué le falta para este flujo | Estado |
|---|---|---|---|
| [ContaPortable](https://www.contaportable.com/) (PyConta, ERP Microempresa, Factura Electrónica) | Plantillas de anexos F-07 y F-14, F-987, F-983, calculadoras de planilla y aguinaldo, artículos normativos al día, validación de libros de IVA | No se ve gestión multi-cliente ni conciliación hospitalaria; productos poco documentados públicamente | Parcial (página principal y artículos) |
| Facturador gratuito y reportes de libros de Hacienda | Emisión gratuita; Excel de libros de IVA | Solo cuatro períodos, sin compras manuales, sin automatización permitida | Parcial |
| Odoo con localización salvadoreña ([tgr_l10n_sv](https://apps.odoo.com/apps/modules/18.0/tgr_l10n_sv), [l10n_sv_cta](https://apps.odoo.com/apps/modules/18.0/l10n_sv_cta), [DTE Pokutsoft](https://apps.odoo.com/apps/modules/19.0/l10n_sv_mh_dte_einvoice)) | Catálogos oficiales del MH, impuestos, DTE, importación de DTE de proveedores | Libros legales, anexos, F-14, planilla salvadoreña y multi-cliente no aparecen en esas páginas | Leída |
| [Softland](https://softland.com/sv/factura-electronica-en-el-salvador/) | ERP comercial con factura electrónica en El Salvador | Costo y rigidez para un despacho pequeño | No abierta en detalle |

**Posición:** no competir como contabilidad genérica. Lo que diferencia este sistema:

- la cola de trabajo multi-cliente basada en la matriz de obligaciones
- la importación del JSON de los DTE con validación cruzada
- la biblioteca normativa versionada
- para CLIMESA, el circuito hospitalario: honorarios, aseguradoras y F-958

## 7. Pendientes

1. Texto vigente del Código Tributario Art. 141 (plazo de anotación) y Art. 149-C.
2. Plazo de pago del ISSS y vigencia del plazo de pensiones con la ley de 2022.
3. INSAFORP: tasa y umbral en fuente oficial.
4. Depreciación fiscal (Ley de Renta Art. 30) en texto oficial.
5. Si los contadores son sujetos obligados ante la UIF.
6. Monto exento del aguinaldo 2026 y publicación del Decreto Legislativo 669.
7. Adopción de la tercera edición de NIIF para las PYMES por el CVPCPA.
8. Aviso oficial de Hacienda sobre automatización (agosto de 2026).
9. Impuestos municipales de los municipios de sus clientes.
