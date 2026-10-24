# Contratos entre los dominios
Propuestas derivadas de brechas, no funciones implementadas. Los hitos económicos requieren política de contador y contratos de CLIMESA.

| Evento / comando | Cambio físico o clínico | Efecto económico candidato | Invariante |
|---|---|---|---|
| OrdenCompraEmitida | Compromiso de suministro; no stock | Presupuesto/compromiso según política; no pago automático | Versión aprobada y origen estable |
| RecepcionRegistrada | Custodia y condición, cantidades por lote | Devengo/valor provisional si propiedad/control adquiridos | No todo lo recibido está liberado |
| LoteLiberado | Elegibilidad por calidad/cantidad | No genera compra nueva | Evidencia/autoridad y versión de estado |
| FacturaProveedorContabilizada | Ninguna entrada física adicional si hubo recepción | CxP y reconciliación de recepción/tributos/diferencias | No duplicar inventario |
| PagoProveedorConfirmado | Ninguno | Banco/aplicación CxP/anticipo | Confirmación y aplicación únicas |
| TransferenciaEnviada/Recibida | Origen → tránsito → destino | Sin ingreso/costo de consumo por mero traslado | Custodia y cantidad conservadas |
| OrdenMedicamentoFirmada | Autoriza tratamiento, no ejecución | Puede reservar; hito cargo definido aparte | Orden no equivale a prestación realizada |
| DispensacionConfirmada | Entrega/reserva/salida según modalidad | Cargo y/o costo según hito aprobado | No restar otra vez al administrar |
| AdministracionRegistrada | Dosis efectiva o motivo no realizada | Cargo/costo si este es el hito aprobado | No cobrar todas las omisiones por defecto |
| DevolucionRecibida | Custodia a cuarentena/evaluación | Propuesta de ajuste; no devolución fiscal automática | Vínculo a salida y cantidad disponible |
| DesperdicioConfirmado | Pérdida de cantidad utilizable | Costo/merma según política | Motivo/evidencia; no paciente por defecto |
| RetiroLoteAbierto | Bloqueo/localización | Deterioro/reclamación según política | Block debe llegar a consumidores |
| PreparacionLiberada | Producto preparado con genealogía | Transferencia de costo/rendimiento según método | No doble contabilización de insumo y producto |
| CorreccionClinicaFirmada | Corrige evidencia/versiones | Revisar efecto; no cambiar libro silenciosamente | No inventar retorno físico |
| ConteoAjustado | Ajuste autorizado tras investigación | Diferencia contable aprobada | Corte consistente y evidencia |
| CierreInventarioContable | No cambia cantidad | Conciliación físico/valorado/mayor | Partidas pendientes explícitas |

## Datos comunes de eventos
eventId, sourceSystem/sourceDocument/sourceLine, organización, aggregateId/version, correlationId, instante efectivo/captura, actor/autoridad, unidad/cantidad o importe/moneda, referencias de atención/orden cuando necesarias y versión de regla.
Eventos clínicos enviados al ERP llevan información mínima; contador no recibe notas completas para contabilizar.
Reenvío mismo ID/contenido devuelve mismo resultado; mismo ID/contenido distinto genera conflicto. Aplicar efecto local con outbox; consumidor con inbox deduplicado.
Orden por agregado y resolución de versiones obsoletas. No compartir locks SQL con servicios remotos ni prometer exactamente una entrega de red.
ACK técnico no equivale a validación clínica/contable; confirmar recepción y estado de negocio por separado.

## Conservación y reconciliaciones
Existencia por dimensiones = inicial + entradas - salidas ± ajustes tipados. Reservas no son salidas; bloqueos no se restan dos veces.
Cantidad dispensada debe explicar custodia pendiente, administrado/consumido, retornado, desperdicio y discrepancia abierta según unidad/modalidad.
Preparaciones conservan genealogía y material balance según protocolo/producto; masa, volumen, actividad y unidades no se suman sin dimensiones compatibles.
Cargo efectivo por origen/hito/regla único; corrección produce ajuste ligado. Costo no se vuelve precio de venta.
Compra recibida/facturada/devengada/pagada se concilia por línea, moneda/entidad; diferencias explícitas, no corrección oculta de cantidades.

## Decisiones por modalidad
1. Stock de piso: reposición = traslado; uso nominal = consumo/administración según política.
2. Dosis individual: entrega puede ser reserva/custodia o consumo logístico; definir si el saldo sigue hospitalario antes de administración.
3. Dispensación para llevar: entrega al paciente es salida; toma domiciliaria reportada no genera segunda salida.
4. Consignación: dueño externo hasta hito contractual; consumo y liquidación proveedor con trazabilidad.
5. Preparación: insumos a producto final con salida/residuo; no duplicar costo en ambas etapas.
6. Medicamento propio: custodia externa, cargo de administración si lo permite contrato; no cargo por producto comprado inexistente.

## Exclusión y estado
Reserva debe proteger cantidad elegible en versión vigente; comprobar nuevo retiro/vencimiento en ejecución.
Dos recepciones del mismo documento no incrementan dos veces; compra antigua en Received no sirve por sí sola de clave del intento.
Detención de orden y administración simultáneas requieren temporalidad, revisión y conflicto visible; no fingir que una dosis real no ocurrió.
Corrección en periodo cerrado usa ajuste o reapertura autorizada; precios/reglas históricas conservados.
Integración caída genera cola con dueño/SLA aprobado y reconciliación. Una factura rechazada o ERP caído no borra evidencia asistencial.

