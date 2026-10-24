# Inventario: cantidad, condición, propiedad y valor
Dueños: almacén/farmacia/calidad/contador. Contrato candidato; no define tratamiento contable final.

## Datos de stock
Producto y presentación, fabricante, lote, serial cuando aplique, unidad base, ubicación, propietario, condición de calidad, expiración, vida útil tras apertura/preparación, saldo físico y reservas.
La ubicación identifica lugar; la calidad determina elegibilidad; el propietario determina derechos y valoración. Ninguno reemplaza los otros.
Producto farmacéutico: principio(s) activo(s), concentración con unidades, forma, presentación/envase, código comercial/registro relevante y restricciones de manejo. No deducir equivalencia de nombres parecidos.
Dosis (masa/actividad), volumen y unidad logística no son intercambiables. Conversión comercial caja→unidad no es regla clínica de dosis.
Catálogo/versiones se revisan por responsables; no usar texto libre Dosage como instrucción ejecutable.

## INV01 — Libro físico
Movimiento durable con origen único, dimensiones antes/después, cantidad/unidad, tipo, instante efectivo/captura, actor y custodios.
Entradas/salidas deben explicar saldo. Traslado interno requiere salida, tránsito y recepción; no genera compra/venta ni costo de consumo automáticamente.
Elegibilidad propuesta: saldo en condición liberada, no vencido/retirado/bloqueado, dentro de vida útil pertinente y propiedad/uso permitido, menos reservas aplicables.
No sumar dimensiones incompatibles ni restar varias veces el mismo bloqueo. Reservas son relaciones sobre stock, no otra existencia física.
Revalidar elegibilidad al reservar, preparar, entregar y utilizar; una liberación antigua no protege frente a recall nuevo.

## INV02 — Rotación y disponibilidad
FEFO ordena lotes elegibles por expiración; política define excepciones justificadas y vida útil necesaria para destino/uso.
Valoración FIFO/promedio/identificación específica no cambia esa prioridad clínica. S403 y S407 sirven para investigación de métodos/calidad, no para elegir política automáticamente.
Caducidad sin hora exacta requiere convención por etiqueta/producto y zona horaria aprobada; no inventar fin de día universal.
Stock inicial, donado, muestras, consignado y propio se distinguen. Costo cero requiere fundamento y revisión, no ausencia de dato.

## INV03 — Transferencias y stock de piso
Farmacia central → botiquín/servicio → custodia individual/administración:
- Traslado a piso conserva existencia hospitalaria y propietario.
- Entrega específica a paciente registra asignación/custodia y si constituye salida de inventario según modelo aprobado.
- Administración no vuelve a restar la misma salida registrada; si el modelo consume al administrar, la entrega previa fue transferencia/reserva.
Elegir y documentar un modelo coherente por modalidad, con compatibilidad entre stock de piso y dispensación nominal.
Conteos por turno deben distinguir pendiente de entrega, administrado, devuelto y desperdiciado.
No ubicar stock de personas distintas en un saldo indiscriminado; medicamentos del paciente llevan registro separado.

## INV04 — Preparación y reempaque
Orden/preparación vincula materiales de entrada, lotes, cantidades/unidades, recipiente final, rendimiento, residuo, responsables, etiquetas y vida útil validada.
Genealogía de muchos insumos a preparación y de preparación a dosis. Retiro de insumo puede afectar varias preparaciones.
Reconstitución no convierte concentración automáticamente desde nombre del producto. Cálculos/estabilidad/protocolos requieren validación farmacéutica.
No aplicar recetas de fabricación de ERP como protocolos clínicos sin revisión.
Preparación abortada conserva consumo/residuo; no registrar producto final liberado. Preparación ya administrada no puede reponerse por cancelar orden.

## INV05 — Retiro y excursión térmica
Abrir incidente, identificar producto/lote/serie/periodo, bloquear stock y usos pendientes, localizar ubicaciones/traslados/preparaciones y atenciones expuestas.
Separar retiro regulatorio, retiro del proveedor y cuarentena preventiva; evidencia y autoridad para liberar.
Alertas con responsable/acuse; evaluación clínica de pacientes expuestos por personal habilitado.
Retirada física, notificación y cierre son hitos distintos. No cerrar mientras hay custodios sin respuesta o unidades sin localizar.
Temperatura/condiciones de fabricante se parametrizan por presentación; sensor fallido no equivale a cadena de frío correcta.
Disposición final exige procedimiento legal aplicable y evidencia, especialmente en controlados; el ajuste contable no sustituye autorización.

## INV06 — Conteo y ajuste
Plan por área/lote/propietario, conteo ciego, corte consistente o trazabilidad de movimientos durante conteo, reconteo y autorización.
Registrar diferencia como caso; causa puede ser unidad equivocada, traslado no aceptado, administración tardía, daño o pérdida.
No ajustar automáticamente libro para que cuadre con conteo. Investigación y permisos separados de quien custodia.
Ajuste con motivo, evidencia y efecto económico aprobado; no borrar movimientos.
Aceptación: conteo concurrente no duplica traslado ni “borra” salida posterior al corte.

## VAL01 — Valoración y costo
Libro valorado por entidad/propiedad/producto/ubicación según metodología aprobada. Precio de venta y UnitCost de última compra no equivalen al valor de saldo.
Base de costo: precio y gastos atribuibles aprobados, descuentos y tributos según tratamiento vigente; unidades y moneda consistentes.
Recepción provisional/factura definitiva: diferencia genera revaloración/ajuste trazable según política, incluidos consumos ya ocurridos y periodos cerrados. No reescribir silentemente todos los costos históricos.
Costos incidentales tardíos tienen asignación auditable; costo de consignación nace en hito contractual, no al recibir físicamente.
No conservar simultáneamente dos autoridades editables de valuation en HIS y ERP.
Saldos físicos, valorado y mayor se concilian; stock no utilizable puede requerir deterioro/baja separados del retiro físico.

