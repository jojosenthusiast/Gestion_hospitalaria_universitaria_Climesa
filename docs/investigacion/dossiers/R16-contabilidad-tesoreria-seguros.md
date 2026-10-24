# R16. Contabilidad, tesorería, seguros y reclamos

**Versión:** 1 (2026-10-13). **Alimenta:** spec 008 (contabilidad por eventos) y 009 (reclamos y remesas).

## 1. Conclusión

V2-03 (E01-E12) es un contrato operativo completo del ciclo económico, y P01 AC-P01-001 a 006 refina bien los reclamos. Se conservan. Lo nuevo es cómo funcionan de verdad los seguros médicos en El Salvador, el marco contable obligatorio y la evidencia sobre dónde se pierden los reclamos:

- **Seguros en El Salvador:** en hospitales de la red de una aseguradora, el hospital da **crédito** a la aseguradora por la parte cubierta (ej. 80%) y cobra al paciente el **coaseguro** (ej. 20%) más lo no cubierto al salir. El crédito requiere una "Garantía de servicios hospitalarios" y se niega si hay primas en mora. La aseguradora paga reclamos dentro de 30 días desde que recibe toda la prueba, y las disputas van a audiencia conciliatoria en la Superintendencia del Sistema Financiero (póliza ACSA/FOSAFFI 2018).
- **Marco contable:** NIIF para las PYMES obligatoria desde el 1-ene-2011 para entidades que no cotizan (CVPCPA, DO 30-nov-2009); el contador puede haber adoptado NIIF completas.
- **Dónde se pierden los reclamos:** en EE. UU., 12% de reclamos rechazados de entrada en 2023, y las primeras causas son registro y elegibilidad (24%), datos faltantes (16%) y autorización (13%) ([Optum 2024](https://marketplace.optum.com/content/dam/change-healthcare/marketplace-assets/outcomes-and-insights/2024-denials-index.pdf)). No es transferible como cifra, pero señala que el control se hace en admisión, no en facturación.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V2-03 modelo | Separar paciente, episodio, obligado, contrato, autorización, prestación, cargo, factura fiscal, reclamación, pago, aplicación, asiento; cinco fechas distintas | Se conserva |
| V2-03 roles | Caja, facturación, seguros, contador, tesorería, compras, almacén, dirección; incompatibilidades sin superusuario | Se conserva |
| V2-03 E02 | Anticipo como pasivo hasta aplicación; recibido = aplicado + devuelto + saldo | Se conserva |
| V2-03 E03 | Tarjeta: autorización, liquidación, comisión, contracargo; cierre de caja por medio con diferencia | Se conserva |
| V2-03 E04 | Aseguradora de cobertura a remesa; glosa con motivo codificado; remesa no asignada en suspenso | Se conserva y se aterriza con el modelo salvadoreño (sección 4) |
| V2-03 E07 | Honorarios: principal/agente, liquidación por prestación | Se conserva; retención 10% (CT Art. 156) |
| V2-03 E09 | Bancos: importar estados con huella, no autoaplicar ambiguos | Se conserva |
| V2-03 E10 | Mayor con plan de cuentas versionado, partida doble, periodo, cierre y reapertura | Se conserva |
| V2-03 asientos de referencia | Prestación, cobro, anticipo, compra, pago, consumo | Se conserva; coincide con la tabla del doc base |
| P01 AC-P01-001 a 006 | Reclamación multilínea, acuse perdido, remesa parcial, controversia, banco vs remesa, pago posterior al cierre | Se conservan como criterios de la spec 009 |
| V3-04 | Tres conciliaciones (aplicación, banco, sistema-contable) | Se conserva |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| V2-03 E04 asume reclamación electrónica estructurada | En El Salvador el intercambio con aseguradoras es por formularios, carta de garantía, preautorización y documentos; no se encontró estándar electrónico. La spec 009 modela documentos y estados, no EDI |
| V2-03 "contador decide marco" | Se precisa: NIIF para PYMES es el mínimo obligatorio desde 2011 para no cotizantes |

## 4. Seguros médicos en El Salvador

Fuente principal: [póliza colectiva médico hospitalaria ACSA para FOSAFFI, 2018](https://transparencia.gob.sv/system/procurements/attachments/000/060/266/original/LP-03-2018.pdf) (leída). Es una póliza concreta; las condiciones de cada aseguradora y convenio de CLIMESA pueden diferir.

| Elemento | Cómo funciona | Regla del sistema |
|---|---|---|
| Red | Hospitales que dan crédito a la aseguradora; la red cambia sin aviso | Convenio por aseguradora con vigencia y lista de planes aceptados |
| Crédito hospitalario | La cuenta hospitalaria tiene crédito del 80%; honorarios autorizados al 100% | Distribución por pagador con porcentajes del plan, no fijos |
| Coaseguro | El asegurado paga 20% y lo no cubierto al salir; sin deducible en hospitalización de red (en esa póliza) | Saldo del paciente calculado al cierre; política de deducible por plan |
| Garantía de servicios hospitalarios | Documento previo que habilita el crédito; se niega por primas en mora o saldos previos | Estado de autorización por episodio antes de aplicar crédito |
| Preautorización | Estudios especiales, cirugías electivas, procedimientos | Bloqueo de programación electiva sin preautorización registrada (no bloquea emergencia) |
| Medicinas fuera del crédito | En esa póliza, las medicinas compradas se pagan y reembolsan | Línea de medicamentos puede quedar fuera del crédito según plan |
| Reembolso | Formulario firmado por el médico, factura de consumidor final a nombre del asegurado, recetas y órdenes | Generar paquete de documentos para reembolso |
| Plazos | Pago de reclamos en 30 días desde prueba completa; presentación hasta 12 meses | Vencimientos por convenio |
| Disputa | Audiencia conciliatoria en la SSF | Caso de controversia con instancia externa |

Formularios de MAPFRE El Salvador consultados ([preautorización](https://www.mapfre.com.sv/media/formulariounicodepreautorizacion.pdf), [guía de reclamos](https://mapfre.com.sv/media/Guia-de-reclamos-gastos-medicos.pdf)) confirman el mismo patrón: preautorización hospitalaria o quirúrgica y reclamo con formulario médico. Mercado: crecimiento cercano a 9% en 2025 y solo 21% de la población con algún seguro ([E&N](https://www.revistaeyn.com/finanzas/el-mercado-de-seguros-en-el-salvador-crecio-cerca-del-9-en-2025-NC29183385)), así que el paciente particular sigue siendo el caso dominante.

Interacción con R15: si la aseguradora es contribuyente, la parte cubierta se documenta con CCF a su nombre; la parte del paciente con Factura cuyo receptor es opcional.

## 5. Marco contable y fiscal

| Tema | Hallazgo | Fuente | Estado |
|---|---|---|---|
| Marco contable | NIIF para PYMES obligatoria desde 1-ene-2011 para no cotizantes; NIFES derogadas | [Tesis UNICAES 2018](https://repositoriounicaes.catolica.edu.sv/jspui/bitstream/123456789/219/1/12NIIFAN2018.pdf) citando DO 224, tomo 385, 30-nov-2009 | Leída |
| ISR | 30% si ingresos > US$150,000, 25% si menores | [Consortium Legal 2023](https://consortiumlegal.com/2023/03/27/el-salvador-consideraciones-sobre-el-cierre-anual-fiscal/) | Leída |
| Pago a cuenta | 1.75% mensual de ingresos brutos | Ídem | Leída |
| IVA | Declaración mensual a más tardar el día 10 | [Biz Latin Hub](https://www.bizlatinhub.com/es/contabilidad-empresarial-fiscal-empresas-el-salvador/) | Leída (secundaria) |
| Libros legales del Código de Comercio | Diario, mayor, estados financieros | No abierto | Pendiente |
| Dictamen fiscal (CT Art. 131) | Umbrales de activo e ingresos | No abierto | Pendiente |

## 6. Requisitos derivados

Spec 008 (contabilidad):

1. Reglas de contabilización por evento, versionadas y aprobadas por el contador; ningún número de cuenta fijo en código.
2. Plan de cuentas configurable compatible con NIIF para PYMES; dimensiones por centro de costo y servicio.
3. Periodos con cierre y reapertura autorizada; asiento balanceado y origen único.
4. Subledgers de clientes, aseguradoras, anticipos, proveedores, honorarios e impuestos conciliados contra el mayor.
5. Exportación a sistema contable externo si el contador no quiere migrar su software (decisión INS10).

Spec 009 (reclamos y remesas):

1. Convenio por aseguradora con planes, porcentajes, deducibles, exclusiones y vigencia.
2. Garantía y preautorización por episodio con estado y documento.
3. Distribución al cierre: parte aseguradora a crédito, coaseguro y no cubierto al paciente.
4. Reclamo como paquete de documentos con versión e intento; reenvío no duplica CxC (AC-P01-002).
5. Remesa aplicada por línea; diferencias en suspenso con dueño (AC-P01-003, 005).
6. Glosa con motivo codificado y controversia, sin trasladar automáticamente al paciente (AC-P01-004).
7. Indicador de rechazos por causa, con foco en registro, elegibilidad y autorización.

## 7. Pendientes para CLIMESA (INS08, INS09, INS10)

1. Lista de aseguradoras con convenio vigente y copia de cada convenio.
2. Formato de garantía y preautorización de cada una.
3. Plazo real de pago y porcentaje de reclamos glosados hoy.
4. Software contable actual y si el contador quiere integración o reemplazo.
5. Bancos, medios de pago (POS, transferencia) y quién concilia.
