# Atención, periodo de cuidado, estancia y cuenta
Contrato de dominio candidato. La palabra episodio debe tener una definición local explícita.

FHIR Encounter describe contacto asistencial y EpisodeOfCare una responsabilidad de cuidado que puede agrupar contactos [S302/S303]. Se usan como referencias de semántica, no esquema de BD obligatorio.

## Entidades y relaciones
| Entidad | Significado local candidato | Cardinalidad/regla |
|---|---|---|
| Cita | Reserva de atención y recursos | Puede cancelarse sin atención; una atención puede ser no programada |
| Atención | Contacto ambulatorio/urgencias/hospitalización, actores, tiempos y lugar | Siempre identidad resuelta/provisional y organización; IDs no basados en documento |
| Periodo de cuidado | Seguimiento de problema/programa entre contactos | Opcional, con inicio/fin/responsable |
| Estancia/segmento de ubicación | Tiempo físico en cama/área | Múltiples segmentos; conservar historia de traslados |
| Orden/tarea/resultado | Petición, ejecución y evidencia | Vínculos a atención y responsables; estados independientes |
| Cuenta | Acumulación y distribución económica | Puede cubrir varias atenciones según contrato; pagadores/versiones separados |
| Documento fiscal | Evidencia fiscal emitida por entidad | No editar receptor retrospectivamente con merge |
| Pendiente de continuidad | Trabajo aún abierto después del contacto | Dueño, prioridad, vencimiento aprobado, entrega/acuse |

No usar AppointmentId nullable como única prueba de vínculo. No forzar toda atención a una cama. Un reingreso no debe sobrescribir la estancia previa.

## AT01 — Crear y comenzar atención
Disparador: llegada confirmada, atención no programada o ingreso autorizado.
Validar identidad, contexto, tipo, organización, actor y permiso. Reutilizar una solicitud ya procesada mediante idempotencia; si hay dos contactos reales, mantenerlos distintos.
Registrar tiempos asistenciales y de captura. La demora de digitación no cambia por sí sola la fecha clínica.
Estados candidatos: prevista, llegada, en curso, suspendida, finalizada, cancelada, registrada por error. Las transiciones no son necesariamente iguales en todos los servicios; perfil local las restringe.
No convertir ausencia a cita en alta médica. Identidad provisional permite continuidad conforme a protocolo aprobado.
Aceptación: origen estable; doble click no crea dos atenciones; atención de urgencia no exige cita/cama.

## AT02 — Trasladar
Solicitar destino → confirmar disponibilidad/aceptación → preparar paciente/documentación → ejecutar → entregar → confirmar recepción.
Registrar orden clínica y cambio físico por separado si momentos difieren. Destino rechazado mantiene dueño actual; no crear una ubicación “por intención” como si se ejecutó.
Actualizar segmentos temporalmente sin solapamiento indebido; reserva/ocupación con exclusión durable.
Aceptación: entrega no desaparece al cambiar BedId; dos pacientes no ocupan la misma cama simultáneamente según política.

## AT03 — Finalizar con trabajo pendiente
Registrar decisión médica, indicaciones, conciliación cuando corresponda, destino, responsable y documentos.
Egreso físico, atención finalizada, disponibilidad de cama, cierre de cuenta y aceptación fiscal son estados separados.
Órdenes/resultados pendientes requieren dueño postalta; resultado crítico corregido debe alcanzar receptor responsable. Un cambio de turno reasigna con acuse y escalamiento.
Cobro pendiente no borra la atención; alta física no implica saldo cero; cuenta cerrada no impide adenda clínica autorizada.
Aceptación: lista explícita de pendientes y responsables; cerrar atención no cancela silenciosamente orden ni elimina alerta.

## AT04 — Error de registro o retorno
Error de paciente, fecha o tipo de atención: procedimiento supervisado; conservar evidencia y corregir enlaces/documentos afectados.
Retorno real: nueva atención relacionada; no reabrir automáticamente para evitar factura o esconder reingreso.
Reapertura por documentación necesita motivo y permiso; no simula nueva atención. Reconciliar efectos económicos según estado.
Aceptación: indicadores distinguen retorno real/corrección administrativa/reapertura; documentos firmados conservados.

## CT01 — Asociar cuenta y pagadores
Al inicio o durante atención, crear/asociar cuenta según contrato, entidad facturante y política de agrupación.
Registrar paciente beneficiario y responsables separados; cobertura por periodo/servicio; autorización no es cobro garantizado.
Al cambiar pagador: reevaluar cargos aún no emitidos con versión; documentos ya emitidos se corrigen por workflow propio. No reescribir precio histórico.
Aceptación: toda deuda tiene responsable legal/económico definido o pendiente explícito; no atribuir automáticamente al paciente la glosa del seguro.

## Migración desde Aldara
Appointment conserva reserva. Admission conserva evidencia de estancia original y se mapea explícitamente. Consultation recibe vínculo a atención verificable; ClinicalRecord permanece contenedor longitudinal o se transforma según diseño.
Invoice migra como documento económico histórico, sin fabricar DTE ni Encounter ausente. Vinculación inferida por fecha/paciente queda sugerencia, nunca hecho confirmado.
Mantener IDs legacy y manifest; casos ambiguos a revisión. No aplicar migración en esta fase.

