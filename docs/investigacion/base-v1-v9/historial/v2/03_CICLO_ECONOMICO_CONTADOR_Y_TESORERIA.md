# Circuito económico hospitalario: contrato operativo candidato
No describe procedimientos ya verificados en CLIMESA. Referencias: V2-06 a V2-11; código en 01.
FHIR diferencia cuenta, cobertura, reclamación y reconciliación [V2-07]; no es un mayor contable ni exige que una aseguradora local use FHIR. Odoo y ERPNext aportan patrones ERP; su localización fiscal debe verificarse por separado.

## Modelo y responsabilidades
Separar paciente, episodio, obligado al pago, contrato, autorización, prestación, cargo, factura fiscal, reclamación, pago, aplicación y asiento.
El paciente puede no ser el cliente fiscal ni el responsable del saldo. Una cuenta puede tener varios pagadores y varios documentos; un pago puede aplicarse a varios saldos.
Mantener fecha asistencial, fecha de cargo, fecha contable, fecha fiscal, liquidación bancaria y vigencia contractual.

Caja cobra y arquea; facturación valida cargos y documentos; seguros gestiona autorizaciones/reclamaciones; contador configura reglas/revisa mayor/cierra; tesorería concilia y paga; compras solicita/negocia; almacén recibe; dirección aprueba excepciones. Incompatibilidades según personal disponible con revisión compensatoria, nunca un superusuario sin trazabilidad.

## E01 — Prestación a ingreso y cuenta por cobrar
Disparador: evidencia de servicio efectuado, consumo autorizado o hito contractual.
Estados de cargo: capturado, pendiente de revisión, validado, asignado a pagador, facturado, corregido/revertido.
1. Consumir evidencia de prestación con identificador estable, episodio, profesional, servicio, cantidad/unidad, instante y versión.
2. Evaluar tarifa vigente, cobertura, paquete, exclusiones y responsable. Guardar regla aplicada y resultado; no recalcular facturas históricas con tarifas nuevas.
3. Deduplicar origen; si falta tarifa/contrato, enviar a cola con responsable y plazo.
4. Facturación revisa cargo, pagadores y evidencia. Orden solicitada no implica automáticamente ingreso; el hito depende de la política aprobada.
5. Crear documento económico y reconocimiento conforme a política de devengo; el momento del DTE puede requerir una regla distinta.
6. Publicar asiento y CxC con referencias cruzadas; mantener estados separados de emisión fiscal y pago.
Excepciones: cancelación parcial, servicio no realizado, prestación externa, cargo tardío, cambio de cobertura, corrección clínica posterior, descuento aprobado.
Automatización: captura de cargo, reglas tarifarias, conciliación prestación/cargo. Aprobación humana: excepción, descuento, regla nueva.
Validación: un origen produce un solo cargo efectivo; corrección conserva versión y efecto inverso. Monto facturado y CxC se reconcilian por documento/pagador.

## E02 — Anticipos y aplicación
Disparador: ingreso de fondos antes de completar prestaciones.
Registrar pagador, medio, referencia bancaria, caja/turno, cuenta beneficiaria y recibo. Mantener saldo no aplicado.
La propuesta contable trata el anticipo como obligación/saldo del cliente hasta su aplicación conforme a política; no contabilizarlo automáticamente como venta.
Aplicar solo saldo disponible a deuda compatible; concurrencia evita aplicación doble. Si la operación no llegó al servidor, consultar por clave antes de repetir.
Devolución: solicitud, revisión independiente, autorización, ejecución en medio aprobado, evidencia y reverso; no eliminar recibo.
Validación: recibido = aplicado + devuelto + saldo, considerando ajustes explícitos.

## E03 — Cobro, caja y tarjeta
Pago capturado, confirmado, aplicado, conciliado o reversado. Para tarjeta, distinguir autorización, liquidación, comisión y contracargo.
Controlar límites de caja/turno, medio permitido, moneda, referencia, sobrepago y saldo bajo transacciones concurrentes.
No almacenar datos completos de tarjeta; conservar referencias del proveedor según contrato y alcance real.
Cierre: conteo por medio, esperado, contado, diferencia, explicación, revisión y entrega. Un POS correcto no prueba un depósito bancario correcto.
Automatizar cruces; no aprobar automáticamente diferencias ni reutilizar un cierre firmado.
Validación: suma de movimientos del periodo completo; no calcular sobre 300 filas. Reapertura necesita motivo y permiso separado.

## E04 — Aseguradora: de cobertura a remesa
Registrar póliza, titular, vigencia, límites, cobertura confirmada y autorización independiente. Elegibilidad no garantiza pago.
Preparar expediente de reclamación con datos mínimos acordados, prestaciones, tarifas, autorización y documentación contractual. Controlar enviado, recibido, observado, resubmitted, adjudicado y cerrado.
Remesa: distribuir importe por reclamación/línea; identificar glosa, deducible, copago, retención y ajuste contractual según evidencia. Dinero no asignado queda en cuenta de suspense revisable.
Glosa: motivo codificado, dueño, vencimiento contractual, evidencia, apelación y resultado. No trasladar automáticamente a paciente una negativa.
Validación: remesa completa reconciliada; nadie puede cambiar contrato histórico para ocultar diferencia.
Automatización: vencimientos, documentos faltantes, seguimiento y propuestas de aplicación. Pendiente local: formatos y conexiones de cada aseguradora.

## E05 — Compras, recepción, CxP y pago
Solicitud con centro de costo → disponibilidad presupuestaria → aprobación → cotización/selección → orden multilínea → recepción parcial → inspección/cuarentena → factura → cotejo → vencimiento → propuesta de pago → doble aprobación según política → banco → conciliación.
Separar cantidad ordenada, recibida, aceptada, devuelta y facturada; tolerancias configuradas por vigencia.
Cotejo de tres vías: orden, recepción y factura. Factura sin orden requiere excepción documentada. No pagar la recepción como si fuera gasto instantáneo.
Recepción no facturada: política de provisión/devengo; factura posterior reconcilia sin duplicar costo. Tratamiento fiscal a validar.
Validaciones: identificador de proveedor + documento evita duplicados; impedir factura sobre recepción inexistente fuera de excepción; modificaciones bancarias de proveedor necesitan verificación independiente.
Consignación: posesión no significa propiedad; consumo y liquidación tienen reglas separadas.

## E06 — Inventario, costo y cargos
FEFO orienta uso físico por vencimiento; método de valoración contable es otra política.
Registrar cantidades/unidades, conversión, ubicación, lote, expiración, calidad, propietario y documento de entrada/salida. Balance por lote/ubicación; reservas no son consumo.
Dispensar, administrar, devolver y desechar son eventos distintos. Evitar cargo y costo duplicados al retransmitir.
Retiro: bloquear disponibilidad, localizar saldo y usos; trazabilidad hasta episodio y responsable.
Conteo: congelamiento lógico o control de movimientos, conteo ciego, diferencia, aprobación y ajuste con motivo.
Validación: movimientos explican existencia y valoración; merma no se disfraza de atención.

## E07 — Honorarios
Contrato por profesional y vigencia; elegir si nace por prestación, factura, cobro u otro hito aprobado.
Distinguir principal/agente, profesional independiente/empleado, factura propia/tercero y deducciones contractuales.
Liquidación por prestación con ajustes, pagos parciales, devoluciones y comprobantes. Evitar pagar dos veces un servicio y recomputar liquidaciones cerradas.
El tratamiento de retenciones, renta y servicios debe validarse legalmente. No fijar tasas aquí.
Validación: honorario devengado = pagado + pendiente + ajuste explícito según libro auxiliar.

## E08 — Nómina y personal
Integrar turnos/incidencias aprobadas con nómina, contratos y beneficios. Evitar que el HIS se convierta accidentalmente en sistema de cálculo laboral sin validación.
Controlar altas/bajas, incapacidad, horas, retroactivos, deducciones y conciliación de obligaciones; separar acceso de RRHH del expediente clínico.
Pendiente: frecuencia, régimen, proveedor actual y reglas de ISSS/AFP vigentes.

## E09 — Bancos
Importar estados con huella y referencia; detectar duplicados por archivo/transacción. Proponer coincidencia por importe, fecha, referencia y pagador; registrar confianza y ambigüedad.
Conciliar cobros, remesas, comisiones, depósitos, pagos y transferencias. Movimiento entre bancos no es ingreso nuevo.
No autoaplicar importes ambiguos. Ajuste necesita motivo y cuenta aprobada. Pendiente de revisión debe tener dueño/antigüedad.
Validación: saldo libro + partidas conciliatorias explica banco; reversos mantienen auditoría.

## E10 — Mayor y cierre
Plan de cuentas y dimensiones versionados: entidad/sede/servicio/centro/proyecto según necesidad.
Asiento: borrador → validado → contabilizado → reversado. Imponer débito=crédito, cuentas vigentes, periodo abierto, moneda y origen único. No borrar contabilizados.
Cierre: CxC/CxP/caja/bancos/inventarios/activos/honorarios/impuestos y suspense reconciliados, provisiones/aprobaciones, balance, firmas y bloqueo.
Transacción tardía: política de periodo siguiente o reapertura autorizada; conservar periodo original de prestación.
Automatización: conciliaciones y detección de descuadres. El contador decide provisiones/estimaciones y la aprobación final.

## E11 — Activos y costos
Compra, puesta en servicio, ubicación/custodio, mantenimiento, depreciación, deterioro y baja. Equipo inseguro se bloquea para agenda mediante integración.
Costo por servicio/episodio combina consumos, profesionales y costos indirectos según metodología aprobada. Distinguir costo, precio, ingreso devengado y cobro.
Mantener criterios/versiones de distribución; no convertir margen aparente en indicador clínico.

## E12 — Correcciones y contingencia
DTE rechazado no significa prestación inexistente; fallo ERP no cancela atención. Mantener cola durable con estado y responsable.
Reintentos con idempotencia, backoff, observabilidad y reconciliación. Compensación genera eventos enlazados, no deletes.
Auditar ajustes y exportaciones. Recuperación: comparar eventos enviados/recibidos/asientos, resolver pendientes antes de habilitar cierres.
Las reglas de contingencia fiscal y entrega al receptor se completan con anexos MH vigentes.

## Asientos de referencia, sujetos a política local
No usar números de cuenta fijos. Prestación reconocida: Dr CxC / Cr ingreso y tributo si corresponde. Cobro: Dr caja/banco o cuenta puente / Cr CxC. Anticipo: Dr caja/banco / Cr anticipos de clientes. Compra: Dr inventario/gasto/activo y créditos fiscales permitidos / Cr proveedor. Pago proveedor: Dr proveedor / Cr banco. Consumo: Dr costo / Cr inventario.
No son una recomendación tributaria; principal/agente, exenciones, devengo y terceros pueden cambiar el tratamiento.

## Indicadores y aceptación
Cobros no equivalen a ingresos; saldo pendiente no equivale a deuda vencida. Definir antigüedad por vencimiento, días de reclamación, tasa de glosa por cohorte, cargos pendientes, remesas sin aplicar y diferencias de caja.
Cada indicador conserva denominador, filtros, corte, zona horaria y versión; drill-down autorizado a evidencias.
Una integración se acepta cuando montos, cantidades, identificadores y estados reconciliados sobreviven a reenvíos y caídas, no cuando aparece una factura de demostración.

