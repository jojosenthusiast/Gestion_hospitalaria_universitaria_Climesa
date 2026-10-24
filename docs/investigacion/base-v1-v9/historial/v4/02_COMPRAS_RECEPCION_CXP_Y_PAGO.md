# Compras y cuentas por pagar: contratos candidatos
Dueños por confirmar: solicitante del servicio, compras, aprobador, almacén, farmacia/calidad, contador y tesorería.
Referencias S401–S405 ofrecen patrones ERP; las políticas de CLIMESA deben aprobarse localmente.

## CP01 — Planificar y solicitar
Disparador: demanda, mínimo de stock, nueva prestación, mantenimiento o compra extraordinaria.
Capturar producto/especificación, unidad, cantidad, fecha requerida, centro de costo, necesidad clínica, presupuesto y proveedor sugerido.
Revisar existencias utilizables, reservado, en tránsito y órdenes abiertas antes de proponer compra. No disparar pedido de medicamentos automáticamente por número de pacientes sin demanda validada.
Requisición: borrador → presentada → aprobada/rechazada → cubierta/parcial → cerrada/cancelada.
Compra urgente: vía excepcional con fundamento, autoridad y revisión posterior; no borra controles de lote/calidad.
Automatizar propuesta y seguimiento; selección/adjudicación y excepción tienen responsable.
Aceptación: no duplicar demanda; reorden no cuenta cuarentena como disponible; cambios de cantidad después de aprobación exigen nueva revisión según política.

## CP02 — Calificar proveedor y ordenar
Proveedor: identidad fiscal, autorización relevante, categoría, evidencias, desempeño, cuentas bancarias verificadas y estado por ámbito.
Inhabilitar compras nuevas sin ocultar documentos históricos ni saldos. Cambio de cuenta bancaria exige revisión independiente.
Orden multilínea: producto/presentación, unidad/conversión, precio/moneda, impuestos aprobados, tolerancias, entrega, vida útil remanente acordada, condiciones de calidad y pago.
Preservar versión firmada/aprobada. Enmienda enlazada y comunicada al proveedor; recepción se compara con la versión aplicable.
Estados: emitida, confirmada, parcialmente recibida, cumplida, cierre parcial, cancelada. La factura y el pago son otros objetos.
Aceptación: no pagar por contar con una orden; no cerrar saldo pendiente sin decisión; no reutilizar una aprobación para una orden materialmente distinta.

## CP03 — Recibir físicamente por entrega/lote
Registrar proveedor, orden/línea, documento de transporte, producto exacto, lote fabricante, expiración, cantidades/unidades, ubicación, condiciones de transporte y receptor.
Distinguir descargado, en cuarentena, aceptado, rechazado y devuelto. Desviación térmica produce evaluación competente, no disponibilidad automática.
Una línea puede llegar en varios lotes y entregas; una recepción puede incluir varias líneas. Tolerancia de sobreentrega se autoriza según política, no se deduce de stock faltante.
Si lote ya existe y contradice expiración/fabricante, bloquear conciliación y resolver sin sobrescribir la genealogía.
Retener evidencia documental y de calidad. Vida útil remanente se define por producto/contrato/evidencia; no fijar porcentajes arbitrarios.
Aceptación: cantidad recibida explica disposiciones; operación repetida no incrementa stock otra vez; no liberar lote por haber llegado.

## CP04 — Inspeccionar, liberar y devolver
Responsable competente verifica identidad, embalaje, etiqueta, integridad y condiciones según catálogo/SOP.
Liberación explícita por cantidad o unidad; rechazos conservan motivo. Mantener estado de calidad separado de ubicación física.
Devolución al proveedor: autorización/logística → separación → entrega con custodia → confirmación → ajuste de compra/CxP según evidencia.
No confundir devolución física con devolución de dinero o nota de crédito del proveedor. Retraso de documentos comerciales queda pendiente reconciliable.
Aceptación: stock bloqueado no se dispensa; rechazo parcial no elimina lo aceptado; devoluciones no exceden saldo con custodia disponible.

## CP05 — Factura y cotejo por línea
Factura del proveedor con identificador fiscal/comercial, emisor, importe, moneda, vencimientos y vínculos de línea a orden/recepción.
Cotejo compara producto, cantidades, precios, ajustes/tributos y condiciones; no solamente tres totales iguales.
Separar facturado recibido, facturado no recibido autorizado, recibido no facturado y diferencias. Un DTE válido no demuestra entrega correcta.
Facturas duplicadas: unicidad por emisor/tipo/identificador conforme al formato y organización; similitudes en importes van a revisión.
Servicios/activos/consignación tienen rutas propias; no fingir recepción de cajas para pagar electricidad u honorarios.
Estados: capturada, validada fiscalmente cuando aplique, en cotejo, aprobada para contabilizar, contabilizada, disputada, ajustada.
Aceptación: factura no duplica stock si ya existe recepción; cierre conserva diferencias; devoluciones/bonificaciones quedan en documentos ligados.

## CP06 — Devengar y programar pago
Recepción con propiedad/control adquiridos puede generar obligación provisional según política contable; factura confirmada reconcilia el devengo, no contabiliza inventario dos veces.
Contador revisa cuentas, dimensiones, impuestos, periodos y diferencias. S401/S402 respaldan el patrón ERP de recibido no facturado; la aplicación legal-contable local sigue pendiente.
Tesorería prepara propuesta por vencimiento, saldo, autorizaciones y disponibilidad de fondos. Pago parcial deja saldo correcto; anticipo a proveedor es otro saldo/aplicación.
Roles: quien registra proveedor/cuenta no aprueba y ejecuta solo su pago sin control compensatorio documentado.
Aceptación: dos propuestas concurrentes no pagan la misma obligación dos veces; pago bancario pendiente no se marca completado por iniciar el envío.

## CP07 — Pago, conciliación y cierre
Registrar instrucción/confirmación del banco, referencia, importe, moneda, comisiones/retenciones autorizadas y aplicaciones a facturas.
Pérdida de respuesta bancaria: reconciliar antes de repetir; mismo intento no emite segunda transferencia automáticamente.
Conciliar cuentas proveedor, bancos, anticipos y recepción no facturada; explicar partidas de larga antigüedad.
Cierre parcial de orden no cierra CxP; proveedor inactivo mantiene deuda/exportación histórica con permisos.
Aceptación: saldo de proveedor reconciliado; comprobante de transferencia y documento pagado enlazados; reversos conservan evidencia.

## CP08 — Reclamación comercial
Diferencia de entrega/calidad/precio se transforma en caso con dueño, evidencia, fecha contractual, respuesta, propuesta y decisión.
No descontar unilateralmente una diferencia sin base aprobada; no alterar recepción para igualar una factura.
Automatización: alertas de órdenes/reclamaciones pendientes; no aprobación autónoma de tolerancias o proveedor.
Métricas: entregas completas/a tiempo con definición, rechazo por lote/proveedor, órdenes abiertas, recibido no facturado y tiempo de cotejo. No inventar desempeño de CLIMESA.

