# Especificaciones de ingresos, aplicación y cierre
Propuestas operativas para validar con contador, facturación, caja, seguros y tesorería. Complementan E01–E12 de V2.

## Motor tarifario: datos y regla de resolución
Cargo conserva servicio/producto, cantidad/unidad, prestación, atención, profesional, entidad, pagador, contrato y snapshot de cálculo.
Catálogo versionado con vigencia, unidad, componentes incluidos/excluidos, hito de cargo, moneda y clasificación fiscal aprobada.
Precedencia candidata: convenio vigente aplicable → paquete/política específica → tarifa general → revisión. Empate/conflicto se bloquea como excepción, no escoge arbitrariamente.
Reevaluación para cargos no emitidos registra versión anterior y motivo. Descuentos manuales requieren actor/autoridad/límite.
S309 es referencia técnica de definición de reglas de precios; la política local no proviene automáticamente del estándar.

## Operaciones con contrato
| Comando | Precondiciones | Resultado/evidencia | Rechazo/conflicto |
|---|---|---|---|
| CaptureCharge | Prestación/cantidad/unidad válidas, origen estable | Cargo y origen único, snapshot o cola de revisión | Origen repetido incompatible, ausencia de tarifa, paciente/atención incoherentes |
| ValidateCharge | Evidencia, tarifa/pagador aprobados, versión actual | Cargo validado; actor y decisión | Servicio no realizado, firma faltante según política, cambio concurrente |
| AllocateLiability | Contrato/autoridad y monto disponible | Distribución por pagador con suma reconciliada | Doble cobertura, límite excedido, pagador no confirmado |
| PrepareInvoice | Cargos validados, entidad/receptor, regla fiscal | Documento interno inmutable tras emisión; reserva de IDs | Documento incompleto o cargo previamente facturado |
| TransmitFiscalDocument | Versión vigente, firma, ambiente y autorización | Estado fiscal separado y evidencia MH | Rechazo; timeout queda desconocido para reconciliar |
| RecordReceipt | Fondos confirmados según medio, origen y caja | Recibo/pago confirmado o pendiente de proveedor | Evento duplicado/conflictivo, referencia ambigua |
| ApplyReceipt | Saldo recibo/deuda, moneda/entidad compatibles | Aplicación con IDs de origen/destino | Sobreaplicación o versión caducada |
| ReverseApplication | Aplicación existente, motivo/permiso | Reverso y saldos restaurados, sin nuevo cobro | Intento de revertir dos veces o periodo bloqueado |
| Refund | Saldo elegible, aprobación distinta, medio validado | Devolución evidenciada y asiento asociado | Doble devolución, cobro no confirmado, documento fiscal pendiente |
| PostJournal | Balance, periodo/cuentas/origen válidos | Asiento contabilizado/versionado | Descuadre, periodo cerrado, origen repetido incompatible |
| ClosePeriod | Conciliaciones, pendientes y firmas aceptadas | Cierre y bloqueo; corte consistente | Cola sin conciliar, diferencias no aprobadas |
| ReopenPeriod | Política/permiso extraordinario, motivo | Reapertura acotada y nueva revisión | Usuario ordinario, edición silenciosa |

No son endpoints implementados. Idempotencia siempre scoped por organización/origen/operación; misma clave con contenido distinto genera conflicto, no “success” ficticio.

## Máquina de estados por objeto
Cargo: capturado → en revisión → validado → comprometido en documento → emitido; corrección genera ajuste ligado.
Pago: iniciado → pendiente de confirmación → confirmado → reversado; aplicado/conciliado son cantidades/vínculos, no un único bool.
Documento fiscal: preparado → validado → firmado → en transmisión → aceptado/rechazado/desconocido. Estados de eventos fiscales deben ajustarse a anexos MH recuperados; no deducir invalidación solo de “cancelled”.
Reclamación: preparada → presentada → recibida → observada/adjudicada → apelada/revisada → liquidada/cerrada.
Asiento: borrador → validado → contabilizado → reversado.
Reversos conservan origen, actor, causa y magnitud; no reutilizan número fiscal ni eliminan documento.

## Invariantes de montos y cantidades
Usar decimal y precisión definida; no float monetario. Conversión y redondeo por línea/documento según reglas oficiales/contractuales; política de residuo determinista y auditable.
Para recibo confirmado: monto = aplicaciones efectivas + devoluciones efectivas + saldo no aplicado, con ajustes tipados explícitos.
Para deuda: saldo = reconocimiento + ajustes débito - ajustes crédito - aplicaciones efectivas; no confundir provisión/deterioro con pago.
Distribución de responsabilidad explica total facturable. Lo no cubierto no se transfiere automáticamente a paciente.
Asiento por moneda/libro balanceado; dimensiones y cuentas vigentes. Stock/costos tienen unidades y valoración propias.
La tolerancia de conciliación no autoriza descuentos escondidos; diferencias tienen cuenta/motivo/aprobación.

## Concurrencia
ApplyReceipt bloquea/revalida recibo y deuda en orden determinista; valida ambos saldos dentro de la transacción. RowVersion aislado en una factura no protege todo el conjunto.
CaptureCharge tiene unicidad de origen y versión; corrección usa evento diferente relacionado.
PostJournal garantiza unicidad del evento económico; reenvío no crea segundo asiento.
No mantener transacción BD abierta durante firma/transmisión remota. Outbox local y estados de compensación.
En cargas concurrentes, la estrategia SQL Server se verifica con el aislamiento y restricciones elegidos; no se prescribe READ COMMITTED como suficiente.

## Tres conciliaciones diferentes
1. Aplicación: qué deuda liquida un pago/anticipo.
2. Bancaria: qué movimientos del libro constan en estado bancario.
3. Sistema/contable: eventos hospitalarios, documentos y asientos recibidos por ERP.
S310 respalda esta separación en ERPNext; no copiar sus asignaciones FIFO sin política hospitalaria.
Una remesa puede contener varias reclamaciones, ajustes, comisiones o retenciones. Registrar desglose de contraparte; importe sin explicación queda pendiente.

## Seguros: obligaciones y errores
Autorización por servicio/importe/vigencia, renovaciones y cambios de plan. Congelar evidencia de autorización al prestar.
Glosa distingue falta documental, tarifa, cobertura, duplicado, denegación y discrepancia clínica. Dueño competente; facturación no modifica nota médica para satisfacer seguro.
Reenvío de reclamación distingue versión de intento para no duplicar CxC.
Remesa parcial no cierra reclamación completa. Diferencias requieren adjudicación/aceptación documentadas.
Definir plazos por convenio real y mecanismo de intercambio; no imponer modelos estadounidenses al hospital.

## Cierre y transacciones tardías
Corte consistente por fecha contable, entidad, libro y moneda; registrar pendientes de integración a la misma fecha.
Conciliar cuentas control/submayores, pagos en tránsito, anticipos, seguros, impuestos, honorarios y caja.
Excepciones aprobadas no equivalen a conciliación: registrar importe/riesgo/responsable y tratamiento.
Documento tardío conserva fecha de servicio; fecha de contabilización según política y periodo abierto. Reapertura audita nueva versión de cierre y reportes.
S312 es referencia de lock dates; configuración y comportamientos de versión se prueban.

## DTE y tratamiento tributario
Se descargaron normativa DTE 2.0 y manual funcional 2.0 oficiales. Se verificaron portada y secciones seleccionadas; no se afirma lectura integral. El capítulo 08 documenta el alcance y las pruebas mínimas recuperadas.
No fijar tasa de IVA, plazo de contingencia, invalidación, retorno ni fecha de transición normativa sin artículo/anexo leído y aplicabilidad confirmada.
Conservar artefacto firmado/respuesta/hash y ambiente; emisión económica, fiscal y entrega al receptor tienen evidencias separadas.
Integración fiscal en fallo desconocido entra a reconciliación, no a emisión nueva automática. Las reglas finales de reintento deben seguir el manual técnico vigente.

## Seguridad y auditoría
Contador no necesita notas clínicas completas; seguro recibe lo mínimo contractual/legal; caja no aprueba su propio ajuste.
Cambios de tarifa/cuenta bancaria de tercero/permisos/cierre requieren evidencia y revisión independiente.
Auditoría de lectura/exportación y de comandos económicos, con actor real, autorización, motivo, correlación y resultado.

