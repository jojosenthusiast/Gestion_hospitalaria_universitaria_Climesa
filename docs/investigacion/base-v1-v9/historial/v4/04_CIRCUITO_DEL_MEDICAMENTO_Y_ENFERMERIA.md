# Prescripción, farmacia y enfermería
Contrato candidato de operación. La validación de contenido clínico corresponde a dirección médica/farmacia/enfermería; este dossier no prescribe dosis ni protocolos terapéuticos.
S408–S410 distinguen orden, suministro y evento de administración. FHIR es referencia de intercambio, no obligación de copiar su esquema.

## MED01 — Conciliar e identificar tratamiento
Al ingreso/traslado/alta recuperar medicación previa con origen/fecha y grado de verificación. Distinguir uso reportado de orden autorizada actual.
Revisar duplicidades/discrepancias con personal competente y documentar resolución; no convertir una lista importada en órdenes activas automáticamente.
Alergia desconocida no significa sin alergias. Registrar estatus, agente, reacción, fuente y revisión con modelo aprobado.
Entrega al paciente/representante comprende cambios e instrucciones de continuidad. S411 orienta investigación en transiciones; no fija horario local.

## MED02 — Ordenar y firmar
Orden: identidad/atención, prescriptor real/privilegio, medicamento/presentación o concepto autorizado, dosis/unidad, vía, pauta, inicio/fin/revisión, indicación, prioridades y restricciones.
Soportar programada, única, PRN y continua con reglas propias. PRN necesita condiciones/intervalos/límites definidos clínicamente; no asumir permiso para repetir sin registro.
Suspender, modificar o detener crea versión/evento y comunica a farmacia/enfermería. Una orden reportada de otra institución no adquiere automáticamente autoridad local.
Orden verbal/urgente: capturar emisor, receptor, lectura de retorno/cofirma según protocolo, momento real y pendientes. No suplantar autor.
Rechazar falta de unidad/vía/pauta necesaria para ejecutar; texto adicional no reemplaza campos críticos.
Aceptación: versión nueva no modifica administraciones previas; profesional sin privilegio no firma mediante rol administrador técnico.

## MED03 — Validación farmacéutica
Cola por prioridad/servicio y dueño; validar medicamento, pauta, fuentes relevantes, alergias, duplicidad, condiciones clínicas necesarias, restricciones y disponibilidad.
Estados: pendiente, validada, requiere aclaración, rechazada, urgencia bajo protocolo. Validación vinculada a versión de orden/datos usados.
Farmacéutico documenta aclaración al prescriptor; sustitución exige autoridad y equivalencia/condiciones aprobadas, nunca por costo solamente.
No diseñar motor de recomendaciones clínicas sin base validada y gobernanza. Alertas se priorizan/monitorizan con razones de override cuando permitido.
Aceptación: cambiar orden después de validar dispara reevaluación relevante; falta de stock no altera silenciosamente tratamiento.

## MED04 — Reservar, preparar y dispensar
Reserva sobre lote/stock elegible; dispensación parcial conserva solicitado/entregado/pendiente y regla de límite para evitar exceso.
Preparación individual o lote de dosis conserva genealogía INV04, verificación, etiquetado y vida útil.
Dispensación enlaza versión de orden, paciente/atención o reposición autorizada de botiquín, cantidad, unidad, producto real, lotes, destino/custodia, ejecutor y verificador cuando proceda.
Etiqueta y documentación deben permanecer interpretables cuando concentración/presentación difieren de la orden original autorizada.
No equiparar “entregado al servicio” con “administrado al paciente”.
Aceptación: retransmisión no duplica salida; reservación simultánea no excede stock; lote retirado bloquea entrega aunque se validó antes.

## MED05 — Recibir y programar trabajo de enfermería
Receptor confirma entrega/custodia y discrepancias. Programa dosis/tareas a partir de pauta aprobada y momento real de inicio.
Calcular tareas con identificador estable/versionado; cambio de horario no borra omisiones ni crea doble dosis.
Asignar responsable por equipo/turno; entrega con pendientes/aceptación, paciente/ubicación actuales y versiones.
Una tarea vencida requiere evaluación clínica; no autorizar “ponerse al día” automáticamente.

## MED06 — Administrar y registrar
Verificar paciente y medicamento/presentación/pauta/vía/tiempo según política clínica. Barcode confirma correspondencia de códigos, no prueba concentración, preparación correcta ni ingestión.
Capturar momento efectivo y de registro, actor, orden/versionado, producto/lote/preparación, dosis/unidad y vía. Distinguir realizado, no realizado, rechazado por paciente, retenido clínicamente y error de registro.
PRN registra razón y respuesta/seguimiento según protocolo. Infusión registra inicio, pausas, cambios de velocidad, término y entrega de turno; no un único checkbox.
Dosis parcial registra magnitud efectiva y destino restante. Evento firmado/versionado; edición retrospectiva exige motivo y autoridad.
Los controles deben ser verificables también en contingencia; no cerrar tarea solo por escanear.

## MED07 — Omisión, suspensión y aclaración
Omisión por rechazo, falta de stock, condición clínica, orden detenida o impedimento operativo: motivo, responsable informado y siguiente acción.
Separar interrupción de infusión de suspensión de orden. Evento de suspensión tardío requiere reconciliar dosis preparadas/administradas y registrar temporalidad.
Notificación/acuse/escalamiento con responsables; periodicidad y ventanas se aprueban localmente.
Aceptación: “no administrada” no aumenta stock automáticamente; pendientes cambian de turno con dueño.

## MED08 — Devolver, desperdiciar y corregir
Retorno físico: vínculo a dispensación, cantidad/unidad, estado/envase/condiciones, entregante/receptor e inspección. No volver a disponible sin liberación competente.
Desperdicio: cantidad, motivo, ubicación/propietario, evidencia y testigo cuando lo exija norma/política. Recipiente parcialmente usado no se trata como unidad intacta.
Corrección clínica de un registro: adenda o evento entered-in-error con evidencia; efecto físico/económico requiere eventos propios y conciliación.
Cargo ya facturado: flujo de ajuste/documento fiscal pertinente, no eliminación de movimiento de stock.
Aceptación: devolver no supera saldo bajo custodia; producto administrado no puede registrarse como retorno reutilizable.

## MED09 — Medicación aportada y alta
Medicamento propio del paciente: verificar identidad/calidad/concentración/procedencia según protocolo; custodia y autorización de uso; valoración/pagador separados.
No sumarlo a existencias propias ni facturarlo como comprado por el hospital.
Alta: conciliación de tratamiento, suministro domiciliario si procede, devolución de sobrantes según política, documentos y responsable de seguimiento.
Órdenes de hospitalización no se convierten automáticamente en receta ambulatoria.
Aceptación: entrega postalta es dispensación distinta; eventos pendientes conservan dueño.

## MED10 — Riesgo, farmacovigilancia y contingencia
Incidente clínico, sospecha de reacción, problema de calidad y desvío de controlado son casos diferentes vinculables.
Ruta de asistencia inmediata y reporte interno; notificación externa con mecanismo/campos/plazos vigentes por confirmar.
Caída: identificación segura, registro de autor/orden/dosis/tiempo y custodia; recuperación deduplica registros sin falsificar momento efectivo. Desconocido permanece incierto hasta revisión.
Monitorear overrides, códigos ilegibles, dosis omitidas, duplicación y carga de registro. S412–S414 describen estudios y límites del barcode; no se promete cero errores.

