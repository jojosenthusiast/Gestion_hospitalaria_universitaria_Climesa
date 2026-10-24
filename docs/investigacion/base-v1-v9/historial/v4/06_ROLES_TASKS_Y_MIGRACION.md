# Permisos, tareas y adopción de este grupo
## Segregación propuesta
| Función | Puede ejecutar | Revisión/limitación |
|---|---|---|
| Solicitante | Requisición justificada | No se autoaprueba por defecto |
| Compras | Proveedor/orden/enmienda | Cuenta bancaria/proveedor bajo revisión independiente |
| Almacén | Recepción, custodia, traslado, conteo | No libera calidad clínica ni aprueba su ajuste sin política |
| Calidad/farmacia | Evaluación/liberación, validación/preparación | Privilegios profesionales; evidencia y versión |
| Prescriptor | Orden/modificación/suspensión | Autor real/habilitación, cofirma según protocolo |
| Enfermería | Recepción nominal/tareas/administración/omisión | No reescribe orden ni firma por otro |
| Contador | Devengo, valoración, CxP, asientos/cierre | No necesita expediente clínico completo |
| Tesorería | Propuesta/ejecución/conciliación pagos | Doble control según límites aprobados |
| Auditor | Evidencia de operaciones/controles | Mandato/periodo y exportación registrados |
| TI | Operar integración/disponibilidad | Acceso técnico no confiere privilegio clínico |

## Tasks candidatas
| ID | Entrega | Dependencia | Aceptación |
|---|---|---|---|
| T401 | Catálogo de presentación/unidades/propiedad/lote | T301/T304, farmacia/contador | AC401–404 |
| T402 | Requisición y orden versionadas | T401, políticas compras | AC405–406 |
| T403 | Recepción parcial por lote/condición | T402, almacén/calidad | AC407–411 |
| T404 | Devolución/cotejo/factura CxP | T403, T307 y contratos | AC412–415 |
| T405 | Transferencia/reserva/custodia | T401/403 | AC416–419 |
| T406 | Valoración/revaloración/cierre | T307/404/405, política costos | AC420–422 |
| T407 | Prescripción estructurada y versiones | T304/401, privilegios | AC423–425 |
| T408 | Validación farmacéutica/aclaración | T407, catálogo/rules gobernadas | AC426–427 |
| T409 | Preparación/genealogía y dispensación | T405/408, protocolo preparación | AC428–430 |
| T410 | eMAR/tareas/infusiones/omisión | T407/409, enfermería | AC431–434 |
| T411 | Retorno/residuo/corrección | T409/410, política calidad | AC435–437 |
| T412 | Controlados/recall/farmacovigilancia | T403/410/411, legal vigente | AC438–440 |
| T413 | Eventos físico-clínico-económicos | T305/307 + T403–412 | AC441–442 |
| T414 | Contingencia/migración/reconciliación | T310/413, procedimientos aprobados | AC443–444 |

Todas son propuestas de construcción; no implementadas ni estimadas. Los 44 criterios se adjuntan con estado NO_EJECUTADO. No elegir responsables nominales del hospital sin organigrama.

## Migración
Conservar Product/Batch/Purchase/Movement legacy y procedencia. Clasificar stock propio, consignado y de paciente por evidencia; no asumir propiedad por tabla.
No inferir ubicación real de stock global sin conteo/custodia. Importar cantidad y condición con revisión; saldo antiguo no se considera automáticamente liberado.
Prescripción histórica en texto permanece documento; no activar horarios/dosis por parsing/OCR sin revisión. Vincular ProductId solo cuando presentación/unidad se verifican.
Reference libre queda nota de origen; no derivar un PatientId de cadenas o números ambiguos.
Purchase Received no demuestra factura/pago ni aceptación sanitaria. Conservar como recibo legacy y reconstruir enlaces documentales revisados.
Inventario inicial necesita cantidad/valoración reconciliados con contador; UnitCost no disponible no se rellena con precio de venta.
Desactivación de lote/proveedor se clasifica antes de migrar; conservar consulta histórica y bloquear nuevas operaciones según motivo.
Corte contempla stock en tránsito/piso/preparación, dosis entregadas no administradas, controlados, pendientes de retorno y recibido no facturado.
Rollback incluye recolección de eventos después del corte; restaurar BD sin reconciliar administraciones/pagos posteriores no es recuperación segura.

## Evaluación funcional de productos
ERPNext/Odoo: demostrar compra parcial, rechazo, diferencia de factura/costo, periodos, consignación y dueño.
GNU Health: demostrar catálogo/pauta/stock y enlace económico en versión instalada; documentación no prueba ejecución local.
Bahmni: demostrar tareas eMAR, modificación, urgencia y omisión; referencia indexada pendiente de lectura completa y validación.
Ninguno recibe aprobación por anunciar farmacia/inventario. Exigir licencia, mantenimiento, exportación, interfaces y soporte de versiones.

